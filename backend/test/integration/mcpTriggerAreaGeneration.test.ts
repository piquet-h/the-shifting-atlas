/**
 * Integration tests for the MCP trigger-area-generation handler
 *
 * Tests cover (memory mode):
 * - Input validation: mode (required, enum), budgetLocations (required, positive int), anchorLocationId (GUID)
 * - Urban mode: terrain resolves to narrow-corridor for anchor without terrain
 * - Wilderness mode: terrain resolves to open-plain for anchor without terrain
 * - Auto mode: produces a correlationId and idempotencyKey
 * - Idempotency: repeated calls with same key yield stable event-envelope keys
 * - Budget clamping: oversized budget reports clamped=true with maxBudget
 * - Correlation: result correlationId matches the BatchGenerate envelope correlationId
 * - Anchor not found: returns LocationNotFound error (not throws)
 */

import type { InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../../src/di/tokens.js'
import { WorldOperationsHandler } from '../../src/handlers/mcp/world-operations/world-operations.js'
import { MAX_BUDGET_LOCATIONS } from '../../src/services/AreaGenerationOrchestrator.js'
import { InMemoryWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

// The handler class method voids context; the exported wrapper uses it for DI.
// Tests call the handler method directly so an empty mock is sufficient.
const mockContext = {} as InvocationContext

describe('MCP trigger-area-generation handler (Integration - memory mode)', () => {
    let fixture: IntegrationTestFixture
    let handler: WorldOperationsHandler
    let eventPublisher: InMemoryWorldEventPublisher
    let mockTelemetry: MockTelemetryClient

    beforeEach(async () => {
        fixture = new IntegrationTestFixture('memory')
        await fixture.setup()
        const container = await fixture.getContainer()

        handler = container.get(WorldOperationsHandler)
        eventPublisher = container.get<InMemoryWorldEventPublisher>(TOKENS.WorldEventPublisher)
        mockTelemetry = container.get<MockTelemetryClient>(TOKENS.TelemetryClient) as MockTelemetryClient

        mockTelemetry.clear()
        eventPublisher.clear()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    describe('Input validation', () => {
        test('returns ValidationError when mode is missing', async () => {
            const result = JSON.parse(await handler.triggerAreaGeneration({ arguments: { budgetLocations: 5 } }, mockContext))

            assert.strictEqual(result.ok, false)
            assert.strictEqual(result.error, 'ValidationError')
            assert.ok(typeof result.message === 'string' && result.message.includes('mode'))
        })

        test('returns ValidationError for an unrecognised mode value', async () => {
            const result = JSON.parse(
                await handler.triggerAreaGeneration({ arguments: { mode: 'fantasy', budgetLocations: 5 } }, mockContext)
            )

            assert.strictEqual(result.ok, false)
            assert.strictEqual(result.error, 'ValidationError')
        })

        test('returns ValidationError when budgetLocations is missing', async () => {
            const result = JSON.parse(await handler.triggerAreaGeneration({ arguments: { mode: 'urban' } }, mockContext))

            assert.strictEqual(result.ok, false)
            assert.strictEqual(result.error, 'ValidationError')
            assert.ok(typeof result.message === 'string' && result.message.includes('budgetLocations'))
        })

        test('returns ValidationError for budgetLocations = 0', async () => {
            const result = JSON.parse(
                await handler.triggerAreaGeneration({ arguments: { mode: 'urban', budgetLocations: 0 } }, mockContext)
            )

            assert.strictEqual(result.ok, false)
            assert.strictEqual(result.error, 'ValidationError')
        })

        test('returns ValidationError for negative budgetLocations', async () => {
            const result = JSON.parse(
                await handler.triggerAreaGeneration({ arguments: { mode: 'urban', budgetLocations: -1 } }, mockContext)
            )

            assert.strictEqual(result.ok, false)
            assert.strictEqual(result.error, 'ValidationError')
        })

        test('returns InvalidLocationId when anchorLocationId is not a GUID', async () => {
            const result = JSON.parse(
                await handler.triggerAreaGeneration(
                    { arguments: { mode: 'urban', budgetLocations: 3, anchorLocationId: 'not-a-guid' } },
                    mockContext
                )
            )

            assert.strictEqual(result.ok, false)
            assert.strictEqual(result.error, 'InvalidLocationId')
        })

        test('returns LocationNotFound when anchor location does not exist', async () => {
            const nonExistentId = uuidv4()
            const result = JSON.parse(
                await handler.triggerAreaGeneration(
                    { arguments: { mode: 'urban', budgetLocations: 3, anchorLocationId: nonExistentId } },
                    mockContext
                )
            )

            assert.strictEqual(result.ok, false)
            assert.strictEqual(result.error, 'LocationNotFound')
            assert.ok(typeof result.message === 'string' && result.message.includes(nonExistentId))
            // correlationId is still present even on LocationNotFound
            assert.ok(result.correlationId, 'correlationId should be present even on error')
        })
    })

    describe('Urban mode', () => {
        test('triggers urban area generation and returns terrain narrow-corridor', async () => {
            const result = JSON.parse(
                await handler.triggerAreaGeneration({ arguments: { mode: 'urban', budgetLocations: 3 } }, mockContext)
            )

            assert.strictEqual(result.ok, true)
            assert.ok(result.correlationId, 'correlationId must be present')
            assert.ok(result.idempotencyKey, 'idempotencyKey must be present')
            assert.strictEqual(result.enqueuedCount, 1)
            assert.strictEqual(result.terrain, 'narrow-corridor')
            assert.strictEqual(result.anchorLocationId, STARTER_LOCATION_ID)
            assert.strictEqual(result.clamped, false)
            assert.strictEqual(result.maxBudget, MAX_BUDGET_LOCATIONS)
        })
    })

    describe('Wilderness mode', () => {
        test('triggers wilderness area generation and returns terrain open-plain', async () => {
            const result = JSON.parse(
                await handler.triggerAreaGeneration({ arguments: { mode: 'wilderness', budgetLocations: 5 } }, mockContext)
            )

            assert.strictEqual(result.ok, true)
            assert.ok(result.correlationId)
            assert.ok(result.idempotencyKey)
            assert.strictEqual(result.terrain, 'open-plain')
            assert.strictEqual(result.enqueuedCount, 1)
        })
    })

    describe('Auto mode', () => {
        test('triggers auto area generation and returns ok with correlation metadata', async () => {
            const result = JSON.parse(await handler.triggerAreaGeneration({ arguments: { mode: 'auto', budgetLocations: 2 } }, mockContext))

            assert.strictEqual(result.ok, true)
            assert.ok(result.correlationId)
            assert.ok(result.idempotencyKey)
        })
    })

    describe('Idempotency', () => {
        test('repeated calls with the same idempotencyKey produce stable event-envelope keys', async () => {
            const idempotencyKey = `test-mcp-idem-${uuidv4()}`

            eventPublisher.clear()
            await handler.triggerAreaGeneration({ arguments: { mode: 'wilderness', budgetLocations: 2, idempotencyKey } }, mockContext)
            const firstEvents = [...eventPublisher.enqueuedEvents]

            eventPublisher.clear()
            await handler.triggerAreaGeneration({ arguments: { mode: 'wilderness', budgetLocations: 2, idempotencyKey } }, mockContext)
            const secondEvents = [...eventPublisher.enqueuedEvents]

            assert.strictEqual(firstEvents.length, 1)
            assert.strictEqual(secondEvents.length, 1)
            assert.strictEqual(
                firstEvents[0].idempotencyKey,
                secondEvents[0].idempotencyKey,
                'Same caller idempotencyKey must yield stable event-envelope idempotency keys'
            )
        })

        test('calls without idempotencyKey produce unique envelope keys each time', async () => {
            const r1 = JSON.parse(await handler.triggerAreaGeneration({ arguments: { mode: 'urban', budgetLocations: 2 } }, mockContext))
            const r2 = JSON.parse(await handler.triggerAreaGeneration({ arguments: { mode: 'urban', budgetLocations: 2 } }, mockContext))

            assert.notStrictEqual(r1.idempotencyKey, r2.idempotencyKey, 'Auto-generated idempotency keys must differ between calls')
        })
    })

    describe('Budget bounds', () => {
        test('reports clamped=true and correct maxBudget when budgetLocations exceeds maximum', async () => {
            const result = JSON.parse(
                await handler.triggerAreaGeneration(
                    { arguments: { mode: 'urban', budgetLocations: MAX_BUDGET_LOCATIONS + 10 } },
                    mockContext
                )
            )

            assert.strictEqual(result.ok, true)
            assert.strictEqual(result.clamped, true)
            assert.strictEqual(result.maxBudget, MAX_BUDGET_LOCATIONS)
        })

        test('reports clamped=false when budgetLocations equals maximum', async () => {
            const result = JSON.parse(
                await handler.triggerAreaGeneration({ arguments: { mode: 'urban', budgetLocations: MAX_BUDGET_LOCATIONS } }, mockContext)
            )

            assert.strictEqual(result.ok, true)
            assert.strictEqual(result.clamped, false)
        })
    })

    describe('CorrelationId and event envelope', () => {
        test('result correlationId matches the correlationId on the enqueued BatchGenerate event', async () => {
            const result = JSON.parse(await handler.triggerAreaGeneration({ arguments: { mode: 'auto', budgetLocations: 2 } }, mockContext))

            assert.strictEqual(result.ok, true)

            const events = eventPublisher.enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')
            assert.strictEqual(events.length, 1)
            assert.strictEqual(events[0].correlationId, result.correlationId, 'Envelope correlationId must match result')
        })

        test('result correlationId is a valid UUID v4 format', async () => {
            const result = JSON.parse(
                await handler.triggerAreaGeneration({ arguments: { mode: 'urban', budgetLocations: 1 } }, mockContext)
            )

            assert.strictEqual(result.ok, true)
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            assert.ok(uuidRegex.test(result.correlationId), `correlationId "${result.correlationId}" must be UUID v4`)
        })
    })

    describe('Realm hints', () => {
        test('comma-separated realmHints are forwarded to the BatchGenerate event payload', async () => {
            await handler.triggerAreaGeneration(
                { arguments: { mode: 'wilderness', budgetLocations: 2, realmHints: 'coastal,mythic' } },
                mockContext
            )

            const events = eventPublisher.enqueuedEvents.filter((e) => e.type === 'World.Location.BatchGenerate')
            assert.strictEqual(events.length, 1)
            assert.deepStrictEqual(events[0].payload.realmHints, ['coastal', 'mythic'])
        })
    })
})
