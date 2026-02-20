/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for ServiceBusWorldEventPublisher
 *
 * Validates:
 * - enqueueEvents() calls sender.sendMessages() with the expected count
 * - enqueueEvents([]) is a no-op (Service Bus not called)
 * - failures propagate (so queue retry semantics can apply upstream)
 * - correlationId is stamped in application properties
 * - batch overflow: second batch is created when first is full
 */
import type { ServiceBusClient, ServiceBusSender } from '@azure/service-bus'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { strict as assert } from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import sinon from 'sinon'
import { ServiceBusWorldEventPublisher } from '../../src/worldEvents/worldEventPublisher.js'

function makeEnvelope(overrides?: Partial<WorldEventEnvelope>): WorldEventEnvelope {
    return {
        eventId: '00000000-0000-4000-8000-000000000001',
        type: 'Player.Move',
        occurredUtc: '2025-10-05T12:00:00.000Z',
        actor: { kind: 'player', id: '00000000-0000-4000-8000-000000000002' },
        correlationId: '00000000-0000-4000-8000-000000000003',
        idempotencyKey: 'player-move-test-key-1',
        version: 1,
        payload: { fromLocationId: 'loc-1', toLocationId: 'loc-2', direction: 'north' },
        ...overrides
    } as WorldEventEnvelope
}

describe('ServiceBusWorldEventPublisher', () => {
    let batch: {
        tryAddMessage: sinon.SinonStub
        _messages: unknown[]
    }
    let sender: {
        createMessageBatch: sinon.SinonStub
        sendMessages: sinon.SinonStub
        close: sinon.SinonStub
    }
    let client: { createSender: sinon.SinonStub }
    let publisher: ServiceBusWorldEventPublisher

    beforeEach(() => {
        batch = {
            tryAddMessage: sinon.stub().returns(true),
            _messages: []
        }
        sender = {
            createMessageBatch: sinon.stub().resolves(batch),
            sendMessages: sinon.stub().resolves(),
            close: sinon.stub().resolves()
        }
        client = {
            createSender: sinon.stub().returns(sender as unknown as ServiceBusSender)
        }
        publisher = new ServiceBusWorldEventPublisher(client as unknown as ServiceBusClient)
    })

    describe('enqueueEvents()', () => {
        test('sends all events via sendMessages', async () => {
            const events = [makeEnvelope(), makeEnvelope({ eventId: '00000000-0000-4000-8000-000000000002', idempotencyKey: 'key-2' })]

            await publisher.enqueueEvents(events)

            assert.ok(sender.sendMessages.calledOnce, 'sendMessages should be called once')
            assert.ok(batch.tryAddMessage.calledTwice, 'tryAddMessage should be called for each event')
        })

        test('stamps correlationId in application properties', async () => {
            const event = makeEnvelope({ correlationId: 'corr-abc-123' })
            await publisher.enqueueEvents([event])

            const [[msg]] = batch.tryAddMessage.args
            assert.equal((msg as any).correlationId, 'corr-abc-123')
            assert.equal((msg as any).applicationProperties?.correlationId, 'corr-abc-123')
        })

        test('stamps eventType in application properties', async () => {
            const event = makeEnvelope({ type: 'World.Exit.Create' })
            await publisher.enqueueEvents([event])

            const [[msg]] = batch.tryAddMessage.args
            assert.equal((msg as any).applicationProperties?.eventType, 'World.Exit.Create')
        })

        test('enqueueEvents([]) is a no-op and does not call Service Bus', async () => {
            await publisher.enqueueEvents([])

            assert.ok(client.createSender.notCalled, 'createSender should not be called for empty input')
            assert.ok(sender.sendMessages.notCalled, 'sendMessages should not be called for empty input')
        })

        test('closes sender in finally block even on sendMessages failure', async () => {
            sender.sendMessages.rejects(new Error('Service Bus unavailable'))

            await assert.rejects(() => publisher.enqueueEvents([makeEnvelope()]), /Service Bus unavailable/)

            assert.ok(sender.close.calledOnce, 'sender.close should still be called on failure')
        })

        test('propagates sendMessages error to caller', async () => {
            const err = new Error('transient send failure')
            sender.sendMessages.rejects(err)

            await assert.rejects(
                () => publisher.enqueueEvents([makeEnvelope()]),
                (thrown: Error) => {
                    assert.equal(thrown.message, 'transient send failure')
                    return true
                }
            )
        })

        test('creates a second batch when first batch is full', async () => {
            // First batch rejects the second message, second batch accepts everything
            const fullBatch = {
                tryAddMessage: sinon.stub()
            }
            const overflowBatch = {
                tryAddMessage: sinon.stub().returns(true)
            }
            fullBatch.tryAddMessage.onFirstCall().returns(true)
            fullBatch.tryAddMessage.onSecondCall().returns(false)

            sender.createMessageBatch.onFirstCall().resolves(fullBatch)
            sender.createMessageBatch.onSecondCall().resolves(overflowBatch)

            const events = [makeEnvelope(), makeEnvelope({ eventId: '00000000-0000-4000-8000-000000000002', idempotencyKey: 'key-2' })]
            await publisher.enqueueEvents(events)

            assert.equal(sender.createMessageBatch.callCount, 2, 'Should create a second batch on overflow')
            assert.equal(sender.sendMessages.callCount, 2, 'Should send both batches')
        })

        test('throws if a single event is too large to fit in an empty batch', async () => {
            const oversizedBatch = { tryAddMessage: sinon.stub().returns(false) }
            sender.createMessageBatch.resolves(oversizedBatch)

            await assert.rejects(() => publisher.enqueueEvents([makeEnvelope()]), /too large to fit in a single Service Bus message batch/)
        })
    })
})
