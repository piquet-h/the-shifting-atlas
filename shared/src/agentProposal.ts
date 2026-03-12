/**
 * Proposal→Validate→Apply governance contract for write-lite agent sandbox (#701).
 * Agents propose; Azure Functions validate invariants and perform all canonical writes.
 * See docs/architecture/agentic-ai-and-mcp.md.
 */
import { z } from 'zod'

import { type ActionIntent, ActionIntentSchema } from './actionIntent.js'

// Structural world mutations (exits, locations) excluded until a later milestone.
export const PROPOSAL_ALLOWED_ACTION_TYPES = ['Ambience.Generate', 'Layer.Add', 'NPC.Dialogue'] as const
export type ProposalActionType = (typeof PROPOSAL_ALLOWED_ACTION_TYPES)[number]

// Players submit commands; only ai/npc/system actors may issue proposals.
export const ProposalActorKindSchema = z.enum(['ai', 'npc', 'system'])
export type ProposalActorKind = z.infer<typeof ProposalActorKindSchema>

export const ProposalActorSchema = z.object({
    kind: ProposalActorKindSchema,
    id: z.string().uuid().optional()
})
export type ProposalActor = z.infer<typeof ProposalActorSchema>

export const ProposedActionTypeSchema = z.enum(PROPOSAL_ALLOWED_ACTION_TYPES)

// global: scope is reserved for system/timer events — agents operate on loc: or player: only.
const PERMITTED_SCOPE_PATTERN = /^(loc|player):/

export const ProposedActionSchema = z.object({
    actionType: ProposedActionTypeSchema,
    scopeKey: z
        .string()
        .min(1)
        .refine((v) => PERMITTED_SCOPE_PATTERN.test(v), {
            message: 'Agent proposals must target a loc: or player: scope — global scope writes are not permitted'
        }),
    params: z.record(z.string(), z.unknown())
})
export type ProposedAction = z.infer<typeof ProposedActionSchema>

export const AgentProposalEnvelopeSchema = z.object({
    proposalId: z.string().uuid(),
    version: z.number().int().positive(),
    issuedUtc: z.string().datetime(),
    actor: ProposalActorSchema,
    /** Carried for traceability; not re-validated here. */
    intent: ActionIntentSchema.optional(),
    correlationId: z.string().uuid(),
    /** ID of the world event or request that triggered this proposal. */
    causationId: z.string().uuid().optional(),
    /** Use buildProposalIdempotencyKey() to compose consistently. */
    idempotencyKey: z.string().min(1),
    proposedActions: z.array(ProposedActionSchema).nonempty()
})
export type AgentProposalEnvelope = z.infer<typeof AgentProposalEnvelopeSchema>

export enum ProposalRejectionCode {
    MISSING_REQUIRED_PARAM = 'MISSING_REQUIRED_PARAM',
    OUT_OF_SCOPE = 'OUT_OF_SCOPE',
    DISALLOWED_ACTION_TYPE = 'DISALLOWED_ACTION_TYPE',
    SCHEMA_INVALID = 'SCHEMA_INVALID'
}

export interface ProposalRejectionReason {
    code: ProposalRejectionCode
    message: string
    actionType: ProposalActionType | string
}

export interface ProposalValidationResult {
    outcome: 'accepted' | 'rejected'
    proposalId: string
    rejectionReasons: ProposalRejectionReason[]
}

const PARAM_RULES: Record<ProposalActionType, (params: Record<string, unknown>) => ProposalRejectionReason[]> = {
    'Ambience.Generate': (params) => {
        const reasons: ProposalRejectionReason[] = []
        if (!params['locationId']) {
            reasons.push({
                code: ProposalRejectionCode.MISSING_REQUIRED_PARAM,
                message: 'Ambience.Generate requires params.locationId',
                actionType: 'Ambience.Generate'
            })
        }
        return reasons
    },
    'Layer.Add': (params) => {
        const reasons: ProposalRejectionReason[] = []
        if (!params['locationId']) {
            reasons.push({
                code: ProposalRejectionCode.MISSING_REQUIRED_PARAM,
                message: 'Layer.Add requires params.locationId',
                actionType: 'Layer.Add'
            })
        }
        if (!params['layerContent']) {
            reasons.push({
                code: ProposalRejectionCode.MISSING_REQUIRED_PARAM,
                message: 'Layer.Add requires params.layerContent',
                actionType: 'Layer.Add'
            })
        }
        return reasons
    },
    'NPC.Dialogue': (params) => {
        const reasons: ProposalRejectionReason[] = []
        if (!params['npcId']) {
            reasons.push({
                code: ProposalRejectionCode.MISSING_REQUIRED_PARAM,
                message: 'NPC.Dialogue requires params.npcId',
                actionType: 'NPC.Dialogue'
            })
        }
        return reasons
    }
}

function validateScope(action: ProposedAction): ProposalRejectionReason[] {
    if (!PERMITTED_SCOPE_PATTERN.test(action.scopeKey)) {
        return [
            {
                code: ProposalRejectionCode.OUT_OF_SCOPE,
                message: `Action ${action.actionType} targets disallowed scope '${action.scopeKey}'. Only loc: and player: scopes are permitted.`,
                actionType: action.actionType
            }
        ]
    }
    return []
}

// Never throws — callers check result.outcome.
export function validateAgentProposal(envelope: AgentProposalEnvelope): ProposalValidationResult {
    const allReasons: ProposalRejectionReason[] = []

    for (const action of envelope.proposedActions) {
        const scopeReasons = validateScope(action)
        if (scopeReasons.length > 0) {
            allReasons.push(...scopeReasons)
            continue
        }

        const paramValidator = PARAM_RULES[action.actionType as ProposalActionType]
        if (paramValidator) {
            allReasons.push(...paramValidator(action.params))
        }
    }

    return {
        outcome: allReasons.length === 0 ? 'accepted' : 'rejected',
        proposalId: envelope.proposalId,
        rejectionReasons: allReasons
    }
}

// Never throws — returns a discriminated union.
export function safeValidateAgentProposal(
    data: unknown
): { success: true; validationResult: ProposalValidationResult } | { success: false; schemaError: z.ZodError<unknown> } {
    const parsed = AgentProposalEnvelopeSchema.safeParse(data)
    if (!parsed.success) {
        return { success: false, schemaError: parsed.error }
    }
    return { success: true, validationResult: validateAgentProposal(parsed.data) }
}

// Format: proposal:<proposalId>:<actionType>:<scopeKey>
export function buildProposalIdempotencyKey(proposalId: string, actionType: string, scopeKey: string): string {
    return `proposal:${proposalId}:${actionType}:${scopeKey}`
}

// Persistence is a backend concern; this type is the wire shape only.
export interface RejectedProposalAuditRecord {
    proposalId: string
    proposal: AgentProposalEnvelope
    validationResult: ProposalValidationResult
    auditedUtc: string
}

// Re-export ActionIntent for consumers that import the full proposal surface
export type { ActionIntent }
