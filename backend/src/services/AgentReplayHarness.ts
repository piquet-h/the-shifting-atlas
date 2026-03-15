/**
 * AgentReplayHarness — replay harness for agent runs.
 *
 * Reproduces an agent run from stored proposal records and event logs.
 * Enables deterministic replay of agent decisions and applied effects for
 * debugging emergent behavior.
 *
 * Usage pattern:
 * 1. Collect AgentProposalEnvelope records from a prior run (telemetry, logs, or tests).
 * 2. Create ProposalRecord entries with optional tick and expectedEffects.
 * 3. Call replaySequence() to re-run the validation+apply pipeline.
 * 4. Inspect ReplayReport for diffs, correlation chains, and failure reasons.
 *
 * Edge cases handled:
 * - Missing (null/undefined) proposal records → schema-invalid step with failureReason
 * - Schema-invalid proposal data → schema-invalid step with failureReason
 * - Business rule rejections → rejected step with rejectionReasons
 * - Duplicate idempotency keys → counted in duplicateDeliveries
 * - Broken causation chains → surfaced in correlationChain
 */

import { AgentProposalEnvelopeSchema, validateAgentProposal } from '@piquet-h/shared'
import type { AgentProposalEnvelope, ProposalRejectionReason } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { AgentProposalApplicator, type ActionApplicationResult } from './AgentProposalApplicator.js'

// -------------------------------------------------------------------------
// Public types
// -------------------------------------------------------------------------

/** An effect we expect a proposal to produce — used for diff computation. */
export interface ExpectedEffect {
    actionType: string
    scopeKey: string
    applied: boolean
}

/** Diff entry comparing an expected effect against the actual result. */
export interface EffectDiff {
    actionType: string
    scopeKey: string
    expectedApplied: boolean
    actualApplied: boolean
    /** True when expectedApplied === actualApplied. */
    match: boolean
}

/** A single stored proposal record, optionally annotated with expected effects. */
export interface ProposalRecord {
    /** The raw proposal envelope (may be unknown / malformed — the harness validates it). */
    proposal: AgentProposalEnvelope | unknown
    /** World-clock tick to use when applying the proposal. */
    tick: number
    /** Optional expected effects for diff computation. */
    expectedEffects?: ExpectedEffect[]
}

/** Per-step result from replaying a single ProposalRecord. */
export interface StepReplayResult {
    stepIndex: number
    proposalId: string
    correlationId?: string
    causationId?: string
    /** Outcome of validation + application for this step. */
    validationOutcome: 'accepted' | 'rejected' | 'schema-invalid'
    /** Present when validationOutcome === 'rejected'. */
    rejectionReasons?: ProposalRejectionReason[]
    /** All ActionApplicationResults produced (empty when rejected or schema-invalid). */
    appliedEffects: ActionApplicationResult[]
    /** Present when ProposalRecord.expectedEffects was provided. */
    diffs?: EffectDiff[]
    /** Human-readable reason string for rejected / schema-invalid steps. */
    failureReason?: string
}

/** Correlation chain entry linking correlationId to its causationId. */
export interface CorrelationChainEntry {
    correlationId: string
    causationId?: string
}

/** Full report produced by replaySequence(). */
export interface ReplayReport {
    totalSteps: number
    /** Steps where all actions were accepted and applied. */
    successCount: number
    /** Steps where the proposal passed schema validation but failed business rules. */
    rejectedCount: number
    /** Steps where the proposal could not be parsed (missing record or schema error). */
    schemaErrorCount: number
    /** Number of records sharing an idempotency key with a previous record. */
    duplicateDeliveries: number
    steps: StepReplayResult[]
    /** All correlationId / causationId pairs, in step order. */
    correlationChain: CorrelationChainEntry[]
    /** Human-readable failure reasons, one entry per rejected / schema-invalid step. */
    failureReasons: string[]
}

// -------------------------------------------------------------------------
// Implementation
// -------------------------------------------------------------------------

@injectable()
export class AgentReplayHarness {
    constructor(@inject(AgentProposalApplicator) private readonly applicator: AgentProposalApplicator) {}

    /**
     * Replay a sequence of proposal records through the validation+apply pipeline.
     *
     * Each record is:
     *  1. Schema-validated via AgentProposalEnvelopeSchema (handles unknown / null input)
     *  2. Business-rule validated via validateAgentProposal()
     *  3. Applied via AgentProposalApplicator for each accepted action
     *  4. Diffed against expectedEffects when provided
     *
     * @returns A ReplayReport summarizing all steps.
     */
    async replaySequence(records: ProposalRecord[]): Promise<ReplayReport> {
        const steps: StepReplayResult[] = []
        const correlationChain: CorrelationChainEntry[] = []
        const failureReasons: string[] = []
        const seenIdempotencyKeys = new Set<string>()

        let successCount = 0
        let rejectedCount = 0
        let schemaErrorCount = 0
        let duplicateDeliveries = 0

        for (let i = 0; i < records.length; i++) {
            const record = records[i]

            // ----------------------------------------------------------------
            // Handle missing / null records
            // ----------------------------------------------------------------
            if (record == null || record.proposal == null) {
                const failureReason = `Step ${i}: no proposal record provided`
                const step: StepReplayResult = {
                    stepIndex: i,
                    proposalId: `<missing-step-${i}>`,
                    validationOutcome: 'schema-invalid',
                    appliedEffects: [],
                    failureReason
                }
                steps.push(step)
                schemaErrorCount++
                failureReasons.push(failureReason)
                continue
            }

            // ----------------------------------------------------------------
            // Schema validation
            // ----------------------------------------------------------------
            const parsed = AgentProposalEnvelopeSchema.safeParse(record.proposal)
            if (!parsed.success) {
                const firstIssue = parsed.error.issues[0]?.message ?? 'schema validation failed'
                const rawProposal = record.proposal as Record<string, unknown>
                const proposalId = typeof rawProposal['proposalId'] === 'string' ? rawProposal['proposalId'] : `<invalid-step-${i}>`
                const failureReason = `Step ${i}: schema invalid — ${firstIssue}`
                const step: StepReplayResult = {
                    stepIndex: i,
                    proposalId,
                    validationOutcome: 'schema-invalid',
                    appliedEffects: [],
                    failureReason
                }
                steps.push(step)
                schemaErrorCount++
                failureReasons.push(failureReason)
                continue
            }

            const envelope = parsed.data

            // ----------------------------------------------------------------
            // Duplicate idempotency key detection
            // ----------------------------------------------------------------
            if (seenIdempotencyKeys.has(envelope.idempotencyKey)) {
                duplicateDeliveries++
            } else {
                seenIdempotencyKeys.add(envelope.idempotencyKey)
            }

            // ----------------------------------------------------------------
            // Track correlation chain
            // ----------------------------------------------------------------
            correlationChain.push({
                correlationId: envelope.correlationId,
                causationId: envelope.causationId
            })

            // ----------------------------------------------------------------
            // Business rule validation
            // ----------------------------------------------------------------
            const validationResult = validateAgentProposal(envelope)

            if (validationResult.outcome === 'rejected') {
                const reasonMessages = validationResult.rejectionReasons.map((r) => r.message).join('; ')
                const failureReason = `Step ${i} (${envelope.proposalId}): rejected — ${reasonMessages}`
                const step: StepReplayResult = {
                    stepIndex: i,
                    proposalId: envelope.proposalId,
                    correlationId: envelope.correlationId,
                    causationId: envelope.causationId,
                    validationOutcome: 'rejected',
                    rejectionReasons: validationResult.rejectionReasons,
                    appliedEffects: [],
                    diffs: record.expectedEffects ? this.computeDiffs(record.expectedEffects, []) : undefined,
                    failureReason
                }
                steps.push(step)
                rejectedCount++
                failureReasons.push(failureReason)
                continue
            }

            // ----------------------------------------------------------------
            // Apply all actions
            // ----------------------------------------------------------------
            const appliedEffects: ActionApplicationResult[] = []
            for (const action of envelope.proposedActions) {
                const result = await this.applicator.apply(action, envelope.correlationId, record.tick)
                appliedEffects.push(result)
            }

            const step: StepReplayResult = {
                stepIndex: i,
                proposalId: envelope.proposalId,
                correlationId: envelope.correlationId,
                causationId: envelope.causationId,
                validationOutcome: 'accepted',
                appliedEffects,
                diffs: record.expectedEffects ? this.computeDiffs(record.expectedEffects, appliedEffects) : undefined
            }
            steps.push(step)
            successCount++
        }

        return {
            totalSteps: records.length,
            successCount,
            rejectedCount,
            schemaErrorCount,
            duplicateDeliveries,
            steps,
            correlationChain,
            failureReasons
        }
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    /**
     * Compute diffs between expected and actual effects.
     * For each expected effect, find the matching actual effect (by actionType + scopeKey)
     * and compare the `applied` flag.
     */
    private computeDiffs(expected: ExpectedEffect[], actual: ActionApplicationResult[]): EffectDiff[] {
        return expected.map((exp) => {
            const match = actual.find((a) => a.actionType === exp.actionType && a.scopeKey === exp.scopeKey)
            const actualApplied = match?.applied ?? false
            return {
                actionType: exp.actionType,
                scopeKey: exp.scopeKey,
                expectedApplied: exp.applied,
                actualApplied,
                match: exp.applied === actualApplied
            }
        })
    }
}
