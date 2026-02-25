import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { InMemoryWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'

function makeEnvelope(overrides?: Partial<WorldEventEnvelope>): WorldEventEnvelope {
    return {
        eventId: '00000000-0000-4000-8000-000000000010',
        type: 'World.Exit.Create',
        occurredUtc: '2026-02-25T00:00:00.000Z',
        actor: { kind: 'system' },
        correlationId: '00000000-0000-4000-8000-000000000011',
        idempotencyKey: 'test-key-1',
        version: 1,
        payload: {
            fromLocationId: '00000000-0000-4000-8000-000000000012',
            toLocationId: '00000000-0000-4000-8000-000000000013',
            direction: 'north',
            reciprocal: true
        },
        ...overrides
    } as WorldEventEnvelope
}

describe('InMemoryWorldEventPublisher', () => {
    test('enqueueEvents stores events when autodrain is disabled', async () => {
        const publisher = new InMemoryWorldEventPublisher()
        const event = makeEnvelope()

        await publisher.enqueueEvents([event])

        assert.equal(publisher.enqueuedEvents.length, 1)
        assert.equal(publisher.enqueuedEvents[0].eventId, event.eventId)
    })

    test('autodrain processes queued events synchronously and clears queue', async () => {
        const processed: string[] = []
        const publisher = new InMemoryWorldEventPublisher({
            autoDrain: true,
            processEvent: async (event) => {
                processed.push(event.eventId)
            }
        })

        const eventA = makeEnvelope({ eventId: '00000000-0000-4000-8000-000000000021', idempotencyKey: 'test-key-21' })
        const eventB = makeEnvelope({ eventId: '00000000-0000-4000-8000-000000000022', idempotencyKey: 'test-key-22' })

        await publisher.enqueueEvents([eventA, eventB])

        assert.deepEqual(processed, [eventA.eventId, eventB.eventId])
        assert.equal(publisher.enqueuedEvents.length, 0)
    })

    test('autodrain handles nested enqueue during processing in FIFO order', async () => {
        const processed: string[] = []
        const eventA = makeEnvelope({ eventId: '00000000-0000-4000-8000-000000000031', idempotencyKey: 'test-key-31' })
        const eventB = makeEnvelope({ eventId: '00000000-0000-4000-8000-000000000032', idempotencyKey: 'test-key-32' })

        let publisher: InMemoryWorldEventPublisher
        publisher = new InMemoryWorldEventPublisher({
            autoDrain: true,
            processEvent: async (event) => {
                processed.push(event.eventId)
                if (event.eventId === eventA.eventId) {
                    await publisher.enqueueEvents([eventB])
                }
            }
        })

        await publisher.enqueueEvents([eventA])

        assert.deepEqual(processed, [eventA.eventId, eventB.eventId])
        assert.equal(publisher.enqueuedEvents.length, 0)
    })

    test('autodrain requeues failing event at head and rethrows', async () => {
        const eventA = makeEnvelope({ eventId: '00000000-0000-4000-8000-000000000041', idempotencyKey: 'test-key-41' })
        const eventB = makeEnvelope({ eventId: '00000000-0000-4000-8000-000000000042', idempotencyKey: 'test-key-42' })
        const publisher = new InMemoryWorldEventPublisher({
            autoDrain: true,
            processEvent: async (event) => {
                if (event.eventId === eventA.eventId) {
                    throw new Error('processor failed')
                }
            }
        })

        await assert.rejects(() => publisher.enqueueEvents([eventA, eventB]), /processor failed/)
        assert.equal(publisher.enqueuedEvents.length, 2)
        assert.equal(publisher.enqueuedEvents[0].eventId, eventA.eventId)
        assert.equal(publisher.enqueuedEvents[1].eventId, eventB.eventId)
    })
})
