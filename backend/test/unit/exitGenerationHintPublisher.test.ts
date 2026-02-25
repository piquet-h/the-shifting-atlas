import type { ExitGenerationHintPayload } from '@piquet-h/shared/events'
import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { InMemoryExitGenerationHintPublisher } from '../../src/queues/exitGenerationHintPublisher.js'

function makePayload(overrides?: Partial<ExitGenerationHintPayload>): ExitGenerationHintPayload {
    return {
        dir: 'north',
        originLocationId: '00000000-0000-4000-8000-000000000101',
        playerId: '00000000-0000-4000-8000-000000000102',
        timestamp: '2026-02-25T00:00:00.000Z',
        debounced: false,
        ...overrides
    }
}

describe('InMemoryExitGenerationHintPublisher', () => {
    test('enqueueHint stores message when autodrain is disabled', async () => {
        const publisher = new InMemoryExitGenerationHintPublisher()

        await publisher.enqueueHint(makePayload(), 'corr-1')

        assert.equal(publisher.enqueuedMessages.length, 1)
        assert.equal(publisher.enqueuedMessages[0].type, 'Navigation.Exit.GenerationHint')
        assert.equal(publisher.enqueuedMessages[0].correlationId, 'corr-1')
    })

    test('autodrain processes queued hint synchronously and clears queue', async () => {
        const processed: string[] = []
        const publisher = new InMemoryExitGenerationHintPublisher({
            autoDrain: true,
            processMessage: async (message) => {
                processed.push(message.eventId)
            }
        })

        await publisher.enqueueHint(makePayload(), 'corr-2')

        assert.equal(processed.length, 1)
        assert.equal(publisher.enqueuedMessages.length, 0)
    })

    test('autodrain requeues failing message and rethrows', async () => {
        const publisher = new InMemoryExitGenerationHintPublisher({
            autoDrain: true,
            processMessage: async () => {
                throw new Error('hint processor failed')
            }
        })

        await assert.rejects(() => publisher.enqueueHint(makePayload(), 'corr-3'), /hint processor failed/)
        assert.equal(publisher.enqueuedMessages.length, 1)
    })
})
