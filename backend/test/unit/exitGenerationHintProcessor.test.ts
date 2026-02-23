/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for Exit Generation Hint Queue Processor
 */
import type { Container } from 'inversify'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import {
    __resetExitHintIdempotencyCacheForTests,
    queueProcessExitGenerationHint
} from '../../src/handlers/queueProcessExitGenerationHint.js'
import type { IDeadLetterRepository } from '../../src/repos/deadLetterRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import { MockLocationRepository } from '../mocks/repositories/locationRepository.mock.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

const ORIGIN_LOCATION_ID = '00000000-0000-4000-8000-000000000004'
const PLAYER_ID = '00000000-0000-4000-8000-000000000002'

describe('Exit Generation Hint Queue Processor', () => {
    let fixture: UnitTestFixture

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        __resetExitHintIdempotencyCacheForTests()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    // Helper to create valid exit hint queue message
    function createValidHintMessage(overrides?: Partial<Record<string, unknown>>): Record<string, unknown> {
        return {
            eventId: '00000000-0000-4000-8000-000000000001',
            type: 'Navigation.Exit.GenerationHint',
            occurredUtc: new Date().toISOString(),
            actor: {
                kind: 'player',
                id: PLAYER_ID
            },
            correlationId: '00000000-0000-4000-8000-000000000003',
            idempotencyKey: 'test-exit-hint-key',
            version: 1,
            payload: {
                dir: 'north',
                originLocationId: ORIGIN_LOCATION_ID,
                playerId: PLAYER_ID,
                timestamp: new Date().toISOString(),
                debounced: false
            },
            ...overrides
        }
    }

    /** Set up a test origin location in the mock repository */
    async function setupOriginLocation(opts?: {
        dir?: string
        hasPendingExit?: boolean
        hasForbiddenExit?: boolean
        hasHardExit?: boolean
        targetId?: string
    }): Promise<void> {
        const locationRepo = (await fixture.getLocationRepository()) as MockLocationRepository
        const dir = opts?.dir ?? 'north'
        const targetId = opts?.targetId ?? '99999999-9999-4999-8999-999999999999'

        let availability: { pending?: Partial<Record<string, string>>; forbidden?: Partial<Record<string, string>> } | undefined
        if (opts?.hasPendingExit) {
            availability = { pending: { [dir]: '' } }
        } else if (opts?.hasForbiddenExit) {
            availability = { forbidden: { [dir]: 'terrain-blocked' } }
        }

        locationRepo.setLocation(ORIGIN_LOCATION_ID, {
            id: ORIGIN_LOCATION_ID,
            name: 'Test Origin Location',
            description: 'A test origin location',
            terrain: 'open-plain',
            tags: [],
            exits: opts?.hasHardExit ? [{ direction: dir, to: targetId }] : [],
            exitAvailability: availability,
            version: 1
        })

        // If hard exit, also create the target so ensureExit works
        if (opts?.hasHardExit) {
            locationRepo.setLocation(targetId, {
                id: targetId,
                name: 'Existing Target',
                description: 'Already exists',
                exits: [],
                tags: [],
                version: 1
            })
        }
    }

    describe('Valid Hint Processing', () => {
        test('should process valid exit hint and materialize a new exit', async () => {
            await setupOriginLocation({ hasPendingExit: true })
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()

            await queueProcessExitGenerationHint(message, ctx as any)

            const logs = ctx.getLogs()
            const errors = ctx.getErrors()

            assert.strictEqual(errors.length, 0, 'Should not have any errors')
            assert.ok(logs.length > 0, 'Should have logged processing steps')
            const receivedLog = logs.find((l) => l[0] === 'Exit generation hint received')
            assert.ok(receivedLog, 'Should log hint received')
            const materializedLog = logs.find((l) => l[0] === 'Exit generation hint materialized')
            assert.ok(materializedLog, 'Should log materialization completion')

            // Verify the new exit was created on the origin
            const locationRepo = (await fixture.getLocationRepository()) as ILocationRepository
            const updated = await locationRepo.get(ORIGIN_LOCATION_ID)
            const northExit = updated?.exits?.find((e) => e.direction === 'north')
            assert.ok(northExit, 'Origin should now have a hard north exit')
        })

        test('should propagate correlation ID from message', async () => {
            await setupOriginLocation({ hasPendingExit: true })
            const ctx = await fixture.createInvocationContext()
            const correlationId = '11111111-1111-4111-8111-111111111111'
            const message = createValidHintMessage({ correlationId })

            await queueProcessExitGenerationHint(message, ctx as any)

            const logs = ctx.getLogs()
            const receivedLog = logs.find((l) => l[0] === 'Exit generation hint received')
            assert.ok(receivedLog, 'Should log hint received')
            assert.strictEqual(receivedLog[1].correlationId, correlationId, 'Should use message correlationId')
        })

        test('should handle message with debounced=true', async () => {
            await setupOriginLocation({ hasPendingExit: true })
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()
            ;(message.payload as any).debounced = true

            await queueProcessExitGenerationHint(message, ctx as any)

            const logs = ctx.getLogs()
            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors')
            const receivedLog = logs.find((l) => l[0] === 'Exit generation hint received')
            assert.ok(receivedLog, 'Should process debounced hints')
            assert.strictEqual(receivedLog[1].debounced, true, 'Should log debounced flag')
        })

        test('should emit materialized telemetry outcome on success', async () => {
            await setupOriginLocation({ hasPendingExit: true })
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()

            await queueProcessExitGenerationHint(message, ctx as any)

            const telemetryClient = await fixture.getTelemetryClient()
            const mockClient = telemetryClient as import('../mocks/MockTelemetryClient.js').MockTelemetryClient
            const generationEvent = mockClient.events.find(
                (e) => e.name === 'Navigation.Exit.GenerationRequested' && (e.properties as any)?.outcome === 'materialized'
            )
            assert.ok(generationEvent, 'Should emit materialized telemetry')
        })

        test('should emit skipped-idempotent outcome when hard exit already exists', async () => {
            await setupOriginLocation({ hasHardExit: true })
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()

            await queueProcessExitGenerationHint(message, ctx as any)

            const logs = ctx.getLogs()
            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors for idempotent skip')
            const skipLog = logs.find((l) => l[0] === 'Exit generation hint: hard exit already exists, skipping (idempotent)')
            assert.ok(skipLog, 'Should log idempotent skip')

            const telemetryClient = await fixture.getTelemetryClient()
            const mockClient = telemetryClient as import('../mocks/MockTelemetryClient.js').MockTelemetryClient
            const generationEvent = mockClient.events.find(
                (e) => e.name === 'Navigation.Exit.GenerationRequested' && (e.properties as any)?.outcome === 'skipped-idempotent'
            )
            assert.ok(generationEvent, 'Should emit skipped-idempotent telemetry')
        })

        test('should emit forbidden-policy outcome when direction is forbidden', async () => {
            await setupOriginLocation({ hasForbiddenExit: true })
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()

            await queueProcessExitGenerationHint(message, ctx as any)

            const logs = ctx.getLogs()
            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors for forbidden direction')
            const forbiddenLog = logs.find((l) => l[0] === 'Exit generation hint: direction is forbidden by policy')
            assert.ok(forbiddenLog, 'Should log forbidden policy')

            const telemetryClient = await fixture.getTelemetryClient()
            const mockClient = telemetryClient as import('../mocks/MockTelemetryClient.js').MockTelemetryClient
            const generationEvent = mockClient.events.find(
                (e) => e.name === 'Navigation.Exit.GenerationRequested' && (e.properties as any)?.outcome === 'forbidden-policy'
            )
            assert.ok(generationEvent, 'Should emit forbidden-policy telemetry')
        })

        test('should emit failed-validation outcome when origin location not found', async () => {
            // No location set up - mock repo is empty
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()

            await queueProcessExitGenerationHint(message, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have an error for missing origin')
            const notFoundError = errors.find((e) => e[0] === 'Exit generation hint: origin location not found')
            assert.ok(notFoundError, 'Should log origin not found error')
        })
    })

    describe('Invalid Payload Validation', () => {
        test('should reject hint with missing dir', async () => {
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()
            delete (message.payload as any).dir

            await queueProcessExitGenerationHint(message, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have validation error')
            const validationError = errors.find((e) => e[0] === 'Exit hint payload validation failed')
            assert.ok(validationError, 'Should log payload validation failure')
        })

        test('should reject hint with invalid dir value', async () => {
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()
            ;(message.payload as any).dir = 'invalid-direction'

            await queueProcessExitGenerationHint(message, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have validation error for invalid direction')
        })

        test('should reject hint with missing originLocationId', async () => {
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()
            delete (message.payload as any).originLocationId

            await queueProcessExitGenerationHint(message, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have validation error for missing originLocationId')
        })

        test('should reject hint with invalid UUID in originLocationId', async () => {
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()
            ;(message.payload as any).originLocationId = 'not-a-uuid'

            await queueProcessExitGenerationHint(message, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have validation error for invalid UUID')
        })

        test('should reject hint with missing timestamp', async () => {
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage()
            delete (message.payload as any).timestamp

            await queueProcessExitGenerationHint(message, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have validation error for missing timestamp')
        })

        test('should handle malformed JSON gracefully', async () => {
            const ctx = await fixture.createInvocationContext()
            const malformedJson = 'not valid json {'

            await queueProcessExitGenerationHint(malformedJson, ctx as any)

            const errors = ctx.getErrors()
            assert.ok(errors.length > 0, 'Should have JSON parse error')
            const parseError = errors.find((e) => e[0] === 'Failed to parse exit hint queue message as JSON')
            assert.ok(parseError, 'Should log JSON parse failure')
        })
    })

    describe('Expired Intent Detection', () => {
        test('should reject hints that are too old', async () => {
            const ctx = await fixture.createInvocationContext()
            const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString() // 10 minutes ago
            const message = createValidHintMessage()
            ;(message.payload as any).timestamp = oldTimestamp

            await queueProcessExitGenerationHint(message, ctx as any)

            // warn() is called for expired hints - check logs instead
            const logs = ctx.getLogs()
            // The DLQ storage logs about creating a dead-letter record
            const dlqLog = logs.find((l) => l[0] === 'Dead-letter record created for exit hint')
            assert.ok(dlqLog, 'Should log dead-letter creation for expired hint')
        })

        test('should process recent hints', async () => {
            await setupOriginLocation({ hasPendingExit: true })
            const ctx = await fixture.createInvocationContext()
            const recentTimestamp = new Date().toISOString() // Now
            const message = createValidHintMessage()
            ;(message.payload as any).timestamp = recentTimestamp

            await queueProcessExitGenerationHint(message, ctx as any)

            const logs = ctx.getLogs()
            const errors = ctx.getErrors()
            assert.strictEqual(errors.length, 0, 'Should not have errors for recent hint')
            const materializedLog = logs.find((l) => l[0] === 'Exit generation hint materialized')
            assert.ok(materializedLog, 'Should materialize recent hint')
        })
    })

    describe('Idempotency', () => {
        test('should detect duplicate hints with same originLocationId:dir', async () => {
            await setupOriginLocation({ hasPendingExit: true })
            const ctx1 = await fixture.createInvocationContext()
            const ctx2 = await fixture.createInvocationContext()
            const message = createValidHintMessage()

            await queueProcessExitGenerationHint(message, ctx1 as any)
            await queueProcessExitGenerationHint(message, ctx2 as any)

            const logs2 = ctx2.getLogs()
            const duplicateLog = logs2.find((l) => l[0] === 'Duplicate exit hint detected (in-memory cache)')
            assert.ok(duplicateLog, 'Should detect and log duplicate hint')
        })

        test('should process hints with different directions for same location', async () => {
            await setupOriginLocation({ hasPendingExit: true })
            const ctx1 = await fixture.createInvocationContext()
            const ctx2 = await fixture.createInvocationContext()

            const message1 = createValidHintMessage()
            ;(message1.payload as any).dir = 'north'

            const message2 = createValidHintMessage({
                eventId: '20000000-0000-4000-8000-000000000001'
            })
            ;(message2.payload as any).dir = 'south'

            await queueProcessExitGenerationHint(message1, ctx1 as any)
            await queueProcessExitGenerationHint(message2, ctx2 as any)

            const errors1 = ctx1.getErrors()
            const errors2 = ctx2.getErrors()
            assert.strictEqual(errors1.length, 0, 'First hint should process without errors')
            assert.strictEqual(errors2.length, 0, 'Second hint with different dir should process without errors')

            const logs2 = ctx2.getLogs()
            const materializedLog = logs2.find((l) => l[0] === 'Exit generation hint materialized')
            assert.ok(materializedLog, 'Should process hint with different direction')
        })

        test('should process hints for different locations with same direction', async () => {
            await setupOriginLocation({ hasPendingExit: true })

            // Set up a second origin location in the mock repo
            const secondOriginId = '30000000-0000-4000-8000-000000000001'
            const locationRepo = (await fixture.getLocationRepository()) as MockLocationRepository
            locationRepo.setLocation(secondOriginId, {
                id: secondOriginId,
                name: 'Second Origin',
                description: 'Another test origin',
                terrain: 'open-plain',
                tags: [],
                exits: [],
                exitAvailability: { pending: { north: '' } },
                version: 1
            })

            const ctx1 = await fixture.createInvocationContext()
            const ctx2 = await fixture.createInvocationContext()

            const message1 = createValidHintMessage()

            const message2 = createValidHintMessage({
                eventId: '20000000-0000-4000-8000-000000000001'
            })
            ;(message2.payload as any).originLocationId = secondOriginId

            await queueProcessExitGenerationHint(message1, ctx1 as any)
            await queueProcessExitGenerationHint(message2, ctx2 as any)

            const errors1 = ctx1.getErrors()
            const errors2 = ctx2.getErrors()
            assert.strictEqual(errors1.length, 0, 'First hint should process without errors')
            assert.strictEqual(errors2.length, 0, 'Second hint with different location should process without errors')
        })
    })

    describe('Wrong Event Type Handling', () => {
        test('should skip events with wrong type', async () => {
            const ctx = await fixture.createInvocationContext()
            const message = createValidHintMessage({ type: 'Player.Move' })

            await queueProcessExitGenerationHint(message, ctx as any)

            // Check that no processing log was emitted (event was skipped)
            const logs = ctx.getLogs()
            const receivedLog = logs.find((l) => l[0] === 'Exit generation hint received')
            assert.ok(!receivedLog, 'Should NOT log hint received for wrong event type')
        })
    })

    describe('DLQ Storage', () => {
        test('should store invalid payload in dead-letter queue', async () => {
            const ctx = await fixture.createInvocationContext()
            const container = ctx.extraInputs.get('container') as Container
            const stored: unknown[] = []

            const fakeRepo: IDeadLetterRepository = {
                async store(record) {
                    stored.push(record)
                },
                async queryByTimeRange() {
                    return []
                },
                async getById() {
                    return null
                }
            }

            container.unbind('IDeadLetterRepository')
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(fakeRepo)

            const message = createValidHintMessage()
            delete (message.payload as any).dir

            await queueProcessExitGenerationHint(message, ctx as any)

            assert.strictEqual(stored.length, 1, 'Should store one dead-letter record')
            const record = stored[0] as any
            assert.ok(record.error.category === 'invalid-payload', 'Should categorize as invalid-payload')
        })

        test('should store expired intent in dead-letter queue', async () => {
            const ctx = await fixture.createInvocationContext()
            const container = ctx.extraInputs.get('container') as Container
            const stored: unknown[] = []

            const fakeRepo: IDeadLetterRepository = {
                async store(record) {
                    stored.push(record)
                },
                async queryByTimeRange() {
                    return []
                },
                async getById() {
                    return null
                }
            }

            container.unbind('IDeadLetterRepository')
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(fakeRepo)

            const oldTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString()
            const message = createValidHintMessage()
            ;(message.payload as any).timestamp = oldTimestamp

            await queueProcessExitGenerationHint(message, ctx as any)

            assert.strictEqual(stored.length, 1, 'Should store one dead-letter record for expired hint')
            const record = stored[0] as any
            assert.ok(record.error.category === 'expired-intent', 'Should categorize as expired-intent')
        })
    })

    describe('All Valid Directions', () => {
        test('should accept all valid direction values', async () => {
            const validDirections = [
                'north',
                'south',
                'east',
                'west',
                'northeast',
                'northwest',
                'southeast',
                'southwest',
                'up',
                'down',
                'in',
                'out'
            ]

            for (const dir of validDirections) {
                __resetExitHintIdempotencyCacheForTests() // Reset to avoid duplicates
                await setupOriginLocation({ hasPendingExit: true, dir })
                const ctx = await fixture.createInvocationContext()
                const message = createValidHintMessage({
                    eventId: `00000000-0000-4000-8000-${String(validDirections.indexOf(dir)).padStart(12, '0')}`
                })
                ;(message.payload as any).dir = dir

                await queueProcessExitGenerationHint(message, ctx as any)

                const errors = ctx.getErrors()
                assert.strictEqual(errors.length, 0, `Direction '${dir}' should be valid`)
            }
        })
    })
})
