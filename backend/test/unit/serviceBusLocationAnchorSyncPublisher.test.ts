/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ServiceBusClient, ServiceBusSender } from '@azure/service-bus'
import { strict as assert } from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import sinon from 'sinon'
import { ServiceBusLocationAnchorSyncPublisher } from '../../src/queues/locationAnchorSyncPublisher.js'

describe('ServiceBusLocationAnchorSyncPublisher', () => {
    let sender: {
        sendMessages: sinon.SinonStub
        close: sinon.SinonStub
    }
    let client: { createSender: sinon.SinonStub }
    let publisher: ServiceBusLocationAnchorSyncPublisher

    beforeEach(() => {
        sender = {
            sendMessages: sinon.stub().resolves(),
            close: sinon.stub().resolves()
        }

        client = {
            createSender: sinon.stub().returns(sender as unknown as ServiceBusSender)
        }

        publisher = new ServiceBusLocationAnchorSyncPublisher(client as unknown as ServiceBusClient)
    })

    test('sends queue message with body correlationId and application properties', async () => {
        await publisher.enqueueSync(5000, 'advance-test', 'corr-1')

        assert.ok(sender.sendMessages.calledOnce, 'sendMessages should be called once')

        const [[message]] = sender.sendMessages.args
        assert.equal((message as any).body.worldClockTick, 5000)
        assert.equal((message as any).body.advancementReason, 'advance-test')
        assert.equal((message as any).body.correlationId, 'corr-1')
        assert.equal((message as any).correlationId, 'corr-1')
        assert.equal((message as any).applicationProperties?.correlationId, 'corr-1')
        assert.equal((message as any).applicationProperties?.eventType, 'Location.Clock.SyncRequested')
    })

    test('allows undefined advancementReason while preserving correlationId', async () => {
        await publisher.enqueueSync(7000, undefined, 'corr-2')

        const [[message]] = sender.sendMessages.args
        assert.equal((message as any).body.worldClockTick, 7000)
        assert.equal((message as any).body.advancementReason, undefined)
        assert.equal((message as any).body.correlationId, 'corr-2')
    })

    test('closes sender even when sendMessages fails', async () => {
        sender.sendMessages.rejects(new Error('Service Bus unavailable'))

        await assert.rejects(() => publisher.enqueueSync(9000, 'fail-test', 'corr-3'), /Service Bus unavailable/)

        assert.ok(sender.close.calledOnce, 'sender.close should still be called on failure')
    })
})
