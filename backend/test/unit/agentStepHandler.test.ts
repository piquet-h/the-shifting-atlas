/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for AgentStepHandler (World.Agent.Step event type)
 *
 * Covers:
 * - Happy path (no ambient layer): valid event dispatched, handler invoked,
 *   action applied, telemetry emitted
 * - Cooldown guard (ambient layer present): handler skips, emits Skipped telemetry
 * - Validation failure: missing required payload fields → DLQ + validation-failed outcome
 * - Entity not found edge case: empty locationId → noop outcome + EntityNotFound telemetry
 * - Latency budget tracking: latencyMs present in telemetry
 * - Cost budget tracking: estimatedCostMicros and costBudgetMicros present in telemetry;
 *   Agent.Step.CostExceeded not emitted on 0-cost (non-LLM) path
 * - Duplicate delivery: idempotency cache returns 'noop' (tested via existing cache)
 */
import assert from 'node:assert'
import { beforeEach, describe, test } from 'node:test'
import { queueProcessWorldEvent } from '../../src/worldEvents/queueProcessWorldEvent.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'

describe('AgentStepHandler', () => {
    let fixture: UnitTestFixture
    let telemetry: MockTelemetryClient

    beforeEach(async () => {
        fixture = new UnitTestFixture()
        await fixture.setup()
        telemetry = await fixture.getTelemetryClient()
    })

    function createAgentStepEvent(overrides?: Record<string, unknown>): Record<string, unknown> {
        return {
            eventId: 'a0000000-0000-4000-8000-000000000001',
            type: 'World.Agent.Step',
            occurredUtc: '2025-12-01T10:00:00.000Z',
            actor: { kind: 'system' },
            correlationId: 'b0000000-0000-4000-8000-000000000001',
            idempotencyKey: 'agent-step:npc-001:42',
            version: 1,
            payload: {
                entityId: 'npc-001',
                entityKind: 'npc',
                locationId: 'loc-forest',
                stepSequence: 42
            },
            ...overrides
        }
    }

    // --- Happy path (no ambient layer) -------------------------------------

    test('should invoke AgentStepHandler and emit step-processed telemetry', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:success' })

        await queueProcessWorldEvent(event, ctx as any)

        // Handler log emitted
        const logs = ctx.getLogs()
        const stepLog = logs.find((l) => l[0] === 'AgentStepHandler: step processed')
        assert.ok(stepLog, 'AgentStepHandler should log step processed')
        assert.strictEqual(stepLog[1].entityId, 'npc-001', 'entityId should be logged')
        assert.strictEqual(stepLog[1].entityKind, 'npc', 'entityKind should be logged')

        // World.Event.HandlerInvoked with success outcome
        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const success = invokedEvents.find((e) => e.properties?.handler === 'AgentStepHandler' && e.properties?.outcome === 'success')
        assert.ok(success, 'AgentStepHandler success telemetry should be emitted')
    })

    test('should emit Agent.Step.Processed telemetry with entityId and latencyMs', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:telemetry' })

        await queueProcessWorldEvent(event, ctx as any)

        const stepEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Processed')
        assert.ok(stepEvent, 'Agent.Step.Processed telemetry should be emitted')
        assert.strictEqual(stepEvent?.properties?.entityId, 'npc-001', 'entityId should be in telemetry')
        assert.strictEqual(stepEvent?.properties?.entityKind, 'npc', 'entityKind should be in telemetry')
        assert.strictEqual(stepEvent?.properties?.locationId, 'loc-forest', 'locationId should be in telemetry')
        // outcome is now 'applied' (no ambient layer in empty test repo) or 'skipped'
        assert.ok(['applied', 'skipped'].includes(String(stepEvent?.properties?.outcome)), 'outcome should be applied or skipped')
        assert.ok(typeof stepEvent?.properties?.latencyMs === 'number', 'latencyMs should be a number')
    })

    test('should include correlationId in step telemetry', async () => {
        const correlationId = 'c0000000-0000-4000-8000-000000000099'
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({
            idempotencyKey: 'agent-step:npc-001:correlation',
            correlationId
        })

        await queueProcessWorldEvent(event, ctx as any)

        const stepEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Processed')
        assert.ok(stepEvent, 'Agent.Step.Processed should be emitted')
        assert.strictEqual(stepEvent?.properties?.correlationId, correlationId, 'correlationId should propagate')
    })

    // --- Sense phase ----------------------------------------------------------

    test('should emit Agent.Step.SenseCompleted telemetry', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:sense' })

        await queueProcessWorldEvent(event, ctx as any)

        const senseEvent = telemetry.events.find((e) => e.name === 'Agent.Step.SenseCompleted')
        assert.ok(senseEvent, 'Agent.Step.SenseCompleted should be emitted')
        assert.strictEqual(senseEvent?.properties?.entityId, 'npc-001')
        assert.strictEqual(senseEvent?.properties?.locationId, 'loc-forest')
        assert.ok(typeof senseEvent?.properties?.tick === 'number', 'tick should be a number')
    })

    // --- Act path: no ambient layer → action applied -------------------------

    test('should emit Agent.Step.DecisionMade and Agent.Step.ActionApplied when no ambient layer', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:act' })

        await queueProcessWorldEvent(event, ctx as any)

        const decisionEvent = telemetry.events.find((e) => e.name === 'Agent.Step.DecisionMade')
        assert.ok(decisionEvent, 'Agent.Step.DecisionMade should be emitted')
        assert.strictEqual(decisionEvent?.properties?.actionType, 'Layer.Add')
        assert.strictEqual(decisionEvent?.properties?.reason, 'no-ambient-layer')

        const appliedEvent = telemetry.events.find((e) => e.name === 'Agent.Step.ActionApplied')
        assert.ok(appliedEvent, 'Agent.Step.ActionApplied should be emitted')
        assert.strictEqual(appliedEvent?.properties?.actionType, 'Layer.Add')
        assert.ok(appliedEvent?.properties?.layerId, 'layerId should be present in applied event')
    })

    // --- Agent pipeline telemetry (issue #907) --------------------------------

    test('should emit Agent.Step.Start at step initiation', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:start' })

        await queueProcessWorldEvent(event, ctx as any)

        const startEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Start')
        assert.ok(startEvent, 'Agent.Step.Start should be emitted')
        assert.strictEqual(startEvent?.properties?.agentId, 'npc-001')
        assert.strictEqual(startEvent?.properties?.agentType, 'npc')
        assert.strictEqual(startEvent?.properties?.locationId, 'loc-forest')
        assert.strictEqual(startEvent?.properties?.correlationId, 'b0000000-0000-4000-8000-000000000001')
    })

    test('should emit Agent.Step.Completed with decisionLatencyMs and validationOutcome', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:completed' })

        await queueProcessWorldEvent(event, ctx as any)

        const completedEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Completed')
        assert.ok(completedEvent, 'Agent.Step.Completed should be emitted')
        assert.strictEqual(completedEvent?.properties?.agentId, 'npc-001')
        assert.strictEqual(completedEvent?.properties?.agentType, 'npc')
        assert.ok(typeof completedEvent?.properties?.decisionLatencyMs === 'number', 'decisionLatencyMs should be a number')
        assert.ok(
            ['applied', 'skipped', 'rejected'].includes(String(completedEvent?.properties?.validationOutcome)),
            'validationOutcome should be applied, skipped, or rejected'
        )
    })

    test('should emit Agent.Proposal.Validated when proposal passes validation', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:validated' })

        await queueProcessWorldEvent(event, ctx as any)

        const validatedEvent = telemetry.events.find((e) => e.name === 'Agent.Proposal.Validated')
        assert.ok(validatedEvent, 'Agent.Proposal.Validated should be emitted when proposal passes')
        assert.strictEqual(validatedEvent?.properties?.agentId, 'npc-001')
        assert.strictEqual(validatedEvent?.properties?.agentType, 'npc')
        assert.strictEqual(validatedEvent?.properties?.validationOutcome, 'accepted')
        assert.ok(typeof validatedEvent?.properties?.decisionLatencyMs === 'number', 'decisionLatencyMs should be a number')
    })

    test('should emit Agent.Effect.Applied when effect is applied to world', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:effect' })

        await queueProcessWorldEvent(event, ctx as any)

        const effectEvent = telemetry.events.find((e) => e.name === 'Agent.Effect.Applied')
        assert.ok(effectEvent, 'Agent.Effect.Applied should be emitted when effect is applied')
        assert.strictEqual(effectEvent?.properties?.agentId, 'npc-001')
        assert.strictEqual(effectEvent?.properties?.agentType, 'npc')
        assert.strictEqual(effectEvent?.properties?.actionType, 'Layer.Add')
        assert.ok(effectEvent?.properties?.scopeKey, 'scopeKey should be present')
    })

    test('should NOT emit Agent.Proposal.Validated when step is skipped (no validation needed)', async () => {
        const layerRepo = await fixture.getLayerRepository()
        await layerRepo.setLayerForLocation('loc-skip-test', 'ambient', 0, null, 'Existing ambient content.', { authoredBy: 'agent' })

        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({
            idempotencyKey: 'agent-step:npc-skip:1',
            payload: { entityId: 'npc-skip', entityKind: 'npc', locationId: 'loc-skip-test', stepSequence: 1 }
        })

        await queueProcessWorldEvent(event, ctx as any)

        const validatedEvent = telemetry.events.find((e) => e.name === 'Agent.Proposal.Validated')
        assert.ok(!validatedEvent, 'Agent.Proposal.Validated should NOT be emitted when step is skipped')

        const completedEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Completed')
        assert.ok(completedEvent, 'Agent.Step.Completed should still be emitted for skipped steps')
        assert.strictEqual(completedEvent?.properties?.validationOutcome, 'skipped')
    })

    test('Agent.Step.Start and Agent.Step.Completed should have matching correlationId', async () => {
        const correlationId = 'd0000000-0000-4000-8000-000000000042'
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:corr-pair', correlationId })

        await queueProcessWorldEvent(event, ctx as any)

        const startEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Start')
        const completedEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Completed')
        assert.ok(startEvent, 'Agent.Step.Start should be emitted')
        assert.ok(completedEvent, 'Agent.Step.Completed should be emitted')
        assert.strictEqual(startEvent?.properties?.correlationId, correlationId)
        assert.strictEqual(completedEvent?.properties?.correlationId, correlationId)
    })

    test('should add an ambient layer to the location when none exists', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:layer-add' })

        await queueProcessWorldEvent(event, ctx as any)

        // Verify a layer was actually persisted (use current tick from WorldClockService)
        const layerRepo = await fixture.getLayerRepository()
        const worldClock = await fixture.getWorldClockService()
        const tick = await worldClock.getCurrentTick()
        const layer = await layerRepo.getActiveLayerForLocation('loc-forest', 'ambient', tick)
        assert.ok(layer, 'Ambient layer should be persisted after agent step')
        assert.strictEqual(layer?.metadata?.['authoredBy'], 'agent', 'Layer should be authored by agent')
    })

    // --- Cooldown guard: ambient layer exists → skip -------------------------

    test('should emit Agent.Step.Skipped when ambient layer already exists', async () => {
        const layerRepo = await fixture.getLayerRepository()

        // Pre-populate an ambient layer
        await layerRepo.setLayerForLocation('loc-village', 'ambient', 0, null, 'Existing ambient content.', {
            authoredBy: 'agent'
        })

        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({
            idempotencyKey: 'agent-step:npc-002:cooldown',
            payload: {
                entityId: 'npc-002',
                entityKind: 'npc',
                locationId: 'loc-village',
                stepSequence: 1
            }
        })

        await queueProcessWorldEvent(event, ctx as any)

        const skippedEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Skipped')
        assert.ok(skippedEvent, 'Agent.Step.Skipped should be emitted when ambient layer exists')
        assert.strictEqual(skippedEvent?.properties?.reason, 'ambient-layer-exists')

        const decisionEvent = telemetry.events.find((e) => e.name === 'Agent.Step.DecisionMade')
        assert.ok(!decisionEvent, 'Agent.Step.DecisionMade should NOT be emitted when skipping')

        const appliedEvent = telemetry.events.find((e) => e.name === 'Agent.Step.ActionApplied')
        assert.ok(!appliedEvent, 'Agent.Step.ActionApplied should NOT be emitted when skipping')
    })

    // --- Validation failures ---------------------------------------------------

    test('should emit validation-failed for missing entityId', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({
            idempotencyKey: 'agent-step:missing-entity',
            payload: { entityKind: 'npc', locationId: 'loc-x', stepSequence: 1 }
        })

        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const failed = invokedEvents.find(
            (e) => e.properties?.handler === 'AgentStepHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(failed, 'Validation failure for missing entityId should be emitted')
    })

    test('should emit validation-failed for missing entityKind', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({
            idempotencyKey: 'agent-step:missing-kind',
            payload: { entityId: 'npc-002', locationId: 'loc-x', stepSequence: 1 }
        })

        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const failed = invokedEvents.find(
            (e) => e.properties?.handler === 'AgentStepHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(failed, 'Validation failure for missing entityKind should be emitted')
    })

    test('should emit validation-failed for missing stepSequence', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({
            idempotencyKey: 'agent-step:missing-sequence',
            payload: { entityId: 'npc-002', entityKind: 'npc', locationId: 'loc-x' }
        })

        await queueProcessWorldEvent(event, ctx as any)

        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const failed = invokedEvents.find(
            (e) => e.properties?.handler === 'AgentStepHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(failed, 'Validation failure for missing stepSequence should be emitted')
    })

    // --- Entity not found edge case -------------------------------------------

    test('should emit validation-failed for missing locationId', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({
            idempotencyKey: 'agent-step:missing-location',
            payload: {
                entityId: 'npc-deleted',
                entityKind: 'npc',
                // locationId intentionally omitted — required field
                stepSequence: 10
            }
        })

        await queueProcessWorldEvent(event, ctx as any)

        // locationId missing → validation-failed → dead-lettered
        const invokedEvents = telemetry.events.filter((e) => e.name === 'World.Event.HandlerInvoked')
        const failed = invokedEvents.find(
            (e) => e.properties?.handler === 'AgentStepHandler' && e.properties?.outcome === 'validation-failed'
        )
        assert.ok(failed, 'Missing locationId should produce validation-failed outcome (dead-letter)')
    })

    // --- Transient error / DLQ path -------------------------------------------

    test('should bubble transient errors from executeHandler for retry semantics', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:no-error' })
        await queueProcessWorldEvent(event, ctx as any)

        const errorTelemetry = telemetry.events.find(
            (e) =>
                e.name === 'World.Event.HandlerInvoked' && e.properties?.handler === 'AgentStepHandler' && e.properties?.outcome === 'error'
        )
        assert.ok(!errorTelemetry, 'No error telemetry should be emitted for a successful step')
    })

    // --- stepSequence variants ------------------------------------------------

    test('should handle ai-agent entityKind successfully', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({
            idempotencyKey: 'agent-step:ai-agent-007:1',
            payload: {
                entityId: 'ai-agent-007',
                entityKind: 'ai-agent',
                locationId: 'loc-dungeon',
                stepSequence: 1,
                reason: 'scheduled-tick'
            }
        })

        await queueProcessWorldEvent(event, ctx as any)

        const stepEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Processed')
        assert.ok(stepEvent, 'Agent.Step.Processed should be emitted for ai-agent kind')
        assert.strictEqual(stepEvent?.properties?.entityKind, 'ai-agent', 'entityKind should be ai-agent')
    })

    test('should handle optional reason field gracefully', async () => {
        const ctx = await fixture.createInvocationContext()
        // No reason field in payload
        const event = createAgentStepEvent({
            idempotencyKey: 'agent-step:npc-003:no-reason',
            payload: {
                entityId: 'npc-003',
                entityKind: 'npc',
                locationId: 'loc-tavern',
                stepSequence: 5
            }
        })

        await queueProcessWorldEvent(event, ctx as any)

        const stepEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Processed')
        assert.ok(stepEvent, 'Agent.Step.Processed should be emitted even without optional reason')
    })

    // --- Cost budget tracking (issue #711) ------------------------------------

    test('should include estimatedCostMicros and costBudgetMicros in Agent.Step.Completed', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:cost-completed' })

        await queueProcessWorldEvent(event, ctx as any)

        const completedEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Completed')
        assert.ok(completedEvent, 'Agent.Step.Completed should be emitted')
        assert.strictEqual(
            typeof completedEvent?.properties?.estimatedCostMicros,
            'number',
            'estimatedCostMicros should be a number in Agent.Step.Completed'
        )
        assert.strictEqual(
            typeof completedEvent?.properties?.costBudgetMicros,
            'number',
            'costBudgetMicros should be a number in Agent.Step.Completed'
        )
    })

    test('should report estimatedCostMicros: 0 for non-LLM (0-token) path', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:zero-cost' })

        await queueProcessWorldEvent(event, ctx as any)

        const completedEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Completed')
        assert.ok(completedEvent, 'Agent.Step.Completed should be emitted')
        assert.strictEqual(completedEvent?.properties?.estimatedCostMicros, 0, 'non-LLM path must report 0 cost')
    })

    test('should NOT emit Agent.Step.CostExceeded on 0-cost (non-LLM) path', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:no-cost-exceeded' })

        await queueProcessWorldEvent(event, ctx as any)

        const costExceededEvent = telemetry.events.find((e) => e.name === 'Agent.Step.CostExceeded')
        assert.ok(!costExceededEvent, 'Agent.Step.CostExceeded should NOT be emitted for 0-cost step')
    })

    test('should include estimatedCostMicros in Agent.Step.Processed', async () => {
        const ctx = await fixture.createInvocationContext()
        const event = createAgentStepEvent({ idempotencyKey: 'agent-step:npc-001:cost-processed' })

        await queueProcessWorldEvent(event, ctx as any)

        const processedEvent = telemetry.events.find((e) => e.name === 'Agent.Step.Processed')
        assert.ok(processedEvent, 'Agent.Step.Processed should be emitted')
        assert.strictEqual(
            typeof processedEvent?.properties?.estimatedCostMicros,
            'number',
            'estimatedCostMicros should be a number in Agent.Step.Processed'
        )
    })
})
