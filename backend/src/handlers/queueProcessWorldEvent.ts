/**
 * World Event Queue Processor Handler
 *
 * Asynchronous world evolution event processor. Validates incoming events,
 * enforces idempotency via durable registry, and emits telemetry.
 *
 * Configuration (env vars):
 * - PROCESSED_EVENTS_TTL_SECONDS: TTL for processed events registry (default: 604800 = 7 days)
 * - WORLD_EVENT_DUPE_TTL_MS: In-memory cache TTL in milliseconds (default: 600000 = 10 minutes)
 * - WORLD_EVENT_CACHE_MAX_SIZE: Max entries in idempotency cache before eviction (default: 10000)
 */
import type { InvocationContext } from '@azure/functions'
import { enrichWorldEventAttributes } from '@piquet-h/shared'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { safeValidateWorldEventEnvelope } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import { WORLD_EVENT_CACHE_MAX_SIZE, WORLD_EVENT_DUPLICATE_TTL_MS } from '../config/worldEventProcessorConfig.js'
import type { IDeadLetterRepository } from '../repos/deadLetterRepository.js'
import type { IProcessedEventRepository } from '../repos/processedEventRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { buildWorldEventHandlerRegistry } from '../worldEvents/registry.js'
import type { IWorldEventHandler } from '../worldEvents/types.js'
import { getContainer } from './utils/contextHelpers.js'

// --- Error Message Truncation Limits (Issue #401) ----------------------------
/** Max length for error messages in telemetry dimensions */
const TELEMETRY_ERROR_MESSAGE_MAX_LENGTH = 200
/** Max length for final error in dead-letter records */
const DEAD_LETTER_FINAL_ERROR_MAX_LENGTH = 500

// --- In-Memory Cache (Fast-Path Optimization) --------------------------------

interface CacheEntry {
    eventId: string
    timestamp: number
}

const idempotencyCache = new Map<string, CacheEntry>()

/**
 * Reset the idempotency cache (primarily for testing).
 */
export function __resetIdempotencyCacheForTests(): void {
    idempotencyCache.clear()
}

/**
 * Check if event is duplicate based on idempotencyKey.
 * Returns true if seen recently (within TTL).
 */
function isDuplicate(idempotencyKey: string): boolean {
    const entry = idempotencyCache.get(idempotencyKey)
    if (!entry) return false

    const age = Date.now() - entry.timestamp
    if (age > WORLD_EVENT_DUPLICATE_TTL_MS) {
        // Expired, remove
        idempotencyCache.delete(idempotencyKey)
        return false
    }
    return true
}

/**
 * Mark event as processed in idempotency cache.
 */
function markProcessed(idempotencyKey: string, eventId: string): void {
    // Enforce max size with simple FIFO eviction
    if (idempotencyCache.size >= WORLD_EVENT_CACHE_MAX_SIZE) {
        // Remove oldest entry
        const firstKey = idempotencyCache.keys().next().value
        if (firstKey) {
            idempotencyCache.delete(firstKey)
        }
    }

    idempotencyCache.set(idempotencyKey, {
        eventId,
        timestamp: Date.now()
    })
}

// --- Utility Functions -------------------------------------------------------

/**
 * Hash prefix for logging idempotency keys without exposing full key content.
 */
function hashPrefix(key: string): string {
    // Simple hash for logging (first 8 chars of deterministic hash)
    let hash = 0
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash
    }
    return Math.abs(hash).toString(16).slice(0, 8)
}

// --- Main Handler ------------------------------------------------------------

@injectable()
export class QueueProcessWorldEventHandler {
    constructor(
        @inject('IDeadLetterRepository') private deadLetterRepository: IDeadLetterRepository,
        @inject('IProcessedEventRepository') private processedEventRepository: IProcessedEventRepository,
        @inject(TelemetryService) private telemetryService: TelemetryService
    ) {}

    async handle(message: unknown, context: InvocationContext): Promise<void> {
        // Capture first attempt timestamp for DLQ records (Issue #401)
        const firstAttemptTimestamp = new Date().toISOString()

        // 1. Parse message (Azure Service Bus messages can be JSON or string)
        let rawEvent: unknown
        try {
            if (typeof message === 'string') {
                rawEvent = JSON.parse(message)
            } else {
                rawEvent = message
            }
        } catch (parseError) {
            context.error('Failed to parse queue message as JSON', { parseError: String(parseError) })

            // Store dead-letter record for JSON parse failure
            try {
                const deadLetterRecord = createDeadLetterRecord(
                    message,
                    {
                        category: 'json-parse',
                        message: 'Failed to parse queue message as JSON',
                        issues: [
                            {
                                path: 'message',
                                message: String(parseError),
                                code: 'invalid_json'
                            }
                        ]
                    },
                    {
                        // Issue #401: Enhanced DLQ metadata
                        originalCorrelationId: context.invocationId,
                        failureReason: 'Invalid JSON format - permanent failure, no retry',
                        firstAttemptTimestamp,
                        errorCode: 'json-parse',
                        retryCount: 0,
                        finalError: String(parseError)
                    }
                )
                await this.deadLetterRepository.store(deadLetterRecord)

                // Emit dead-letter telemetry with enhanced dimensions (Issue #401)
                this.telemetryService.trackGameEventStrict(
                    'World.Event.DeadLettered',
                    {
                        reason: 'json-parse',
                        errorCount: 1,
                        recordId: deadLetterRecord.id,
                        // Issue #401: New dimensions
                        errorCode: 'json-parse',
                        retryCount: 0,
                        finalError: String(parseError).substring(0, TELEMETRY_ERROR_MESSAGE_MAX_LENGTH)
                    },
                    { correlationId: context.invocationId }
                )

                context.log('Dead-letter record created for JSON parse failure', {
                    recordId: deadLetterRecord.id
                })
            } catch (deadLetterError) {
                context.error('Failed to store dead-letter record', {
                    error: String(deadLetterError)
                })
            }

            // Cannot proceed without valid JSON - skip (no retry)
            return
        }

        // 2. Validate envelope schema
        const validationResult = safeValidateWorldEventEnvelope(rawEvent)
        if (!validationResult.success) {
            const zodError = validationResult.error
            const errors = zodError.issues.map((e) => ({
                path: String(e.path.join('.')),
                message: e.message,
                code: String(e.code)
            }))
            context.error('World event envelope validation failed', {
                errors
            })

            // Extract correlation ID from raw event for tracing
            let extractedCorrelationId: string | undefined
            if (typeof rawEvent === 'object' && rawEvent !== null) {
                const evt = rawEvent as Record<string, unknown>
                extractedCorrelationId = typeof evt.correlationId === 'string' ? evt.correlationId : undefined
            }

            // Store dead-letter record with redacted payload
            try {
                const deadLetterRecord = createDeadLetterRecord(
                    rawEvent,
                    {
                        category: 'schema-validation',
                        message: 'Event envelope failed schema validation',
                        issues: errors
                    },
                    {
                        // Issue #401: Enhanced DLQ metadata
                        originalCorrelationId: extractedCorrelationId ?? context.invocationId,
                        failureReason: `Schema validation failed: ${errors.length} issue(s) - permanent failure, no retry`,
                        firstAttemptTimestamp,
                        errorCode: 'schema-validation',
                        retryCount: 0,
                        finalError: errors
                            .map((e) => `${e.path}: ${e.message}`)
                            .join('; ')
                            .substring(0, DEAD_LETTER_FINAL_ERROR_MAX_LENGTH)
                    }
                )
                await this.deadLetterRepository.store(deadLetterRecord)

                // Emit dead-letter telemetry with enhanced dimensions (Issue #401)
                this.telemetryService.trackGameEventStrict(
                    'World.Event.DeadLettered',
                    {
                        reason: 'schema-validation',
                        errorCount: errors.length,
                        recordId: deadLetterRecord.id,
                        eventType: deadLetterRecord.eventType,
                        correlationId: deadLetterRecord.correlationId,
                        // Issue #401: New dimensions
                        errorCode: 'schema-validation',
                        retryCount: 0,
                        finalError: errors[0]?.message?.substring(0, TELEMETRY_ERROR_MESSAGE_MAX_LENGTH)
                    },
                    { correlationId: deadLetterRecord.correlationId }
                )

                context.log('Dead-letter record created for schema validation failure', {
                    recordId: deadLetterRecord.id,
                    errorCount: errors.length
                })
            } catch (deadLetterError) {
                // Log but don't throw - dead-letter storage failure should not block processing
                context.error('Failed to store dead-letter record', {
                    error: String(deadLetterError)
                })
            }

            // Invalid schema - skip (no retry)
            return
        }

        const event = validationResult.data as WorldEventEnvelope

        // 3. Log envelope metadata (no full payload, per acceptance criteria)
        context.log('Processing world event', {
            eventId: event.eventId,
            type: event.type,
            actorKind: event.actor.kind,
            idempotencyKeyHash: hashPrefix(event.idempotencyKey),
            correlationId: event.correlationId,
            causationId: event.causationId || undefined
        })

        // 4. Idempotency check (two-tier: in-memory cache + durable registry)
        // Fast path: check in-memory cache first
        if (isDuplicate(event.idempotencyKey)) {
            context.log('Duplicate world event detected (in-memory cache)', {
                eventId: event.eventId,
                idempotencyKeyHash: hashPrefix(event.idempotencyKey)
            })

            // Emit duplicate telemetry
            const props = {
                eventType: event.type,
                actorKind: event.actor.kind,
                idempotencyKeyHash: hashPrefix(event.idempotencyKey),
                correlationId: event.correlationId,
                causationId: event.causationId,
                detectedVia: 'cache'
            }
            enrichWorldEventAttributes(props, {
                eventType: event.type,
                actorKind: event.actor.kind
            })
            this.telemetryService.trackGameEventStrict('World.Event.Duplicate', props, { correlationId: event.correlationId })

            return
        }

        // Slow path: check durable registry (survives processor restarts)
        try {
            const existing = await this.processedEventRepository.checkProcessed(event.idempotencyKey)

            if (existing) {
                context.log('Duplicate world event detected (durable registry)', {
                    eventId: event.eventId,
                    originalEventId: existing.eventId,
                    originalProcessedUtc: existing.processedUtc,
                    idempotencyKeyHash: hashPrefix(event.idempotencyKey)
                })

                // Cache for future fast-path checks
                markProcessed(event.idempotencyKey, event.eventId)

                // Emit duplicate telemetry
                const props = {
                    eventType: event.type,
                    actorKind: event.actor.kind,
                    idempotencyKeyHash: hashPrefix(event.idempotencyKey),
                    correlationId: event.correlationId,
                    causationId: event.causationId,
                    detectedVia: 'registry',
                    originalEventId: existing.eventId,
                    originalProcessedUtc: existing.processedUtc
                }
                enrichWorldEventAttributes(props, {
                    eventType: event.type,
                    actorKind: event.actor.kind
                })
                this.telemetryService.trackGameEventStrict('World.Event.Duplicate', props, {
                    correlationId: event.correlationId
                })

                return
            }
        } catch (registryError) {
            // Availability over consistency: proceed with processing if registry lookup fails
            context.warn('Failed to check processed event registry (proceeding with processing)', {
                eventId: event.eventId,
                idempotencyKeyHash: hashPrefix(event.idempotencyKey),
                error: String(registryError)
            })

            // Emit telemetry for registry failure
            this.telemetryService.trackGameEvent(
                'World.Event.RegistryCheckFailed',
                {
                    eventType: event.type,
                    eventId: event.eventId,
                    correlationId: event.correlationId,
                    errorMessage: String(registryError)
                },
                { correlationId: event.correlationId }
            )
        }

        // 6. Prevent cache overflow by evicting oldest entries
        if (!event.ingestedUtc) {
            event.ingestedUtc = new Date().toISOString()
        }

        // 6. Calculate latency (occurred -> ingested)
        const latencyMs = event.ingestedUtc ? new Date(event.ingestedUtc).getTime() - new Date(event.occurredUtc).getTime() : undefined

        // 7. Mark as processed in durable registry + in-memory cache
        const processedUtc = new Date().toISOString()

        try {
            await this.processedEventRepository.markProcessed({
                id: uuidv4(),
                idempotencyKey: event.idempotencyKey,
                eventId: event.eventId,
                eventType: event.type,
                correlationId: event.correlationId,
                processedUtc,
                actorKind: event.actor.kind,
                actorId: event.actor.id,
                version: 1
            })

            // Also cache in memory for fast-path checks
            markProcessed(event.idempotencyKey, event.eventId)

            context.log('Event marked as processed in registry', {
                eventId: event.eventId,
                idempotencyKeyHash: hashPrefix(event.idempotencyKey)
            })
        } catch (registryError) {
            // Availability over consistency: continue processing even if registry write fails
            context.warn('Failed to mark event as processed in registry (continuing)', {
                eventId: event.eventId,
                idempotencyKeyHash: hashPrefix(event.idempotencyKey),
                error: String(registryError)
            })

            // Cache in memory as fallback
            markProcessed(event.idempotencyKey, event.eventId)

            // Emit telemetry for registry failure
            this.telemetryService.trackGameEventStrict(
                'World.Event.RegistryWriteFailed',
                {
                    eventType: event.type,
                    eventId: event.eventId,
                    correlationId: event.correlationId,
                    errorMessage: String(registryError)
                },
                { correlationId: event.correlationId }
            )
        }

        // 8. Emit telemetry with enriched attributes
        const props = {
            eventType: event.type,
            actorKind: event.actor.kind,
            latencyMs,
            duplicate: false,
            correlationId: event.correlationId,
            causationId: event.causationId
        }
        enrichWorldEventAttributes(props, {
            eventType: event.type,
            actorKind: event.actor.kind
        })
        this.telemetryService.trackGameEventStrict('World.Event.Processed', props, { correlationId: event.correlationId })

        // Type-specific handler dispatch (Issue #258)
        try {
            const container = getContainer(context)
            let handler: IWorldEventHandler | undefined
            if (container) {
                const registry = buildWorldEventHandlerRegistry(container)
                handler = registry.get(event.type)
            }

            if (!handler) {
                context.log('No type-specific handler registered for event type', { type: event.type, eventId: event.eventId })
            } else {
                const result = await handler.handle(event, context)
                // Handler itself emits World.Event.HandlerInvoked telemetry; we only log outcome here
                context.log('Type-specific handler completed', {
                    eventId: event.eventId,
                    type: event.type,
                    handler: handler.constructor.name,
                    outcome: result.outcome,
                    details: result.details
                })
            }
        } catch (handlerError) {
            // Unexpected error during handler dispatch should not block base processing telemetry already emitted.
            this.telemetryService.trackGameEventStrict(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: 'Dispatch',
                    outcome: 'error',
                    errorMessage: String(handlerError),
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            // Re-throw to allow Service Bus retry semantics for transient failures in handler stage
            throw handlerError
        }

        context.log('World event processed successfully', { eventId: event.eventId, type: event.type, latencyMs })
    }
}

export async function queueProcessWorldEvent(message: unknown, context: InvocationContext): Promise<void> {
    const container = getContainer(context)
    const handler = container.get(QueueProcessWorldEventHandler)
    await handler.handle(message, context)
}
