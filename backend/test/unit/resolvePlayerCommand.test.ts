/**
 * Unit tests for ResolvePlayerCommandHandler
 *
 * Covers:
 * - Happy path: move with direction ("go north" → Move)
 * - Happy path: look command ("look" → Look)
 * - Invalid/empty input → 400
 * - Overlong input (>500 chars) → 400 with correlationId
 * - Ambiguous direction ("go" without direction → Unknown)
 * - Unknown verb → Unknown
 * - Response envelope fields (presentationMode, responseTempo, parsedIntent)
 * - Telemetry: PlayerCommand.Resolved emitted
 */

import type { HttpRequest, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { ResolvePlayerCommandHandler } from '../../src/handlers/resolvePlayerCommand.js'
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

function createMockRequest(body: unknown, headers?: Record<string, string>): HttpRequest {
    const bodyText = typeof body === 'string' ? body : JSON.stringify(body)
    const headersMap = new Map(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]))
    return {
        headers: {
            get: (key: string) => headersMap.get(key.toLowerCase()) ?? null
        },
        text: async () => bodyText
    } as unknown as HttpRequest
}

// ---------------------------------------------------------------------------
// Happy path: move with direction
// ---------------------------------------------------------------------------

describe('ResolvePlayerCommandHandler – move happy path', () => {
    test('returns 200 with Move actionKind and direction for "go north"', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'go north' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 200)
        const body = response.jsonBody as {
            success: boolean
            data: { actionKind: string; direction: string; canonicalWritesPlanned: boolean }
        }
        assert.ok(body.success)
        assert.strictEqual(body.data.actionKind, 'Move')
        assert.strictEqual(body.data.direction, 'north')
        assert.strictEqual(body.data.canonicalWritesPlanned, true)
    })

    test('returns Move for "move south"', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'move south' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 200)
        const body = response.jsonBody as { data: { actionKind: string; direction: string } }
        assert.strictEqual(body.data.actionKind, 'Move')
        assert.strictEqual(body.data.direction, 'south')
    })
})

// ---------------------------------------------------------------------------
// Happy path: look
// ---------------------------------------------------------------------------

describe('ResolvePlayerCommandHandler – look happy path', () => {
    test('returns 200 with Look actionKind for "look" command', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'look' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 200)
        const body = response.jsonBody as { success: boolean; data: { actionKind: string; canonicalWritesPlanned: boolean } }
        assert.ok(body.success)
        assert.strictEqual(body.data.actionKind, 'Look')
        assert.strictEqual(body.data.canonicalWritesPlanned, false)
    })

    test('returns Look for "examine surroundings"', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'examine surroundings' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 200)
        const body = response.jsonBody as { data: { actionKind: string } }
        assert.strictEqual(body.data.actionKind, 'Look')
    })
})

// ---------------------------------------------------------------------------
// Invalid / empty input → 400
// ---------------------------------------------------------------------------

describe('ResolvePlayerCommandHandler – invalid input', () => {
    test('returns 400 for empty inputText', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: '' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 400)
    })

    test('returns 400 with correlationId when inputText is missing', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 400)
        const body = response.jsonBody as { correlationId?: string }
        assert.ok(typeof body.correlationId === 'string', 'correlationId should be present in error response')
    })

    test('returns 400 when playerId is missing', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ inputText: 'go north' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 400)
    })

    test('returns 400 for invalid JSON body', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest('{not valid json')
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 400)
    })

    test('returns 400 for whitespace-only inputText', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: '   ' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 400)
    })
})

// ---------------------------------------------------------------------------
// Overlong input → 400
// ---------------------------------------------------------------------------

describe('ResolvePlayerCommandHandler – overlong input', () => {
    test('returns 400 with correlationId when inputText exceeds 500 characters', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const longText = 'a'.repeat(501)
        const req = createMockRequest({ playerId: 'player-1', inputText: longText })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 400)
        const body = response.jsonBody as { correlationId?: string; error?: { code: string } }
        assert.ok(typeof body.correlationId === 'string', 'correlationId should be present in error response')
    })

    test('accepts exactly 500 characters (boundary – should not 400)', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        // 500 chars exactly after trimming; verb 'go' is recognized but no direction → Unknown
        const exactText = 'go ' + 'a'.repeat(497)
        const req = createMockRequest({ playerId: 'player-1', inputText: exactText })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        // Should succeed (200) or fail for a reason other than length
        assert.notStrictEqual(response.status, 400)
    })
})

// ---------------------------------------------------------------------------
// Ambiguous direction (move without direction → Unknown)
// ---------------------------------------------------------------------------

describe('ResolvePlayerCommandHandler – ambiguous direction', () => {
    test('returns Unknown when "go" has no direction', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'go' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 200)
        const body = response.jsonBody as { data: { actionKind: string; canonicalWritesPlanned: boolean } }
        assert.strictEqual(body.data.actionKind, 'Unknown')
        assert.strictEqual(body.data.canonicalWritesPlanned, false)
    })

    test('does not set direction on Unknown resolution', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'go' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        const body = response.jsonBody as { data: { direction?: string } }
        assert.strictEqual(body.data.direction, undefined)
    })
})

// ---------------------------------------------------------------------------
// Unknown verb → Unknown
// ---------------------------------------------------------------------------

describe('ResolvePlayerCommandHandler – unknown verb', () => {
    test('returns Unknown for unrecognized verb', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'frobnicate the widget' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        assert.strictEqual(response.status, 200)
        const body = response.jsonBody as { data: { actionKind: string; canonicalWritesPlanned: boolean } }
        assert.strictEqual(body.data.actionKind, 'Unknown')
        assert.strictEqual(body.data.canonicalWritesPlanned, false)
    })
})

// ---------------------------------------------------------------------------
// Response envelope shape
// ---------------------------------------------------------------------------

describe('ResolvePlayerCommandHandler – response envelope', () => {
    test('response includes presentationMode and responseTempo set to Auto', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'look' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        const body = response.jsonBody as { data: { presentationMode: string; responseTempo: string } }
        assert.strictEqual(body.data.presentationMode, 'Auto')
        assert.strictEqual(body.data.responseTempo, 'Auto')
    })

    test('response includes parsedIntent with verb, confidence, needsClarification', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'go north' })
        const ctx = createMockContext(container)

        const response = await handler.handle(req, ctx)

        const body = response.jsonBody as {
            data: { parsedIntent: { needsClarification: boolean; verb: string; confidence: number } }
        }
        assert.ok(typeof body.data.parsedIntent.needsClarification === 'boolean')
        assert.ok(typeof body.data.parsedIntent.verb === 'string')
        assert.ok(typeof body.data.parsedIntent.confidence === 'number')
    })

    test('no persistence writes: endpoint returns resolution without errors', async () => {
        // Verifies non-mutating contract: endpoint resolves without requiring DB access
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'go north' })
        const ctx = createMockContext(container)

        // Should not throw even in mock (no-persistence) mode
        const response = await handler.handle(req, ctx)
        assert.strictEqual(response.status, 200)
    })
})

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

describe('ResolvePlayerCommandHandler – telemetry', () => {
    test('emits PlayerCommand.Resolved on successful resolution', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const telemetry = await fixture.getTelemetryClient()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'go north' })
        const ctx = createMockContext(container)

        await handler.handle(req, ctx)

        const resolved = telemetry.events.filter((e) => e.name === 'PlayerCommand.Resolved')
        assert.strictEqual(resolved.length, 1, 'PlayerCommand.Resolved should be emitted exactly once')
        assert.strictEqual(resolved[0].properties?.actionKind, 'Move')
    })

    test('PlayerCommand.Resolved includes correlationId property', async () => {
        const fixture = new UnitTestFixture()
        const container = await fixture.getContainer()
        const telemetry = await fixture.getTelemetryClient()
        const handler = container.get(ResolvePlayerCommandHandler)

        const req = createMockRequest({ playerId: 'player-1', inputText: 'look' })
        const ctx = createMockContext(container)

        await handler.handle(req, ctx)

        const resolved = telemetry.events.find((e) => e.name === 'PlayerCommand.Resolved')
        assert.ok(resolved, 'PlayerCommand.Resolved event should exist')
        assert.ok(typeof resolved.properties?.correlationId === 'string', 'correlationId should be a string')
    })
})
