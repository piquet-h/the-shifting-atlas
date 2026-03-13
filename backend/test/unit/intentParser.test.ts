/**
 * Unit tests for the PI-0 heuristic intent parser.
 *
 * Covers:
 * - extractVerbs / detectSequence / extractNouns helpers
 * - parseCommand handler (happy paths + edge cases)
 * - Telemetry emission
 */

import type { InvocationContext } from '@azure/functions'
import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import sinon from 'sinon'
import type { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { detectSequence, extractNouns, extractVerbs, IntentParserHandler } from '../../src/handlers/mcp/intent-parser/intent-parser.js'

// ---------------------------------------------------------------------------
// Minimal fake InvocationContext
// ---------------------------------------------------------------------------
function makeContext(): InvocationContext {
    return {
        invocationId: 'test-invocation',
        bindings: {},
        bindingData: {},
        traceContext: {},
        bindingDefinitions: [],
        log: (() => {}) as unknown as (msg?: unknown, ...params: unknown[]) => void
    } as unknown as InvocationContext
}

// ---------------------------------------------------------------------------
// Minimal fake telemetry client that records calls
// ---------------------------------------------------------------------------
function makeTelemetry(): ITelemetryClient & { events: Array<{ name: string }> } {
    const events: Array<{ name: string }> = []
    return {
        events,
        trackEvent: sinon.stub().callsFake((t) => events.push({ name: t.name })),
        trackException: sinon.stub(),
        trackMetric: sinon.stub(),
        trackTrace: sinon.stub(),
        trackDependency: sinon.stub(),
        trackRequest: sinon.stub(),
        addTelemetryProcessor: sinon.stub(),
        flush: sinon.stub()
    } as unknown as ITelemetryClient & { events: Array<{ name: string }> }
}

function makeHandler(telemetry?: ITelemetryClient) {
    return new IntentParserHandler(telemetry ?? makeTelemetry())
}

// ---------------------------------------------------------------------------
// extractVerbs
// ---------------------------------------------------------------------------
describe('extractVerbs', () => {
    it('returns known verbs from text', () => {
        const verbs = extractVerbs('throw a rock at the seagull')
        assert.deepStrictEqual(verbs, ['throw'])
    })

    it('returns multiple verbs', () => {
        const verbs = extractVerbs('attack the goblin and then flee')
        assert.ok(verbs.includes('attack'), 'should include attack')
        assert.ok(verbs.includes('flee'), 'should include flee')
    })

    it('returns surface verb form (synonym keys, not canonical verbs)', () => {
        // extractVerbs returns the surface form (key in VERB_MAP).
        // Canonical IntentVerb mapping ('go' → 'move') happens inside buildIntent/parseCommand.
        const verbs = extractVerbs('go north')
        assert.deepStrictEqual(verbs, ['go'])
    })

    it('returns empty array for unknown verbs', () => {
        const verbs = extractVerbs('blorp the frizzle')
        assert.deepStrictEqual(verbs, [])
    })

    it('is case-insensitive', () => {
        const verbs = extractVerbs('THROW the rock')
        assert.deepStrictEqual(verbs, ['throw'])
    })

    it('deduplicates repeated verbs', () => {
        const verbs = extractVerbs('throw throw throw')
        assert.deepStrictEqual(verbs, ['throw'])
    })
})

// ---------------------------------------------------------------------------
// detectSequence
// ---------------------------------------------------------------------------
describe('detectSequence', () => {
    it('detects "and then" as sequential', () => {
        assert.equal(detectSequence('move north and then look'), 'sequential')
    })

    it('detects "then" alone as sequential', () => {
        assert.equal(detectSequence('move north then look around'), 'sequential')
    })

    it('detects "after" as sequential', () => {
        assert.equal(detectSequence('throw rock after moving'), 'sequential')
    })

    it('detects "followed by" as sequential', () => {
        assert.equal(detectSequence('attack followed by flee'), 'sequential')
    })

    it('returns parallel for commands without connectors', () => {
        assert.equal(detectSequence('throw rock'), 'parallel')
    })

    it('returns parallel for empty string', () => {
        assert.equal(detectSequence(''), 'parallel')
    })
})

// ---------------------------------------------------------------------------
// extractNouns
// ---------------------------------------------------------------------------
describe('extractNouns', () => {
    it('extracts nouns after articles', () => {
        const nouns = extractNouns('throw a rock at the seagull')
        assert.ok(nouns.includes('rock'), 'should include rock')
        assert.ok(nouns.includes('seagull'), 'should include seagull')
    })

    it('extracts nouns after "at"', () => {
        const nouns = extractNouns('attack at goblin')
        assert.ok(nouns.includes('goblin'))
    })

    it('returns empty array when no articles/preps present', () => {
        const nouns = extractNouns('flee')
        assert.deepStrictEqual(nouns, [])
    })

    it('deduplicates nouns', () => {
        const nouns = extractNouns('throw a rock at the rock')
        const rockCount = nouns.filter((n) => n === 'rock').length
        assert.equal(rockCount, 1)
    })
})

// ---------------------------------------------------------------------------
// IntentParserHandler.parseCommand
// ---------------------------------------------------------------------------
describe('IntentParserHandler.parseCommand', () => {
    it('parses a simple throw command', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand(
            { arguments: { text: 'throw rock', playerId: 'player-1', locationId: 'loc-1' } },
            makeContext()
        )
        const parsed = JSON.parse(result)

        assert.equal(parsed.rawText, 'throw rock')
        assert.equal(parsed.intents.length, 1)
        assert.equal(parsed.intents[0].verb, 'throw')
        assert.equal(parsed.intents[0].order, 0)
        assert.equal(typeof parsed.intents[0].confidence, 'number')
        assert.ok(parsed.intents[0].confidence > 0)
        assert.equal(parsed.parseVersion, '1.0.0')
        assert.equal(parsed.playerId, 'player-1')
        assert.equal(parsed.locationId, 'loc-1')
        assert.ok(parsed.createdAt)
    })

    it('parses attack command', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand({ arguments: { text: 'attack goblin' } }, makeContext())
        const parsed = JSON.parse(result)

        assert.equal(parsed.intents.length, 1)
        assert.equal(parsed.intents[0].verb, 'attack')
        assert.equal(parsed.intents[0].surfaceTargetName, 'goblin')
    })

    it('parses sequential commands with "and then"', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand({ arguments: { text: 'move north and then look' } }, makeContext())
        const parsed = JSON.parse(result)

        assert.ok(parsed.intents.length >= 2, 'should have at least 2 intents')
        assert.equal(parsed.intents[0].order, 0)
        assert.equal(parsed.intents[1].order, 1)
    })

    it('parses move with direction', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand({ arguments: { text: 'go north' } }, makeContext())
        const parsed = JSON.parse(result)

        assert.equal(parsed.intents.length, 1)
        assert.equal(parsed.intents[0].verb, 'move')
        assert.equal(parsed.intents[0].direction, 'north')
    })

    it('returns empty intents with no clarification for empty input', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand({ arguments: { text: '' } }, makeContext())
        const parsed = JSON.parse(result)

        assert.deepStrictEqual(parsed.intents, [])
        assert.equal(parsed.needsClarification, false)
    })

    it('rejects input longer than 500 characters', async () => {
        const handler = makeHandler()
        const longText = 'a'.repeat(501)
        const result = await handler.parseCommand({ arguments: { text: longText } }, makeContext())
        const parsed = JSON.parse(result)

        assert.deepStrictEqual(parsed.intents, [])
        assert.equal(parsed.needsClarification, true)
        assert.ok(parsed.ambiguities && parsed.ambiguities.length > 0)
        const critical = parsed.ambiguities.some((a: { critical: boolean }) => a.critical)
        assert.ok(critical, 'long input ambiguity should be critical')
    })

    it('flags unknown verbs as non-critical ambiguity', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand({ arguments: { text: 'blorp the frizzle' } }, makeContext())
        const parsed = JSON.parse(result)

        assert.deepStrictEqual(parsed.intents, [])
        assert.ok(parsed.ambiguities && parsed.ambiguities.length > 0)
        assert.equal(parsed.needsClarification, false)
    })

    it('flags noun targets as unknown_entity ambiguities', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand({ arguments: { text: 'throw a rock at the seagull' } }, makeContext())
        const parsed = JSON.parse(result)

        const entityAmbiguities = (parsed.ambiguities ?? []).filter((a: { issueType: string }) => a.issueType === 'unknown_entity')
        assert.ok(entityAmbiguities.length > 0, 'should flag noun targets as unknown entities')
    })

    it('emits PlayerCommand.Received telemetry', async () => {
        const telemetry = makeTelemetry()
        const handler = makeHandler(telemetry)
        await handler.parseCommand({ arguments: { text: 'throw rock' } }, makeContext())

        const received = telemetry.events.some((e) => e.name === 'PlayerCommand.Received')
        assert.ok(received, 'should emit PlayerCommand.Received')
    })

    it('emits PlayerCommand.ParseSucceeded on success', async () => {
        const telemetry = makeTelemetry()
        const handler = makeHandler(telemetry)
        await handler.parseCommand({ arguments: { text: 'throw rock' } }, makeContext())

        const succeeded = telemetry.events.some((e) => e.name === 'PlayerCommand.ParseSucceeded')
        assert.ok(succeeded, 'should emit PlayerCommand.ParseSucceeded')
    })

    it('emits PlayerCommand.ParseFailed on empty input', async () => {
        const telemetry = makeTelemetry()
        const handler = makeHandler(telemetry)
        await handler.parseCommand({ arguments: { text: '' } }, makeContext())

        const failed = telemetry.events.some((e) => e.name === 'PlayerCommand.ParseFailed')
        assert.ok(failed, 'should emit PlayerCommand.ParseFailed for empty input')
    })

    it('emits PlayerCommand.ParseFailed on too-long input', async () => {
        const telemetry = makeTelemetry()
        const handler = makeHandler(telemetry)
        await handler.parseCommand({ arguments: { text: 'x'.repeat(501) } }, makeContext())

        const failed = telemetry.events.some((e) => e.name === 'PlayerCommand.ParseFailed')
        assert.ok(failed, 'should emit PlayerCommand.ParseFailed for too-long input')
    })

    it('emits PlayerCommand.AmbiguityDetected when nouns are unresolved', async () => {
        const telemetry = makeTelemetry()
        const handler = makeHandler(telemetry)
        await handler.parseCommand({ arguments: { text: 'throw a rock at the seagull' } }, makeContext())

        const ambiguityEmitted = telemetry.events.some((e) => e.name === 'PlayerCommand.AmbiguityDetected')
        assert.ok(ambiguityEmitted, 'should emit PlayerCommand.AmbiguityDetected')
    })

    it('does not needsClarification for non-critical ambiguities', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand({ arguments: { text: 'attack the goblin' } }, makeContext())
        const parsed = JSON.parse(result)
        // Unknown entity "goblin" is non-critical
        assert.equal(parsed.needsClarification, false)
    })

    it('handles missing arguments gracefully', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand({}, makeContext())
        const parsed = JSON.parse(result)
        assert.ok(parsed.parseVersion)
        assert.equal(parsed.playerId, '')
        assert.equal(parsed.locationId, '')
    })

    it('returns unique intent IDs', async () => {
        const handler = makeHandler()
        const result = await handler.parseCommand({ arguments: { text: 'move north and then attack goblin and then flee' } }, makeContext())
        const parsed = JSON.parse(result)
        const ids = parsed.intents.map((i: { id: string }) => i.id)
        const unique = new Set(ids)
        assert.equal(unique.size, ids.length, 'all intent IDs should be unique')
    })

    it('maps surface synonym verb to canonical IntentVerb in parsed output', async () => {
        // "go" is a surface synonym that should map to canonical verb "move"
        const handler = makeHandler()
        const result = await handler.parseCommand({ arguments: { text: 'go north' } }, makeContext())
        const parsed = JSON.parse(result)
        assert.equal(parsed.intents.length, 1)
        assert.equal(parsed.intents[0].verb, 'move', '"go" should be canonicalised to "move"')
    })
})
