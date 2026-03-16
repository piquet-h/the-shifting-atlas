/**
 * Tests for AgentReplayHarness
 *
 * Covers:
 * - Happy path: sequence of valid proposals replayed and all steps applied
 * - CorrelationId / causationId chain captured in report
 * - Schema-invalid proposal records handled gracefully (failureReason set)
 * - Business-rule rejected proposals reported with rejectionReasons
 * - Diff computation: matching and mismatching expected effects
 * - Missing (null) proposal records treated as schema-invalid
 * - Duplicate idempotency key detection
 * - Empty sequence handled without error
 */
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { AgentProposalEnvelope } from '@piquet-h/shared'
import { AgentReplayHarness, type ProposalRecord } from '../../src/services/AgentReplayHarness.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

describe('AgentReplayHarness', () => {
    let fixture: UnitTestFixture
    let harness: AgentReplayHarness

    const CORRELATION_ID = 'a1111111-1111-4111-8111-111111111111'
    const CAUSATION_ID = 'a2222222-2222-4222-8222-222222222222'
    const PROPOSAL_ID_1 = 'a3333333-3333-4333-8333-333333333333'
    const PROPOSAL_ID_2 = 'a4444444-4444-4444-8444-444444444444'
    const LOCATION_ID_1 = 'a5555555-5555-4555-8555-555555555555'
    const LOCATION_ID_2 = 'a6666666-6666-4666-8666-666666666666'

    function makeValidProposal(proposalId: string, locationId: string, correlationId: string, causationId?: string): AgentProposalEnvelope {
        return {
            proposalId,
            version: 1,
            issuedUtc: '2025-12-01T10:00:00.000Z',
            actor: { kind: 'ai' },
            correlationId,
            ...(causationId ? { causationId } : {}),
            idempotencyKey: `proposal:${proposalId}:Layer.Add:loc:${locationId}`,
            proposedActions: [
                {
                    actionType: 'Layer.Add',
                    scopeKey: `loc:${locationId}`,
                    params: {
                        locationId,
                        layerContent: 'A gentle hum fills the air.',
                        layerType: 'ambient'
                    }
                }
            ]
        }
    }

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        const container = await fixture.getContainer()
        harness = container.get(AgentReplayHarness)
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    // -------------------------------------------------------------------------
    // Happy path
    // -------------------------------------------------------------------------

    test('replays a sequence of valid proposals and reports all steps applied', async () => {
        const records: ProposalRecord[] = [
            { proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID), tick: 0 },
            { proposal: makeValidProposal(PROPOSAL_ID_2, LOCATION_ID_2, CORRELATION_ID, CAUSATION_ID), tick: 1 }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.totalSteps, 2)
        assert.strictEqual(report.successCount, 2, 'Both steps should be applied successfully')
        assert.strictEqual(report.rejectedCount, 0)
        assert.strictEqual(report.schemaErrorCount, 0)
        assert.strictEqual(report.failureReasons.length, 0)

        assert.strictEqual(report.steps[0].validationOutcome, 'accepted')
        assert.ok(report.steps[0].appliedEffects.length > 0, 'First step should have applied effects')
        assert.strictEqual(report.steps[0].appliedEffects[0].applied, true)

        assert.strictEqual(report.steps[1].validationOutcome, 'accepted')
        assert.ok(report.steps[1].appliedEffects.length > 0, 'Second step should have applied effects')
    })

    test('persists applied layers to the repository during replay', async () => {
        const records: ProposalRecord[] = [{ proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID), tick: 0 }]

        await harness.replaySequence(records)

        const layerRepo = await fixture.getLayerRepository()
        const layer = await layerRepo.getActiveLayerForLocation(LOCATION_ID_1, 'ambient', 0)
        assert.ok(layer, 'Layer should be persisted to the repository after replay')
        assert.strictEqual(layer?.metadata?.['authoredBy'], 'agent')
    })

    // -------------------------------------------------------------------------
    // Correlation / causation chain
    // -------------------------------------------------------------------------

    test('captures correlationId and causationId chains in report', async () => {
        const records: ProposalRecord[] = [
            { proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID, CAUSATION_ID), tick: 0 }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.correlationChain.length, 1)
        assert.strictEqual(report.correlationChain[0].correlationId, CORRELATION_ID)
        assert.strictEqual(report.correlationChain[0].causationId, CAUSATION_ID)
    })

    test('captures all correlationId entries across multiple steps', async () => {
        const CORR_2 = 'b1111111-1111-4111-8111-111111111111'
        const records: ProposalRecord[] = [
            { proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID), tick: 0 },
            { proposal: makeValidProposal(PROPOSAL_ID_2, LOCATION_ID_2, CORR_2, CORRELATION_ID), tick: 1 }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.correlationChain.length, 2)
        assert.strictEqual(report.correlationChain[0].correlationId, CORRELATION_ID)
        assert.strictEqual(report.correlationChain[1].correlationId, CORR_2)
        assert.strictEqual(report.correlationChain[1].causationId, CORRELATION_ID, 'causationId should link to prior step')
    })

    test('exposes correlationId and causationId on each StepReplayResult', async () => {
        const records: ProposalRecord[] = [
            { proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID, CAUSATION_ID), tick: 0 }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.steps[0].correlationId, CORRELATION_ID)
        assert.strictEqual(report.steps[0].causationId, CAUSATION_ID)
    })

    // -------------------------------------------------------------------------
    // Schema-invalid / malformed records
    // -------------------------------------------------------------------------

    test('handles schema-invalid proposal records gracefully', async () => {
        const records: ProposalRecord[] = [
            { proposal: { invalid: 'data', missingRequiredFields: true } as unknown as AgentProposalEnvelope, tick: 0 }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.totalSteps, 1)
        assert.strictEqual(report.schemaErrorCount, 1)
        assert.strictEqual(report.successCount, 0)
        assert.strictEqual(report.steps[0].validationOutcome, 'schema-invalid')
        assert.ok(report.steps[0].failureReason, 'failureReason should be set for schema-invalid steps')
        assert.strictEqual(report.failureReasons.length, 1, 'failureReasons should include the schema error')
    })

    test('handles null proposal records in sequence gracefully', async () => {
        const records: ProposalRecord[] = [
            null as unknown as ProposalRecord,
            { proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID), tick: 0 }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.totalSteps, 2)
        assert.strictEqual(report.schemaErrorCount, 1, 'null record should be counted as schema error')
        assert.strictEqual(report.successCount, 1)
        assert.strictEqual(report.steps[0].validationOutcome, 'schema-invalid')
        assert.ok(report.steps[0].failureReason, 'failureReason should be set for missing records')
    })

    test('handles null proposal field within a record gracefully', async () => {
        const records: ProposalRecord[] = [
            { proposal: null as unknown as AgentProposalEnvelope, tick: 0 },
            { proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID), tick: 1 }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.schemaErrorCount, 1)
        assert.strictEqual(report.successCount, 1)
        assert.strictEqual(report.steps[0].validationOutcome, 'schema-invalid')
    })

    // -------------------------------------------------------------------------
    // Business rule rejections
    // -------------------------------------------------------------------------

    test('reports rejection reasons for proposals that fail business rule validation', async () => {
        const malformedProposal: AgentProposalEnvelope = {
            proposalId: PROPOSAL_ID_1,
            version: 1,
            issuedUtc: '2025-12-01T10:00:00.000Z',
            actor: { kind: 'ai' },
            correlationId: CORRELATION_ID,
            idempotencyKey: `proposal:${PROPOSAL_ID_1}:Layer.Add:loc:${LOCATION_ID_1}`,
            proposedActions: [
                {
                    actionType: 'Layer.Add',
                    scopeKey: `loc:${LOCATION_ID_1}`,
                    params: {
                        // Missing required 'locationId' and 'layerContent'
                    }
                }
            ]
        }

        const records: ProposalRecord[] = [{ proposal: malformedProposal, tick: 0 }]
        const report = await harness.replaySequence(records)

        assert.strictEqual(report.totalSteps, 1)
        assert.strictEqual(report.rejectedCount, 1)
        assert.strictEqual(report.successCount, 0)
        assert.strictEqual(report.steps[0].validationOutcome, 'rejected')
        assert.ok(report.steps[0].rejectionReasons && report.steps[0].rejectionReasons.length > 0, 'rejectionReasons should be populated')
        assert.ok(report.steps[0].failureReason, 'failureReason should describe the rejection')
        assert.ok(report.failureReasons.length > 0, 'top-level failureReasons should include the rejection')
    })

    // -------------------------------------------------------------------------
    // Diff computation
    // -------------------------------------------------------------------------

    test('computes matching diff when expected effects align with actual', async () => {
        const records: ProposalRecord[] = [
            {
                proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID),
                tick: 0,
                expectedEffects: [{ actionType: 'Layer.Add', scopeKey: `loc:${LOCATION_ID_1}`, applied: true }]
            }
        ]

        const report = await harness.replaySequence(records)

        const diffs = report.steps[0].diffs
        assert.ok(diffs, 'diffs should be present when expectedEffects are provided')
        assert.strictEqual(diffs!.length, 1)
        assert.strictEqual(diffs![0].match, true, 'diff should show match=true when expected === actual')
        assert.strictEqual(diffs![0].actualApplied, true)
        assert.strictEqual(diffs![0].expectedApplied, true)
    })

    test('computes mismatching diff when expected applied=false but action was applied', async () => {
        const records: ProposalRecord[] = [
            {
                proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID),
                tick: 0,
                expectedEffects: [
                    // We expected the action NOT to be applied, but it was
                    { actionType: 'Layer.Add', scopeKey: `loc:${LOCATION_ID_1}`, applied: false }
                ]
            }
        ]

        const report = await harness.replaySequence(records)

        const diffs = report.steps[0].diffs
        assert.ok(diffs, 'diffs should be present')
        assert.strictEqual(diffs!.length, 1)
        assert.strictEqual(diffs![0].match, false, 'diff should show match=false on mismatch')
        assert.strictEqual(diffs![0].expectedApplied, false)
        assert.strictEqual(diffs![0].actualApplied, true)
    })

    test('does not set diffs when no expectedEffects provided', async () => {
        const records: ProposalRecord[] = [{ proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID), tick: 0 }]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.steps[0].diffs, undefined, 'diffs should be undefined when no expectedEffects')
    })

    test('computes diffs for rejected steps against expected effects', async () => {
        const malformedProposal: AgentProposalEnvelope = {
            proposalId: PROPOSAL_ID_1,
            version: 1,
            issuedUtc: '2025-12-01T10:00:00.000Z',
            actor: { kind: 'ai' },
            correlationId: CORRELATION_ID,
            idempotencyKey: `proposal:${PROPOSAL_ID_1}:Layer.Add:loc:${LOCATION_ID_1}`,
            proposedActions: [
                {
                    actionType: 'Layer.Add',
                    scopeKey: `loc:${LOCATION_ID_1}`,
                    params: {} // missing required params → rejected
                }
            ]
        }

        const records: ProposalRecord[] = [
            {
                proposal: malformedProposal,
                tick: 0,
                expectedEffects: [{ actionType: 'Layer.Add', scopeKey: `loc:${LOCATION_ID_1}`, applied: true }]
            }
        ]

        const report = await harness.replaySequence(records)

        const diffs = report.steps[0].diffs
        assert.ok(diffs, 'diffs should be computed even for rejected steps')
        assert.strictEqual(diffs![0].match, false, 'rejected step should produce a mismatch (expected applied=true, actual=false)')
    })

    // -------------------------------------------------------------------------
    // Duplicate delivery detection
    // -------------------------------------------------------------------------

    test('detects duplicate proposal idempotency keys in the sequence', async () => {
        const SHARED_KEY = `proposal:${PROPOSAL_ID_1}:Layer.Add:loc:${LOCATION_ID_1}`
        const proposal1 = makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID)
        // Second proposal reuses the same idempotency key
        const proposal2: AgentProposalEnvelope = {
            ...makeValidProposal(PROPOSAL_ID_2, LOCATION_ID_2, CORRELATION_ID),
            idempotencyKey: SHARED_KEY
        }

        const records: ProposalRecord[] = [
            { proposal: proposal1, tick: 0 },
            { proposal: proposal2, tick: 1 }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.duplicateDeliveries, 1, 'One duplicate idempotency key should be detected')
        // Both steps still attempt apply — idempotency enforcement is caller's responsibility
        assert.strictEqual(report.successCount, 2)
    })

    test('reports zero duplicates when all idempotency keys are unique', async () => {
        const records: ProposalRecord[] = [
            { proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID), tick: 0 },
            { proposal: makeValidProposal(PROPOSAL_ID_2, LOCATION_ID_2, CORRELATION_ID), tick: 1 }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.duplicateDeliveries, 0)
    })

    // -------------------------------------------------------------------------
    // Edge cases
    // -------------------------------------------------------------------------

    test('handles empty proposal sequence without error', async () => {
        const report = await harness.replaySequence([])

        assert.strictEqual(report.totalSteps, 0)
        assert.strictEqual(report.successCount, 0)
        assert.strictEqual(report.rejectedCount, 0)
        assert.strictEqual(report.schemaErrorCount, 0)
        assert.strictEqual(report.duplicateDeliveries, 0)
        assert.strictEqual(report.failureReasons.length, 0)
        assert.strictEqual(report.correlationChain.length, 0)
    })

    test('mixed sequence: valid + rejected + schema-invalid steps', async () => {
        const records: ProposalRecord[] = [
            // Step 0: valid
            { proposal: makeValidProposal(PROPOSAL_ID_1, LOCATION_ID_1, CORRELATION_ID), tick: 0 },
            // Step 1: schema-invalid
            { proposal: { bad: 'data' } as unknown as AgentProposalEnvelope, tick: 1 },
            // Step 2: business-rule rejected (missing params)
            {
                proposal: {
                    proposalId: PROPOSAL_ID_2,
                    version: 1,
                    issuedUtc: '2025-12-01T10:00:00.000Z',
                    actor: { kind: 'ai' },
                    correlationId: CORRELATION_ID,
                    idempotencyKey: `proposal:${PROPOSAL_ID_2}`,
                    proposedActions: [
                        {
                            actionType: 'Layer.Add',
                            scopeKey: `loc:${LOCATION_ID_2}`,
                            params: {} // missing locationId + layerContent
                        }
                    ]
                } as AgentProposalEnvelope,
                tick: 2
            }
        ]

        const report = await harness.replaySequence(records)

        assert.strictEqual(report.totalSteps, 3)
        assert.strictEqual(report.successCount, 1)
        assert.strictEqual(report.schemaErrorCount, 1)
        assert.strictEqual(report.rejectedCount, 1)
        assert.strictEqual(report.failureReasons.length, 2, 'schema error + rejection = 2 failure reasons')

        assert.strictEqual(report.steps[0].validationOutcome, 'accepted')
        assert.strictEqual(report.steps[1].validationOutcome, 'schema-invalid')
        assert.strictEqual(report.steps[2].validationOutcome, 'rejected')
    })
})
