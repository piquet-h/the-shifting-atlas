/**
 * AgentStepHandler — World.Agent.Step event handler
 *
 * Queue-only runtime hook for autonomous agent loops (sense→decide→act).
 * Enforces latency budget and emits structured telemetry.
 *
 * Payload (v1):
 * {
 *   entityId:      string  — UUID of the entity running the step
 *   entityKind:    string  — 'npc' | 'ai-agent' | 'player'
 *   locationId:    string  — Current location context (UUID)
 *   stepSequence:  number  — Monotonic counter used in idempotency key
 *   reason?:       string  — Optional reason the step was triggered (diagnostics only)
 * }
 *
 * Idempotency: key is 'agent-step:{entityId}:{stepSequence}' — enforced by the
 * upstream WorldEventEnvelope idempotencyKey field. Duplicate delivery returns
 * 'noop' without re-executing.
 *
 * Latency budget: configurable via AGENT_STEP_LATENCY_BUDGET_MS env var
 * (default 5000 ms). Exceeding it emits Agent.Step.LatencyExceeded telemetry
 * and still completes (no hard abort — agent logic must remain idempotent).
 *
 * Edge cases:
 * - Entity no longer exists → outcome: 'noop', emits Agent.Step.EntityNotFound
 * - Transient error in downstream logic → throws, triggers Service Bus retry → DLQ
 */

import type { InvocationContext } from '@azure/functions'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { IDeadLetterRepository } from '../../repos/deadLetterRepository.js'
import { TelemetryService } from '../../telemetry/TelemetryService.js'
import type { WorldEventHandlerResult } from '../types.js'
import { BaseWorldEventHandler, type ValidationResult } from './base/BaseWorldEventHandler.js'

/** Default latency budget for a single agent step (ms). Override via env var. */
const DEFAULT_LATENCY_BUDGET_MS = 5_000

function getLatencyBudgetMs(): number {
    const raw = process.env.AGENT_STEP_LATENCY_BUDGET_MS
    if (raw) {
        const parsed = parseInt(raw, 10)
        if (!isNaN(parsed) && parsed > 0) return parsed
    }
    return DEFAULT_LATENCY_BUDGET_MS
}

/** Handler for World.Agent.Step events — placeholder execution framework */
@injectable()
export class AgentStepHandler extends BaseWorldEventHandler {
    public readonly type = 'World.Agent.Step'

    constructor(
        @inject('IDeadLetterRepository') deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) telemetry: TelemetryService
    ) {
        super(deadLetterRepo, telemetry)
    }

    /**
     * Validate required payload fields.
     * Missing any of entityId, entityKind, locationId, stepSequence → validation-failed → DLQ.
     */
    protected validatePayload(payload: unknown): ValidationResult {
        const { entityId, entityKind, locationId, stepSequence } = payload as Record<string, unknown>

        const missing: string[] = []
        if (typeof entityId !== 'string' || !entityId) missing.push('entityId')
        if (typeof entityKind !== 'string' || !entityKind) missing.push('entityKind')
        if (typeof locationId !== 'string' || !locationId) missing.push('locationId')
        if (typeof stepSequence !== 'number') missing.push('stepSequence')

        return missing.length ? { valid: false, missing } : { valid: true, missing: [] }
    }

    /**
     * Execute agent step.
     *
     * Currently a well-structured placeholder (decision logic is out of scope per
     * issue #699 — that belongs to the write-lite agent sandbox in #703).
     * Infrastructure is complete: latency enforcement, telemetry, and idempotency.
     *
     * Edge case — entity no longer exists: in a future iteration, an entity
     * repository lookup will gate here before executing sense/decide/act. If the
     * entity is gone, return 'noop' and emit Agent.Step.EntityNotFound telemetry.
     * For now, well-formed payloads always proceed.
     */
    protected async executeHandler(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        const { entityId, entityKind, locationId, stepSequence, reason } = event.payload as Record<string, unknown>

        const startMs = Date.now()
        const budgetMs = getLatencyBudgetMs()

        // Placeholder: actual sense→decide→act logic will be added in #703.
        // Any transient error here will bubble to the queue and trigger retry/DLQ.
        context.log('AgentStepHandler: step initiated', { entityId, entityKind, locationId, stepSequence, reason })

        const latencyMs = Date.now() - startMs

        // Emit latency budget warning when exceeded (non-blocking — step already completed).
        if (latencyMs > budgetMs) {
            context.warn('AgentStepHandler: latency budget exceeded', { latencyMs, budgetMs, entityId })
            this.telemetry.trackGameEvent(
                'Agent.Step.LatencyExceeded',
                {
                    entityId: String(entityId),
                    entityKind: String(entityKind),
                    latencyMs,
                    budgetMs,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
        }

        // Emit domain step telemetry.
        this.telemetry.trackGameEvent(
            'Agent.Step.Processed',
            {
                entityId: String(entityId),
                entityKind: String(entityKind),
                locationId: String(locationId),
                stepSequence,
                outcome: 'success',
                latencyMs,
                correlationId: event.correlationId,
                causationId: event.causationId
            },
            { correlationId: event.correlationId }
        )

        context.log('AgentStepHandler: step processed', { entityId, entityKind, locationId, stepSequence, latencyMs })
        return { outcome: 'success', details: 'step-processed' }
    }
}
