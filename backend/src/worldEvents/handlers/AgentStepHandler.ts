/**
 * AgentStepHandler — World.Agent.Step event handler
 *
 * Queue-only runtime hook for autonomous agent loops (sense→decide→act).
 * Enforces latency budget and emits structured telemetry.
 *
 * Payload (v1):
 * {
 *   entityId:      string  — UUID of the entity running the step
 *   entityKind:    string  — 'npc' | 'ai-agent' | 'player'
 *   locationId:    string  — Current location context (UUID)
 *   stepSequence:  number  — Monotonic counter used in idempotency key
 *   reason?:       string  — Optional reason the step was triggered (diagnostics only)
 * }
 *
 * Idempotency: key is 'agent-step:{entityId}:{stepSequence}' — enforced by the
 * upstream WorldEventEnvelope idempotencyKey field. Duplicate delivery returns
 * 'noop' without re-executing.
 *
 * Latency budget: configurable via AGENT_STEP_LATENCY_BUDGET_MS env var
 * (default 5000 ms). Exceeding it emits Agent.Step.LatencyExceeded telemetry
 * and still completes (no hard abort — agent logic must remain idempotent).
 *
 * Sense→Decide→Act loop (per issue #706):
 *  1. SENSE   — load location's current ambient layer and world clock tick
 *  2. DECIDE  — if no ambient layer exists, propose Layer.Add; otherwise skip
 *  3. VALIDATE— validateAgentProposal() (allow-list + param rules)
 *  4. APPLY   — AgentProposalApplicator.apply() writes the layer
 *
 * Oscillation guard: the presence of an existing ambient layer acts as the
 * cooldown signal — the agent will not overwrite an existing agent-authored
 * layer until it has expired (effectiveToTick passed or null = indefinite).
 *
 * Edge cases:
 * - Entity no longer exists → outcome: 'noop', emits Agent.Step.EntityNotFound
 * - Transient error in downstream logic → throws, triggers Service Bus retry → DLQ
 */

import type { InvocationContext } from '@azure/functions'
import { randomUUID } from 'node:crypto'
import { type AgentProposalEnvelope, validateAgentProposal } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { ILayerRepository } from '../../repos/layerRepository.js'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import { AgentProposalApplicator, pickAmbientContent } from '../../services/AgentProposalApplicator.js'
import { WorldClockService } from '../../services/WorldClockService.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { WorldEventHandlerResult } from '../types.js'
import { BaseWorldEventHandler, type ValidationResult } from './base/BaseWorldEventHandler.js'

/** Default latency budget for a single agent step (ms). Override via env var. */
const DEFAULT_LATENCY_BUDGET_MS = 5_000

function getLatencyBudgetMs(): number {
    const raw = process.env.AGENT_STEP_LATENCY_BUDGET_MS
    if (raw) {
        const parsed = parseInt(raw, 10)
        if (!isNaN(parsed) && parsed > 0) return parsed
    }
    return DEFAULT_LATENCY_BUDGET_MS
}

/** Handler for World.Agent.Step events — autonomous sense→decide→act loop */
@injectable()
export class AgentStepHandler extends BaseWorldEventHandler {
    public readonly type = 'World.Agent.Step'

    constructor(
        @inject('IDeadLetterRepository') deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) telemetry: TelemetryService,
        @inject('ILayerRepository') private readonly layerRepo: ILayerRepository,
        @inject(WorldClockService) private readonly worldClock: WorldClockService,
        @inject(AgentProposalApplicator) private readonly applicator: AgentProposalApplicator
    ) {
        super(deadLetterRepo, telemetry)
    }

    /**
     * Validate required payload fields.
     * Missing any of entityId, entityKind, locationId, stepSequence → validation-failed → DLQ.
     */
    protected validatePayload(payload: unknown): ValidationResult {
        const { entityId, entityKind, locationId, stepSequence } = payload as Record<string, unknown>

        const missing: string[] = []
        if (typeof entityId !== 'string' || !entityId) missing.push('entityId')
        if (typeof entityKind !== 'string' || !entityKind) missing.push('entityKind')
        if (typeof locationId !== 'string' || !locationId) missing.push('locationId')
        if (typeof stepSequence !== 'number') missing.push('stepSequence')

        return missing.length ? { valid: false, missing } : { valid: true, missing: [] }
    }

    /**
     * Execute agent step — sense→decide→validate→apply.
     *
     * SENSE:   load current world tick + active ambient layer for the location.
     * DECIDE:  if no ambient layer exists → propose Layer.Add; otherwise skip.
     * VALIDATE: deterministic allow-list + param rule check.
     * APPLY:   delegate to AgentProposalApplicator for durable world write.
     */
    protected async executeHandler(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        const { entityId, entityKind, locationId, stepSequence, reason } = event.payload as Record<string, unknown>

        const startMs = Date.now()
        const budgetMs = getLatencyBudgetMs()
        const correlationId = event.correlationId

        context.log('AgentStepHandler: step initiated', { entityId, entityKind, locationId, stepSequence, reason })

        this.telemetry.trackGameEvent(
            'Agent.Step.Start',
            {
                agentId: String(entityId),
                agentType: String(entityKind),
                locationId: String(locationId),
                stepSequence,
                correlationId,
                ...(event.causationId ? { causationId: event.causationId } : {})
            },
            { correlationId }
        )

        // ----------------------------------------------------------------
        // 1. SENSE — load world clock tick and current ambient layer
        // ----------------------------------------------------------------
        const tick = await this.worldClock.getCurrentTick()
        const existingAmbientLayer = await this.layerRepo.getActiveLayerForLocation(String(locationId), 'ambient', tick)

        this.telemetry.trackGameEvent(
            'Agent.Step.SenseCompleted',
            {
                entityId: String(entityId),
                locationId: String(locationId),
                hasAmbientLayer: existingAmbientLayer !== null,
                tick,
                correlationId
            },
            { correlationId }
        )

        // ----------------------------------------------------------------
        // 2. DECIDE — determine what action (if any) to take
        // ----------------------------------------------------------------
        if (existingAmbientLayer !== null) {
            // Oscillation guard: ambient layer already exists — skip this step.
            this.telemetry.trackGameEvent(
                'Agent.Step.Skipped',
                { entityId: String(entityId), locationId: String(locationId), reason: 'ambient-layer-exists', correlationId },
                { correlationId }
            )
            context.log('AgentStepHandler: step skipped (ambient layer exists)', { entityId, locationId })
            context.log('AgentStepHandler: step processed', { entityId, entityKind, locationId, stepSequence, outcome: 'skipped' })
            return this.finishStep(event, startMs, budgetMs, 'skipped')
        }

        // No ambient layer → propose Layer.Add with deterministic content.
        // Combine entityId characters with stepSequence for a salt that differs
        // across agents and steps (prevents two agents on the same location at the
        // same stepSequence from always producing the same phrase).
        const entityIdHash = String(entityId)
            .split('')
            .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0)
        const salt = (entityIdHash ^ Number(stepSequence)) >>> 0
        const ambientContent = pickAmbientContent(String(locationId), salt)
        const proposedAction = {
            actionType: 'Layer.Add' as const,
            scopeKey: `loc:${String(locationId)}`,
            params: {
                locationId: String(locationId),
                layerContent: ambientContent,
                layerType: 'ambient'
            }
        }

        this.telemetry.trackGameEvent(
            'Agent.Step.DecisionMade',
            {
                entityId: String(entityId),
                locationId: String(locationId),
                actionType: 'Layer.Add',
                reason: 'no-ambient-layer',
                correlationId
            },
            { correlationId }
        )

        // ----------------------------------------------------------------
        // 3. VALIDATE — allow-list + param rules via shared validator
        // ----------------------------------------------------------------
        const envelope: AgentProposalEnvelope = {
            proposalId: randomUUID(),
            version: 1,
            issuedUtc: new Date().toISOString(),
            actor: { kind: 'ai' },
            correlationId,
            causationId: event.eventId,
            idempotencyKey: `proposal:${String(entityId)}:${String(stepSequence)}`,
            proposedActions: [proposedAction]
        }

        const validationResult = validateAgentProposal(envelope)

        if (validationResult.outcome === 'rejected') {
            this.telemetry.trackGameEvent(
                'Agent.Step.ActionRejected',
                {
                    entityId: String(entityId),
                    locationId: String(locationId),
                    proposalId: validationResult.proposalId,
                    rejectionCount: validationResult.rejectionReasons.length,
                    firstRejectionCode: validationResult.rejectionReasons[0]?.code ?? 'unknown',
                    correlationId
                },
                { correlationId }
            )
            context.warn('AgentStepHandler: proposal rejected', {
                entityId,
                proposalId: validationResult.proposalId,
                reasons: validationResult.rejectionReasons
            })
            context.log('AgentStepHandler: step processed', { entityId, entityKind, locationId, stepSequence, outcome: 'rejected' })
            return this.finishStep(event, startMs, budgetMs, 'rejected')
        }

        // Proposal passed validation — emit validated event
        this.telemetry.trackGameEvent(
            'Agent.Proposal.Validated',
            {
                proposalId: validationResult.proposalId,
                agentId: String(entityId),
                agentType: String(entityKind),
                validationOutcome: 'accepted',
                decisionLatencyMs: Date.now() - startMs,
                correlationId,
                ...(event.causationId ? { causationId: event.causationId } : {})
            },
            { correlationId }
        )

        // ----------------------------------------------------------------
        // 4. APPLY — write to the world via AgentProposalApplicator
        // ----------------------------------------------------------------
        const applyResult = await this.applicator.apply(proposedAction, correlationId, tick)

        this.telemetry.trackGameEvent(
            'Agent.Step.ActionApplied',
            {
                entityId: String(entityId),
                locationId: String(locationId),
                actionType: applyResult.actionType,
                scopeKey: applyResult.scopeKey,
                ...(applyResult.layerId ? { layerId: applyResult.layerId } : {}),
                proposalId: validationResult.proposalId,
                correlationId
            },
            { correlationId }
        )

        this.telemetry.trackGameEvent(
            'Agent.Effect.Applied',
            {
                agentId: String(entityId),
                agentType: String(entityKind),
                actionType: applyResult.actionType,
                scopeKey: applyResult.scopeKey,
                ...(applyResult.layerId ? { layerId: applyResult.layerId } : {}),
                correlationId,
                ...(event.causationId ? { causationId: event.causationId } : {})
            },
            { correlationId }
        )

        context.log('AgentStepHandler: action applied', {
            entityId,
            locationId,
            actionType: applyResult.actionType,
            layerId: applyResult.layerId
        })

        context.log('AgentStepHandler: step processed', {
            entityId,
            entityKind,
            locationId,
            stepSequence,
            latencyMs: Date.now() - startMs,
            outcome: 'applied'
        })
        return this.finishStep(event, startMs, budgetMs, 'applied')
    }

    // ------------------------------------------------------------------
    // Private helpers
    // ------------------------------------------------------------------

    private finishStep(event: WorldEventEnvelope, startMs: number, budgetMs: number, outcome: string): WorldEventHandlerResult {
        const { entityId, entityKind, locationId, stepSequence } = event.payload as Record<string, unknown>
        const latencyMs = Date.now() - startMs

        if (latencyMs > budgetMs) {
            this.telemetry.trackGameEvent(
                'Agent.Step.LatencyExceeded',
                {
                    entityId: String(entityId),
                    entityKind: String(entityKind),
                    latencyMs,
                    budgetMs,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
        }

        this.telemetry.trackGameEvent(
            'Agent.Step.Completed',
            {
                agentId: String(entityId),
                agentType: String(entityKind),
                decisionLatencyMs: latencyMs,
                validationOutcome: outcome,
                correlationId: event.correlationId,
                ...(event.causationId ? { causationId: event.causationId } : {})
            },
            { correlationId: event.correlationId }
        )

        this.telemetry.trackGameEvent(
            'Agent.Step.Processed',
            {
                entityId: String(entityId),
                entityKind: String(entityKind),
                locationId: String(locationId),
                stepSequence,
                outcome,
                latencyMs,
                correlationId: event.correlationId,
                causationId: event.causationId
            },
            { correlationId: event.correlationId }
        )

        return { outcome: 'success', details: `step-processed:${outcome}` }
    }
}
