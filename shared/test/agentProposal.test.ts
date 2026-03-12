import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import {
    AgentProposalEnvelopeSchema,
    PROPOSAL_ALLOWED_ACTION_TYPES,
    ProposalRejectionCode,
    buildProposalIdempotencyKey,
    safeValidateAgentProposal,
    validateAgentProposal,
    type AgentProposalEnvelope,
    type ProposalValidationResult,
    type RejectedProposalAuditRecord
} from '../src/index.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_PROPOSAL: AgentProposalEnvelope = {
    proposalId: '11111111-1111-4111-8111-111111111111',
    version: 1,
    issuedUtc: '2026-03-12T10:00:00.000Z',
    actor: { kind: 'ai', id: '22222222-2222-4222-8222-222222222222' },
    intent: {
        rawInput: 'generate ambient description for the marketplace',
        parsedIntent: { verb: 'generate' },
        validationResult: { success: true }
    },
    correlationId: '33333333-3333-4333-8333-333333333333',
    idempotencyKey: 'proposal:11111111-1111-4111-8111-111111111111:Ambience.Generate:loc:44444444-4444-4444-8444-444444444444',
    proposedActions: [
        {
            actionType: 'Ambience.Generate',
            scopeKey: 'loc:44444444-4444-4444-8444-444444444444',
            params: { locationId: '44444444-4444-4444-8444-444444444444' }
        }
    ]
}

const omit = <T extends object, K extends keyof T>(obj: T, ...keys: K[]): Omit<T, K> => {
    const copy = { ...obj } as T
    for (const k of keys) delete copy[k]
    return copy
}

// ---------------------------------------------------------------------------
// Envelope schema tests
// ---------------------------------------------------------------------------

describe('AgentProposalEnvelope schema', () => {
    it('valid proposal passes schema validation', () => {
        const result = AgentProposalEnvelopeSchema.safeParse(BASE_PROPOSAL)
        assert.equal(result.success, true)
    })

    it('missing proposalId fails', () => {
        assert.equal(AgentProposalEnvelopeSchema.safeParse(omit(BASE_PROPOSAL, 'proposalId')).success, false)
    })

    it('non-UUID proposalId fails', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({ ...BASE_PROPOSAL, proposalId: 'not-a-uuid' })
        assert.equal(result.success, false)
    })

    it('missing idempotencyKey fails', () => {
        assert.equal(AgentProposalEnvelopeSchema.safeParse(omit(BASE_PROPOSAL, 'idempotencyKey')).success, false)
    })

    it('empty idempotencyKey fails', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({ ...BASE_PROPOSAL, idempotencyKey: '' })
        assert.equal(result.success, false)
    })

    it('player actor kind is rejected (proposals are agent-only)', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({
            ...BASE_PROPOSAL,
            actor: { kind: 'player', id: '55555555-5555-4555-8555-555555555555' }
        })
        assert.equal(result.success, false)
    })

    it('ai actor without id is allowed', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({
            ...BASE_PROPOSAL,
            actor: { kind: 'ai' }
        })
        assert.equal(result.success, true)
    })

    it('empty proposedActions array fails', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({ ...BASE_PROPOSAL, proposedActions: [] })
        assert.equal(result.success, false)
    })

    it('optional causationId accepts valid UUID', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({
            ...BASE_PROPOSAL,
            causationId: '66666666-6666-4666-8666-666666666666'
        })
        assert.equal(result.success, true)
    })

    it('non-UUID causationId fails', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({ ...BASE_PROPOSAL, causationId: 'bad-id' })
        assert.equal(result.success, false)
    })

    it('optional intent field can be omitted', () => {
        assert.equal(AgentProposalEnvelopeSchema.safeParse(omit(BASE_PROPOSAL, 'intent')).success, true)
    })
})

// ---------------------------------------------------------------------------
// ProposedAction allow-list tests
// ---------------------------------------------------------------------------

describe('ProposedAction allow-list', () => {
    it('Ambience.Generate action passes schema', () => {
        const result = AgentProposalEnvelopeSchema.safeParse(BASE_PROPOSAL)
        assert.equal(result.success, true)
    })

    it('Layer.Add action passes schema', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({
            ...BASE_PROPOSAL,
            proposedActions: [
                {
                    actionType: 'Layer.Add',
                    scopeKey: 'loc:44444444-4444-4444-8444-444444444444',
                    params: {
                        locationId: '44444444-4444-4444-8444-444444444444',
                        layerContent: 'The marketplace smells of spices',
                        layerKind: 'ambient'
                    }
                }
            ]
        })
        assert.equal(result.success, true)
    })

    it('NPC.Dialogue action passes schema', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({
            ...BASE_PROPOSAL,
            proposedActions: [
                {
                    actionType: 'NPC.Dialogue',
                    scopeKey: 'loc:44444444-4444-4444-8444-444444444444',
                    params: { npcId: '77777777-7777-4777-8777-777777777777' }
                }
            ]
        })
        assert.equal(result.success, true)
    })

    it('unknown action type fails schema (allow-list enforced at schema level)', () => {
        const result = AgentProposalEnvelopeSchema.safeParse({
            ...BASE_PROPOSAL,
            proposedActions: [
                {
                    actionType: 'World.Exit.Create', // not in write-lite allow-list
                    scopeKey: 'loc:44444444-4444-4444-8444-444444444444',
                    params: {}
                }
            ]
        })
        assert.equal(result.success, false)
    })

    it('PROPOSAL_ALLOWED_ACTION_TYPES contains all expected types', () => {
        assert.ok(PROPOSAL_ALLOWED_ACTION_TYPES.includes('Ambience.Generate'))
        assert.ok(PROPOSAL_ALLOWED_ACTION_TYPES.includes('Layer.Add'))
        assert.ok(PROPOSAL_ALLOWED_ACTION_TYPES.includes('NPC.Dialogue'))
        assert.equal(PROPOSAL_ALLOWED_ACTION_TYPES.length, 3)
    })
})

// ---------------------------------------------------------------------------
// Validator — structural / param-bounds tests
// ---------------------------------------------------------------------------

describe('validateAgentProposal', () => {
    it('valid proposal returns accepted outcome', () => {
        const result: ProposalValidationResult = validateAgentProposal(BASE_PROPOSAL)
        assert.equal(result.outcome, 'accepted')
        assert.equal(result.proposalId, BASE_PROPOSAL.proposalId)
        assert.equal(result.rejectionReasons.length, 0)
    })

    it('Ambience.Generate missing locationId produces structured rejection reason', () => {
        const bad: AgentProposalEnvelope = {
            ...BASE_PROPOSAL,
            proposedActions: [
                {
                    actionType: 'Ambience.Generate',
                    scopeKey: 'loc:44444444-4444-4444-8444-444444444444',
                    params: {} as Record<string, unknown> // missing locationId
                }
            ]
        }
        const result = validateAgentProposal(bad)
        assert.equal(result.outcome, 'rejected')
        assert.ok(result.rejectionReasons.length > 0)
        assert.ok(result.rejectionReasons[0].code === ProposalRejectionCode.MISSING_REQUIRED_PARAM)
    })

    it('Layer.Add missing layerContent produces structured rejection', () => {
        const bad: AgentProposalEnvelope = {
            ...BASE_PROPOSAL,
            proposedActions: [
                {
                    actionType: 'Layer.Add',
                    scopeKey: 'loc:44444444-4444-4444-8444-444444444444',
                    params: { locationId: '44444444-4444-4444-8444-444444444444', layerKind: 'ambient' } as Record<string, unknown>
                }
            ]
        }
        const result = validateAgentProposal(bad)
        assert.equal(result.outcome, 'rejected')
        assert.equal(result.rejectionReasons[0].code, ProposalRejectionCode.MISSING_REQUIRED_PARAM)
    })

    it('rejection reasons include action-level context for telemetry', () => {
        const bad: AgentProposalEnvelope = {
            ...BASE_PROPOSAL,
            proposedActions: [
                {
                    actionType: 'Ambience.Generate',
                    scopeKey: 'loc:44444444-4444-4444-8444-444444444444',
                    params: {} as Record<string, unknown>
                }
            ]
        }
        const result = validateAgentProposal(bad)
        assert.equal(result.outcome, 'rejected')
        const reason = result.rejectionReasons[0]
        assert.ok('code' in reason)
        assert.ok('message' in reason)
        assert.ok('actionType' in reason)
    })

    it('out-of-scope scopeKey pattern is rejected', () => {
        const bad: AgentProposalEnvelope = {
            ...BASE_PROPOSAL,
            proposedActions: [
                {
                    actionType: 'Ambience.Generate',
                    scopeKey: 'global:tick', // agents cannot propose on global scope
                    params: { locationId: '44444444-4444-4444-8444-444444444444' }
                }
            ]
        }
        const result = validateAgentProposal(bad)
        assert.equal(result.outcome, 'rejected')
        assert.equal(result.rejectionReasons[0].code, ProposalRejectionCode.OUT_OF_SCOPE)
    })

    it('safeValidateAgentProposal returns success/error tuple, never throws', () => {
        const result = safeValidateAgentProposal(BASE_PROPOSAL)
        assert.equal(result.success, true)
        if (result.success) {
            assert.equal(result.validationResult.outcome, 'accepted')
        }
    })

    it('safeValidateAgentProposal with invalid schema input returns false without throwing', () => {
        const result = safeValidateAgentProposal({ not: 'valid' })
        assert.equal(result.success, false)
    })
})

// ---------------------------------------------------------------------------
// Idempotency key composition
// ---------------------------------------------------------------------------

describe('buildProposalIdempotencyKey', () => {
    it('produces deterministic key for same inputs', () => {
        const key1 = buildProposalIdempotencyKey(
            '11111111-1111-4111-8111-111111111111',
            'Ambience.Generate',
            'loc:44444444-4444-4444-8444-444444444444'
        )
        const key2 = buildProposalIdempotencyKey(
            '11111111-1111-4111-8111-111111111111',
            'Ambience.Generate',
            'loc:44444444-4444-4444-8444-444444444444'
        )
        assert.equal(key1, key2)
    })

    it('produces different keys for different action types', () => {
        const key1 = buildProposalIdempotencyKey('id', 'Ambience.Generate', 'loc:abc')
        const key2 = buildProposalIdempotencyKey('id', 'Layer.Add', 'loc:abc')
        assert.notEqual(key1, key2)
    })

    it('produces different keys for different scope keys', () => {
        const key1 = buildProposalIdempotencyKey('id', 'Ambience.Generate', 'loc:abc')
        const key2 = buildProposalIdempotencyKey('id', 'Ambience.Generate', 'loc:def')
        assert.notEqual(key1, key2)
    })

    it('key includes proposalId, actionType, and scopeKey segments', () => {
        const key = buildProposalIdempotencyKey(
            '11111111-1111-4111-8111-111111111111',
            'Ambience.Generate',
            'loc:44444444-4444-4444-8444-444444444444'
        )
        assert.ok(key.includes('11111111-1111-4111-8111-111111111111'))
        assert.ok(key.includes('Ambience.Generate'))
        assert.ok(key.includes('loc:44444444-4444-4444-8444-444444444444'))
    })
})

// ---------------------------------------------------------------------------
// RejectedProposalAuditRecord shape
// ---------------------------------------------------------------------------

describe('RejectedProposalAuditRecord', () => {
    it('audit record shape includes proposalId, validationResult, and timestamp', () => {
        const audit: RejectedProposalAuditRecord = {
            proposalId: BASE_PROPOSAL.proposalId,
            proposal: BASE_PROPOSAL,
            validationResult: {
                outcome: 'rejected',
                proposalId: BASE_PROPOSAL.proposalId,
                rejectionReasons: [
                    {
                        code: ProposalRejectionCode.MISSING_REQUIRED_PARAM,
                        message: 'locationId required',
                        actionType: 'Ambience.Generate'
                    }
                ]
            },
            auditedUtc: '2026-03-12T10:00:01.000Z'
        }
        assert.equal(audit.proposalId, BASE_PROPOSAL.proposalId)
        assert.equal(audit.validationResult.outcome, 'rejected')
    })
})
