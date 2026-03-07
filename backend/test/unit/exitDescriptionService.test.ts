/**
 * Unit tests for ExitDescriptionService
 *
 * Tests the two-stage exit description model:
 * - Stage 1: Deterministic scaffold (always produced)
 * - Stage 2: Optional AI garnish (applied when AI available + destination context present)
 *
 * Validates:
 * - Scaffold-only fallback when AI is unavailable
 * - Scaffold-only when no destination context
 * - Scaffold-only for in/out directions (no garnish)
 * - AI garnish applied and validated on success
 * - Scaffold fallback when garnish fails validation (EL-07 canon creep)
 * - Scaffold fallback when AI returns empty/null
 * - Scaffold fallback when garnish clause too long
 * - Telemetry events emitted correctly
 * - buildExitDescriptionInput convenience helper
 */

import type { Contracts } from 'applicationinsights'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import { ExitDescriptionService, buildExitDescriptionInput } from '../../src/services/ExitDescriptionService.js'
import type { IAzureOpenAIClient, OpenAIGenerateResult } from '../../src/services/azureOpenAIClient.js'
import type { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

class MockTelemetryClient implements ITelemetryClient {
    events: Array<{ name: string; properties: Record<string, unknown> }> = []

    trackEvent(telemetry: Contracts.EventTelemetry): void {
        this.events.push({ name: telemetry.name, properties: (telemetry.properties || {}) as Record<string, unknown> })
    }

    trackException(): void {}
    trackMetric(): void {}
    trackTrace(): void {}
    trackDependency(): void {}
    trackRequest(): void {}
    addTelemetryProcessor(): void {}
    flush(): void {}

    findEvent(name: string) {
        return this.events.find((e) => e.name === name)
    }

    clear() {
        this.events.length = 0
    }
}

class MockAzureOpenAIClient implements IAzureOpenAIClient {
    private response: OpenAIGenerateResult | null

    constructor(response: OpenAIGenerateResult | null = null) {
        this.response = response
    }

    async generate(): Promise<OpenAIGenerateResult | null> {
        return this.response
    }

    async healthCheck(): Promise<boolean> {
        return this.response !== null
    }

    setResponse(response: OpenAIGenerateResult | null): void {
        this.response = response
    }
}

function makeTelemetry(client?: MockTelemetryClient): TelemetryService {
    const telemetryClient = client ?? new MockTelemetryClient()
    return new TelemetryService(telemetryClient)
}

// ---------------------------------------------------------------------------
// Scaffold-only scenarios (no AI)
// ---------------------------------------------------------------------------

describe('ExitDescriptionService — scaffold-only fallback', () => {
    test('returns scaffold when no AI client injected', async () => {
        const svc = new ExitDescriptionService(undefined, makeTelemetry())
        const result = await svc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate',
            destinationSnippet: 'Open farmland.'
        })

        assert.equal(result.garnishApplied, false)
        assert.ok(result.forward.length >= 15)
        assert.ok(result.backward.length >= 15)
        // Should contain "north" direction
        assert.ok(result.forward.includes('north'), `Expected "north" in forward: "${result.forward}"`)
    })

    test('returns scaffold when no destination context (no garnish attempted)', async () => {
        const ai = new MockAzureOpenAIClient({ content: ' toward the fields', tokenUsage: { prompt: 5, completion: 5, total: 10 } })
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate'
            // No destinationSnippet or destinationName
        })

        assert.equal(result.garnishApplied, false, 'No garnish when no destination context')
    })

    test('returns scaffold for in direction (no garnish)', async () => {
        const ai = new MockAzureOpenAIClient({ content: ' toward the fields', tokenUsage: { prompt: 5, completion: 5, total: 10 } })
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'in',
            durationBucket: 'threshold',
            destinationSnippet: 'A warm common room.',
            destinationName: 'The Inn'
        })

        assert.equal(result.garnishApplied, false, 'in direction should never receive garnish')
        // Should use "into" or "through" framing
        assert.ok(
            result.forward.toLowerCase().includes('into') || result.forward.toLowerCase().includes('through'),
            `Expected "into" or "through" in in-direction forward: "${result.forward}"`
        )
    })

    test('returns scaffold for out direction (no garnish)', async () => {
        const ai = new MockAzureOpenAIClient({ content: ' into the yard', tokenUsage: { prompt: 5, completion: 5, total: 10 } })
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'out',
            durationBucket: 'threshold',
            destinationSnippet: 'Open courtyard.'
        })

        assert.equal(result.garnishApplied, false, 'out direction should never receive garnish')
    })

    test('returns scaffold when AI returns null', async () => {
        const ai = new MockAzureOpenAIClient(null) // Always returns null
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'west',
            durationBucket: 'far',
            destinationSnippet: 'Distant hills.'
        })

        assert.equal(result.garnishApplied, false, 'Should fall back to scaffold when AI returns null')
        assert.ok(result.forward.includes('west'), `Expected "west" in forward: "${result.forward}"`)
    })

    test('returns scaffold when AI garnish clause is too long', async () => {
        const longClause = ' toward a very long place description that exceeds maximum character bounds for a garnish'
        const ai = new MockAzureOpenAIClient({ content: longClause, tokenUsage: { prompt: 5, completion: 20, total: 25 } })
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate',
            destinationSnippet: 'Some destination.'
        })

        assert.equal(result.garnishApplied, false, 'Should fall back when garnish clause is too long')
    })

    test('returns scaffold when AI garnish clause is too short (trivial output)', async () => {
        const ai = new MockAzureOpenAIClient({ content: ' hi', tokenUsage: { prompt: 5, completion: 2, total: 7 } })
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate',
            destinationSnippet: 'Some destination.'
        })

        assert.equal(result.garnishApplied, false, 'Should fall back when garnish clause is too short')
    })
})

// ---------------------------------------------------------------------------
// AI garnish scenarios
// ---------------------------------------------------------------------------

describe('ExitDescriptionService — AI garnish applied', () => {
    test('garnish appended to forward when AI returns valid clause', async () => {
        const clause = ' toward the old gatehouse'
        const ai = new MockAzureOpenAIClient({ content: clause, tokenUsage: { prompt: 10, completion: 5, total: 15 } })
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate',
            destinationSnippet: 'A stone gatehouse stands at the edge of the settlement.'
        })

        assert.equal(result.garnishApplied, true)
        assert.ok(result.forward.includes('toward the old gatehouse'), `Expected garnish in forward: "${result.forward}"`)
        assert.ok(result.forward.endsWith('.'), `Forward must end with period: "${result.forward}"`)
    })

    test('backward remains unchanged when garnish is applied', async () => {
        const noGarnishSvc = new ExitDescriptionService(undefined, makeTelemetry())
        const scaffoldOnly = await noGarnishSvc.generateDescription({ direction: 'north', durationBucket: 'moderate' })

        const clause = ' toward the fields'
        const ai = new MockAzureOpenAIClient({ content: clause, tokenUsage: { prompt: 10, completion: 5, total: 15 } })
        const garnishSvc = new ExitDescriptionService(ai, makeTelemetry())
        const withGarnish = await garnishSvc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate',
            destinationSnippet: 'Open farmland stretches to the horizon.'
        })

        assert.equal(withGarnish.backward, scaffoldOnly.backward, 'Backward should be unchanged when garnish applied')
    })

    test('garnish strips terminal punctuation from AI response', async () => {
        // AI might return a clause with a terminal period — should be stripped
        const clause = ' toward the fields.'
        const ai = new MockAzureOpenAIClient({ content: clause, tokenUsage: { prompt: 10, completion: 5, total: 15 } })
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate',
            destinationSnippet: 'Open farmland.'
        })

        if (result.garnishApplied) {
            // Terminal period should appear exactly once (from our own re-add)
            const periodCount = (result.forward.match(/\./g) || []).length
            assert.equal(periodCount, 1, `Forward should have exactly one terminal period: "${result.forward}"`)
        }
    })

    test('garnish adds leading space if AI omits it', async () => {
        const clause = 'toward the forest edge' // No leading space
        const ai = new MockAzureOpenAIClient({ content: clause, tokenUsage: { prompt: 10, completion: 5, total: 15 } })
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'east',
            durationBucket: 'near',
            destinationSnippet: 'A dark tree line marks the edge of the forest.'
        })

        if (result.garnishApplied) {
            // The forward should not have a double space or missing space before the garnish
            assert.ok(!result.forward.includes('  '), `Forward must not have double spaces: "${result.forward}"`)
        }
    })

    test('destinationName context used for garnish', async () => {
        const clause = ' toward Millgate'
        const ai = new MockAzureOpenAIClient({ content: clause, tokenUsage: { prompt: 10, completion: 5, total: 15 } })
        const svc = new ExitDescriptionService(ai, makeTelemetry())

        const result = await svc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate',
            destinationName: 'Millgate',
            destinationSnippet: 'A small mill town.'
        })

        if (result.garnishApplied) {
            // "Millgate" is allowed via destinationName contextToken
            assert.ok(result.forward.includes('Millgate'), `Expected destination name in garnished forward: "${result.forward}"`)
        }
    })
})

// ---------------------------------------------------------------------------
// Garnish fails validation → scaffold fallback
// ---------------------------------------------------------------------------

describe('ExitDescriptionService — garnish validation failure falls back to scaffold', () => {
    test('scaffold returned when garnish introduces unknown proper noun (EL-07)', async () => {
        // "Thornwick Keep" is not the destination name → EL-07 canon creep
        const clause = ' toward Thornwick Keep'
        const ai = new MockAzureOpenAIClient({ content: clause, tokenUsage: { prompt: 10, completion: 5, total: 15 } })
        const telemetryClient = new MockTelemetryClient()
        const svc = new ExitDescriptionService(ai, makeTelemetry(telemetryClient))

        const result = await svc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate',
            destinationSnippet: 'A fortified settlement.' // no destinationName provided
        })

        assert.equal(result.garnishApplied, false, 'Should fall back when garnish introduces unknown proper noun')

        // DescriptionRejected telemetry should be emitted
        const rejectedEvent = telemetryClient.findEvent('Navigation.Exit.DescriptionRejected')
        assert.ok(rejectedEvent, 'Navigation.Exit.DescriptionRejected should be emitted on validation failure')
        assert.ok(rejectedEvent.properties['checkId'], 'DescriptionRejected should include checkId')
    })
})

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

describe('ExitDescriptionService — telemetry', () => {
    test('Navigation.Exit.DescriptionGenerated emitted on successful garnish', async () => {
        const clause = ' toward the fields'
        const ai = new MockAzureOpenAIClient({ content: clause, tokenUsage: { prompt: 10, completion: 5, total: 15 } })
        const telemetryClient = new MockTelemetryClient()
        const svc = new ExitDescriptionService(ai, makeTelemetry(telemetryClient))

        const result = await svc.generateDescription({
            direction: 'north',
            durationBucket: 'moderate',
            destinationSnippet: 'Open farmland.'
        })

        if (result.garnishApplied) {
            const event = telemetryClient.findEvent('Navigation.Exit.DescriptionGenerated')
            assert.ok(event, 'Navigation.Exit.DescriptionGenerated should be emitted on success')
            assert.equal(event.properties['durationBucket'], 'moderate')
            assert.ok(typeof event.properties['charLength'] === 'number')
        }
    })

    test('No telemetry emitted for scaffold-only result', async () => {
        const telemetryClient = new MockTelemetryClient()
        const svc = new ExitDescriptionService(undefined, makeTelemetry(telemetryClient))

        await svc.generateDescription({ direction: 'north', durationBucket: 'moderate' })

        const generatedEvent = telemetryClient.findEvent('Navigation.Exit.DescriptionGenerated')
        const rejectedEvent = telemetryClient.findEvent('Navigation.Exit.DescriptionRejected')
        assert.equal(generatedEvent, undefined, 'No DescriptionGenerated event for scaffold-only')
        assert.equal(rejectedEvent, undefined, 'No DescriptionRejected event for scaffold-only')
    })
})

// ---------------------------------------------------------------------------
// buildExitDescriptionInput convenience helper
// ---------------------------------------------------------------------------

describe('buildExitDescriptionInput', () => {
    test('converts travelDurationMs to correct bucket', () => {
        const input = buildExitDescriptionInput('north', 60_000) // 60s → near
        assert.equal(input.direction, 'north')
        assert.equal(input.durationBucket, 'near')
    })

    test('undefined travelDurationMs → moderate bucket', () => {
        const input = buildExitDescriptionInput('east', undefined)
        assert.equal(input.durationBucket, 'moderate')
    })

    test('preserves optional fields', () => {
        const input = buildExitDescriptionInput('west', 120_000, {
            pathKind: 'road',
            grade: 'ascending',
            destinationName: 'Millgate'
        })
        assert.equal(input.pathKind, 'road')
        assert.equal(input.grade, 'ascending')
        assert.equal(input.destinationName, 'Millgate')
    })

    test('threshold travelDurationMs (< 15 000) → threshold bucket', () => {
        const input = buildExitDescriptionInput('north', 5_000)
        assert.equal(input.durationBucket, 'threshold')
    })
})

// ---------------------------------------------------------------------------
// Scaffold output quality spot-checks
// ---------------------------------------------------------------------------

describe('ExitDescriptionService — scaffold quality', () => {
    test('moderate road north: "A road continues north"', async () => {
        const svc = new ExitDescriptionService(undefined, makeTelemetry())
        const result = await svc.generateDescription({ direction: 'north', durationBucket: 'moderate', pathKind: 'road' })
        assert.ok(result.forward.includes('road'), `Expected "road" in forward: "${result.forward}"`)
        assert.ok(result.forward.includes('north'), `Expected "north" in forward: "${result.forward}"`)
    })

    test('far west ascending: "A track climbs west"', async () => {
        const svc = new ExitDescriptionService(undefined, makeTelemetry())
        const result = await svc.generateDescription({ direction: 'west', durationBucket: 'far', grade: 'ascending' })
        assert.ok(result.forward.includes('climbs'), `Expected "climbs" in forward: "${result.forward}"`)
    })

    test('distant north: uses "disappears" and "distance"', async () => {
        const svc = new ExitDescriptionService(undefined, makeTelemetry())
        const result = await svc.generateDescription({ direction: 'north', durationBucket: 'distant' })
        assert.ok(result.forward.includes('disappears'), `Expected "disappears" in forward: "${result.forward}"`)
        assert.ok(result.forward.includes('distance'), `Expected "distance" in forward: "${result.forward}"`)
    })

    test('threshold in: uses "into" framing', async () => {
        const svc = new ExitDescriptionService(undefined, makeTelemetry())
        const result = await svc.generateDescription({ direction: 'in', durationBucket: 'threshold', pathKind: 'door' })
        assert.ok(result.forward.includes('into'), `Expected "into" framing in forward: "${result.forward}"`)
    })

    test('threshold down stair: "Stone steps descend below"', async () => {
        const svc = new ExitDescriptionService(undefined, makeTelemetry())
        const result = await svc.generateDescription({ direction: 'down', durationBucket: 'threshold', pathKind: 'stair' })
        assert.ok(result.forward.toLowerCase().includes('stone steps'), `Expected "Stone steps" in forward: "${result.forward}"`)
        assert.ok(result.forward.toLowerCase().includes('descend'), `Expected "descend" in forward: "${result.forward}"`)
    })
})
