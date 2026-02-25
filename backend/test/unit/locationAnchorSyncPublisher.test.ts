import { strict as assert } from 'node:assert'
import { describe, test } from 'node:test'
import { InMemoryLocationAnchorSyncPublisher } from '../../src/queues/locationAnchorSyncPublisher.js'

describe('InMemoryLocationAnchorSyncPublisher', () => {
    test('enqueueSync stores payload when autodrain is disabled', async () => {
        const publisher = new InMemoryLocationAnchorSyncPublisher()

        await publisher.enqueueSync(5000, 'test-reason', 'corr-1')

        assert.equal(publisher.enqueuedMessages.length, 1)
        assert.equal((publisher.enqueuedMessages[0] as { worldClockTick: number }).worldClockTick, 5000)
    })

    test('autodrain processes queued message synchronously and clears queue', async () => {
        const processed: Array<{ worldClockTick: number; advancementReason?: string }> = []
        const publisher = new InMemoryLocationAnchorSyncPublisher({
            autoDrain: true,
            processMessage: async (message) => {
                processed.push(message as { worldClockTick: number; advancementReason?: string })
            }
        })

        await publisher.enqueueSync(7000, 'advance-test', 'corr-2')

        assert.equal(processed.length, 1)
        assert.equal(processed[0].worldClockTick, 7000)
        assert.equal(processed[0].advancementReason, 'advance-test')
        assert.equal(publisher.enqueuedMessages.length, 0)
    })

    test('autodrain requeues failing message and rethrows', async () => {
        const publisher = new InMemoryLocationAnchorSyncPublisher({
            autoDrain: true,
            processMessage: async () => {
                throw new Error('sync processor failed')
            }
        })

        await assert.rejects(() => publisher.enqueueSync(9000, 'fail-test', 'corr-3'), /sync processor failed/)
        assert.equal(publisher.enqueuedMessages.length, 1)
    })
})
