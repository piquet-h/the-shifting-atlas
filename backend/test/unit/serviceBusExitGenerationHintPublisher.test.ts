/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ServiceBusClient, ServiceBusSender } from '@azure/service-bus'
import { strict as assert } from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import sinon from 'sinon'
import { ServiceBusExitGenerationHintPublisher } from '../../src/queues/exitGenerationHintPublisher.js'

describe('ServiceBusExitGenerationHintPublisher', () => {
    let sender: {
        sendMessages: sinon.SinonStub
        close: sinon.SinonStub
    }
    let client: { createSender: sinon.SinonStub }
    let publisher: ServiceBusExitGenerationHintPublisher

    beforeEach(() => {
        sender = {
            sendMessages: sinon.stub().resolves(),
            close: sinon.stub().resolves()
        }

        client = {
            createSender: sinon.stub().returns(sender as unknown as ServiceBusSender)
        }

        publisher = new ServiceBusExitGenerationHintPublisher(client as unknown as ServiceBusClient)
    })

    test('sends envelope with correlationId and eventType application property', async () => {
        const payload = {
            dir: 'north',
            originLocationId: '00000000-0000-4000-8000-000000000101',
            playerId: '00000000-0000-4000-8000-000000000102',
            timestamp: '2026-02-25T00:00:00.000Z',
            debounced: false
        } as const

        await publisher.enqueueHint(payload, 'corr-1')

        assert.ok(sender.sendMessages.calledOnce, 'sendMessages should be called once')
        const [[message]] = sender.sendMessages.args

        assert.equal((message as any).correlationId, 'corr-1')
        assert.equal((message as any).applicationProperties?.correlationId, 'corr-1')
        assert.equal((message as any).applicationProperties?.eventType, 'Navigation.Exit.GenerationHint')
        assert.equal((message as any).body.correlationId, 'corr-1')
        assert.equal((message as any).body.type, 'Navigation.Exit.GenerationHint')
        assert.equal((message as any).body.payload.originLocationId, payload.originLocationId)
        assert.equal((message as any).body.idempotencyKey, `${payload.originLocationId}:${payload.dir}`)
    })

    test('generates a distinct eventId per enqueue', async () => {
        const payload = {
            dir: 'north',
            originLocationId: '00000000-0000-4000-8000-000000000101',
            playerId: '00000000-0000-4000-8000-000000000102',
            timestamp: '2026-02-25T00:00:00.000Z',
            debounced: false
        } as const

        await publisher.enqueueHint(payload, 'corr-1')
        await publisher.enqueueHint(payload, 'corr-2')

        const firstMessage = sender.sendMessages.args[0][0] as any
        const secondMessage = sender.sendMessages.args[1][0] as any

        assert.notEqual(firstMessage.body.eventId, secondMessage.body.eventId)
        assert.equal(firstMessage.body.idempotencyKey, secondMessage.body.idempotencyKey)
    })

    test('closes sender even when sendMessages fails', async () => {
        const payload = {
            dir: 'north',
            originLocationId: '00000000-0000-4000-8000-000000000101',
            playerId: '00000000-0000-4000-8000-000000000102',
            timestamp: '2026-02-25T00:00:00.000Z',
            debounced: false
        } as const

        sender.sendMessages.rejects(new Error('Service Bus unavailable'))

        await assert.rejects(() => publisher.enqueueHint(payload, 'corr-3'), /Service Bus unavailable/)
        assert.ok(sender.close.calledOnce, 'sender.close should still be called on failure')
    })
})
