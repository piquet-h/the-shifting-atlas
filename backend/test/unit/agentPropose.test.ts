/**
 * Unit tests for AgentProposeHandler
 *
 * Covers:
 *  - 400 on invalid JSON body
 *  - 400 on schema-invalid proposal (malformed agent output)
 *  - 200 accepted on valid proposal passing all validation rules
 *  - 200 rejected on valid-schema proposal that fails business rules (missing params)
 *  - Telemetry events emitted for each outcome
 *  - Rejected proposals include auditRecord; accepted do not
 */

import type { HttpRequest, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { AgentProposeHandler } from '../../src/handlers/agentPropose.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(container: Container): InvocationContext {
    return {
        invocationId: 'test-id',
        extraInputs: new Map([['container', container]])
    } as unknown as InvocationContext
}

function createMockRequest(body: unknown, headers?: Map<string, string>): HttpRequest {
    const bodyText = typeof body === 'string' ? body : JSON.stringify(body)
    return {
        headers: {
            get: (key: string) => headers?.get(key) ?? null
        },
        text: async () => bodyText
    } as unknown as HttpRequest
}

// A minimal valid proposal envelope
const VALID_PROPOSAL = {
    proposalId: '11111111-1111-4111-8111-111111111111',
    version: 1,
    issuedUtc: new Date().toISOString(),
    actor: { kind: 'ai', id: '22222222-2222-4222-8222-222222222222' },
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

// A proposal that passes schema but fails business rules (missing required param)
const INVALID_PARAMS_PROPOSAL = {
    ...VALID_PROPOSAL,
    proposalId: '55555555-5555-4555-8555-555555555555',
    idempotencyKey: 'proposal:55555555-5555-4555-8555-555555555555:Ambience.Generate:loc:44444444-4444-4444-8444-444444444444',
    proposedActions: [
        {
            actionType: 'Ambience.Generate',
            scopeKey: 'loc:44444444-4444-4444-8444-444444444444',
            params: {} // missing required locationId
        }
    ]
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AgentProposeHandler', () => {
    describe('invalid JSON body', () => {
        test('returns 400 when body is not valid JSON', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest('not-json {{{')
            const ctx = createMockContext(container)

            const response = await handler.handle(req, ctx)

            assert.strictEqual(response.status, 400)
            const body = response.jsonBody as { success: boolean; error?: { code: string } }
            assert.strictEqual(body.success, false)
            assert.strictEqual(body.error?.code, 'InvalidJson')
        })
    })

    describe('schema-invalid proposal (malformed agent output)', () => {
        test('returns 400 SchemaInvalid when proposal is missing required fields', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest({ proposalId: 'not-a-uuid', version: 'bad' })
            const ctx = createMockContext(container)

            const response = await handler.handle(req, ctx)

            assert.strictEqual(response.status, 400)
            const body = response.jsonBody as { success: boolean; error?: { code: string } }
            assert.strictEqual(body.success, false)
            assert.strictEqual(body.error?.code, 'SchemaInvalid')
        })

        test('emits Agent.Proposal.SchemaInvalid telemetry event', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const telemetry = await fixture.getTelemetryClient()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest({ not: 'a proposal' })
            const ctx = createMockContext(container)

            await handler.handle(req, ctx)

            const events = telemetry.events.filter((e) => e.name === 'Agent.Proposal.SchemaInvalid')
            assert.strictEqual(events.length, 1)
            assert.ok(typeof events[0].properties?.issueCount === 'number')
            assert.ok((events[0].properties?.issueCount as number) > 0)
        })

        test('does NOT emit Agent.Proposal.Received for schema-invalid proposals', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const telemetry = await fixture.getTelemetryClient()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest({ bad: 'data' })
            const ctx = createMockContext(container)

            await handler.handle(req, ctx)

            const receivedEvents = telemetry.events.filter((e) => e.name === 'Agent.Proposal.Received')
            assert.strictEqual(receivedEvents.length, 0)
        })
    })

    describe('accepted proposal', () => {
        test('returns 200 with accepted outcome for a valid proposal', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest(VALID_PROPOSAL)
            const ctx = createMockContext(container)

            const response = await handler.handle(req, ctx)

            assert.strictEqual(response.status, 200)
            const body = response.jsonBody as {
                success: boolean
                data?: { outcome: string; proposalId: string; rejectionReasons: unknown[] }
            }
            assert.strictEqual(body.success, true)
            assert.strictEqual(body.data?.outcome, 'accepted')
            assert.strictEqual(body.data?.proposalId, VALID_PROPOSAL.proposalId)
            assert.deepStrictEqual(body.data?.rejectionReasons, [])
        })

        test('does not include auditRecord in accepted response', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest(VALID_PROPOSAL)
            const ctx = createMockContext(container)

            const response = await handler.handle(req, ctx)

            const body = response.jsonBody as { data?: { auditRecord?: unknown } }
            assert.strictEqual(body.data?.auditRecord, undefined)
        })

        test('emits Agent.Proposal.Received and Agent.Proposal.Accepted telemetry', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const telemetry = await fixture.getTelemetryClient()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest(VALID_PROPOSAL)
            const ctx = createMockContext(container)

            await handler.handle(req, ctx)

            const received = telemetry.events.filter((e) => e.name === 'Agent.Proposal.Received')
            const accepted = telemetry.events.filter((e) => e.name === 'Agent.Proposal.Accepted')
            const rejected = telemetry.events.filter((e) => e.name === 'Agent.Proposal.Rejected')

            assert.strictEqual(received.length, 1)
            assert.strictEqual(accepted.length, 1)
            assert.strictEqual(rejected.length, 0)
        })

        test('telemetry includes proposalId, actorKind, actionCount, decisionLatencyMs', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const telemetry = await fixture.getTelemetryClient()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest(VALID_PROPOSAL)
            const ctx = createMockContext(container)

            await handler.handle(req, ctx)

            const received = telemetry.events.find((e) => e.name === 'Agent.Proposal.Received')
            assert.ok(received)
            assert.strictEqual(received.properties?.proposalId, VALID_PROPOSAL.proposalId)
            assert.strictEqual(received.properties?.actorKind, 'ai')
            assert.strictEqual(received.properties?.actionCount, 1)
            assert.ok(typeof received.properties?.decisionLatencyMs === 'number')
            assert.strictEqual(received.properties?.proposalCorrelationId, VALID_PROPOSAL.correlationId)
        })
    })

    describe('rejected proposal (business rules)', () => {
        test('returns 200 with rejected outcome when params are missing', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest(INVALID_PARAMS_PROPOSAL)
            const ctx = createMockContext(container)

            const response = await handler.handle(req, ctx)

            assert.strictEqual(response.status, 200)
            const body = response.jsonBody as {
                success: boolean
                data?: { outcome: string; proposalId: string; rejectionReasons: unknown[]; auditRecord: unknown }
            }
            assert.strictEqual(body.success, true)
            assert.strictEqual(body.data?.outcome, 'rejected')
            assert.strictEqual(body.data?.proposalId, INVALID_PARAMS_PROPOSAL.proposalId)
            assert.ok(Array.isArray(body.data?.rejectionReasons))
            assert.ok((body.data?.rejectionReasons.length ?? 0) > 0)
        })

        test('includes auditRecord in rejected response', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest(INVALID_PARAMS_PROPOSAL)
            const ctx = createMockContext(container)

            const response = await handler.handle(req, ctx)

            const body = response.jsonBody as {
                data?: {
                    auditRecord?: { proposalId: string; auditedUtc: string; validationResult: { outcome: string } }
                }
            }
            const audit = body.data?.auditRecord
            assert.ok(audit, 'auditRecord should be present for rejected proposals')
            assert.strictEqual(audit?.proposalId, INVALID_PARAMS_PROPOSAL.proposalId)
            assert.ok(typeof audit?.auditedUtc === 'string')
            assert.strictEqual(audit?.validationResult.outcome, 'rejected')
        })

        test('emits Agent.Proposal.Received and Agent.Proposal.Rejected telemetry', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const telemetry = await fixture.getTelemetryClient()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest(INVALID_PARAMS_PROPOSAL)
            const ctx = createMockContext(container)

            await handler.handle(req, ctx)

            const received = telemetry.events.filter((e) => e.name === 'Agent.Proposal.Received')
            const rejected = telemetry.events.filter((e) => e.name === 'Agent.Proposal.Rejected')
            const accepted = telemetry.events.filter((e) => e.name === 'Agent.Proposal.Accepted')

            assert.strictEqual(received.length, 1)
            assert.strictEqual(rejected.length, 1)
            assert.strictEqual(accepted.length, 0)
        })

        test('Rejected telemetry includes rejectionCount', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const telemetry = await fixture.getTelemetryClient()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest(INVALID_PARAMS_PROPOSAL)
            const ctx = createMockContext(container)

            await handler.handle(req, ctx)

            const rejected = telemetry.events.find((e) => e.name === 'Agent.Proposal.Rejected')
            assert.ok(rejected)
            assert.ok(typeof rejected.properties?.rejectionCount === 'number')
            assert.ok((rejected.properties?.rejectionCount as number) > 0)
        })
    })

    describe('causationId propagation', () => {
        test('causationId is included in telemetry when present', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const telemetry = await fixture.getTelemetryClient()
            const handler = container.get(AgentProposeHandler)

            const proposalWithCausation = {
                ...VALID_PROPOSAL,
                proposalId: '66666666-6666-4666-8666-666666666666',
                causationId: '77777777-7777-4777-8777-777777777777',
                idempotencyKey: 'proposal:66666666-6666-4666-8666-666666666666:Ambience.Generate:loc:44444444-4444-4444-8444-444444444444'
            }

            const req = createMockRequest(proposalWithCausation)
            const ctx = createMockContext(container)

            await handler.handle(req, ctx)

            const received = telemetry.events.find((e) => e.name === 'Agent.Proposal.Received')
            assert.ok(received)
            assert.strictEqual(received.properties?.causationId, '77777777-7777-4777-8777-777777777777')
        })

        test('causationId is absent from telemetry when not in proposal', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const telemetry = await fixture.getTelemetryClient()
            const handler = container.get(AgentProposeHandler)

            const req = createMockRequest(VALID_PROPOSAL)
            const ctx = createMockContext(container)

            await handler.handle(req, ctx)

            const received = telemetry.events.find((e) => e.name === 'Agent.Proposal.Received')
            assert.ok(received)
            assert.strictEqual(received.properties?.causationId, undefined)
        })
    })
})
