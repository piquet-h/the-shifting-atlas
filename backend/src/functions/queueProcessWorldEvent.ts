/**
 * World Event Queue Processor
 *
 * Asynchronous world evolution event processor. Validates incoming events,
 * enforces idempotency, and emits telemetry. Foundation for AI/NPC event ingestion.
 *
 * Configuration (env vars):
 * - WORLD_EVENT_DUPE_TTL_MS: Idempotency cache TTL in milliseconds (default: 600000 = 10 minutes)
 * - WORLD_EVENT_CACHE_MAX_SIZE: Max entries in idempotency cache before eviction (default: 10000)
 * - WORLD_EVENT_DEADLETTER_MODE: Future dead-letter mode flag (not implemented yet, placeholder: 'log-only')
 */
import { InvocationContext, app } from '@azure/functions'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import { safeValidateWorldEventEnvelope } from '@piquet-h/shared/events'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'
import { endSpan, startSpanFromTraceparent } from '../instrumentation/opentelemetry.js'
import { trackGameEventStrict } from '../telemetry.js'
import { loadPersistenceConfigAsync, resolvePersistenceMode } from '../persistenceConfig.js'
import { MemoryDeadLetterRepository } from '../repos/deadLetterRepository.memory.js'
import { CosmosDeadLetterRepository } from '../repos/deadLetterRepository.cosmos.js'
import type { IDeadLetterRepository } from '../repos/deadLetterRepository.js'

// --- Configuration -----------------------------------------------------------

const DUPE_TTL_MS = parseInt(process.env.WORLD_EVENT_DUPE_TTL_MS || '600000', 10)
const CACHE_MAX_SIZE = parseInt(process.env.WORLD_EVENT_CACHE_MAX_SIZE || '10000', 10)
const DEADLETTER_MODE = process.env.WORLD_EVENT_DEADLETTER_MODE || 'log-only'

// --- Dead-Letter Repository Initialization -----------------------------------

let deadLetterRepo: IDeadLetterRepository | null = null

/**
 * Initialize dead-letter repository lazily on first validation failure
 */
async function getDeadLetterRepository(): Promise<IDeadLetterRepository> {
    if (deadLetterRepo) {
        return deadLetterRepo
    }

    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        const config = await loadPersistenceConfigAsync()
        if (config.cosmosSql) {
            deadLetterRepo = new CosmosDeadLetterRepository(
                config.cosmosSql.endpoint,
                config.cosmosSql.database,
                config.cosmosSql.containers.deadLetters
            )
        } else {
            // Fallback to memory if SQL config missing
            deadLetterRepo = new MemoryDeadLetterRepository()
        }
    } else {
        deadLetterRepo = new MemoryDeadLetterRepository()
    }

    return deadLetterRepo
}

// --- In-Memory Idempotency Guard ---------------------------------------------

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
    if (age > DUPE_TTL_MS) {
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
    if (idempotencyCache.size >= CACHE_MAX_SIZE) {
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

export async function queueProcessWorldEvent(message: unknown, context: InvocationContext): Promise<void> {
    // Attempt to continue trace from Service Bus applicationProperties
    // Extract traceparent directly (shared utility not yet published; will migrate after version bump)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const traceparent = (message as any)?.applicationProperties?.traceparent as string | undefined
    const span = startSpanFromTraceparent('ServiceBus QueueProcessWorldEvent', traceparent)
    span.setAttribute('messaging.system', 'azure.servicebus')
    span.setAttribute('messaging.destination', 'world-events')
    span.setAttribute('messaging.operation', 'process')
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
            const repo = await getDeadLetterRepository()
            const deadLetterRecord = createDeadLetterRecord(message, {
                category: 'json-parse',
                message: 'Failed to parse queue message as JSON',
                issues: [
                    {
                        path: 'message',
                        message: String(parseError),
                        code: 'invalid_json'
                    }
                ]
            })
            await repo.store(deadLetterRecord)

            // Emit dead-letter telemetry
            trackGameEventStrict(
                'World.Event.DeadLettered',
                {
                    reason: 'json-parse',
                    errorCount: 1,
                    recordId: deadLetterRecord.id
                },
                {}
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
        endSpan(span)
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
            errors,
            deadLetterMode: DEADLETTER_MODE
        })

        // Store dead-letter record with redacted payload
        try {
            const repo = await getDeadLetterRepository()
            const deadLetterRecord = createDeadLetterRecord(rawEvent, {
                category: 'schema-validation',
                message: 'Event envelope failed schema validation',
                issues: errors
            })
            await repo.store(deadLetterRecord)

            // Emit dead-letter telemetry
            trackGameEventStrict(
                'World.Event.DeadLettered',
                {
                    reason: 'schema-validation',
                    errorCount: errors.length,
                    recordId: deadLetterRecord.id,
                    eventType: deadLetterRecord.eventType,
                    correlationId: deadLetterRecord.correlationId
                },
                { correlationId: deadLetterRecord.correlationId }
            )

            context.log('Dead-letter record created', {
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
        endSpan(span)
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

    // 4. Idempotency check
    if (isDuplicate(event.idempotencyKey)) {
        context.log('Duplicate world event (idempotency skip)', {
            eventId: event.eventId,
            idempotencyKeyHash: hashPrefix(event.idempotencyKey)
        })

        // Emit duplicate telemetry
        trackGameEventStrict(
            'World.Event.Duplicate',
            {
                eventType: event.type,
                actorKind: event.actor.kind,
                idempotencyKeyHash: hashPrefix(event.idempotencyKey),
                correlationId: event.correlationId,
                causationId: event.causationId
            },
            { correlationId: event.correlationId }
        )

        endSpan(span)
        return
    }

    // 5. First-time processing: set ingestedUtc if missing
    if (!event.ingestedUtc) {
        event.ingestedUtc = new Date().toISOString()
    }

    // 6. Calculate latency (occurred -> ingested)
    const latencyMs = event.ingestedUtc ? new Date(event.ingestedUtc).getTime() - new Date(event.occurredUtc).getTime() : undefined

    // 7. Mark as processed in idempotency cache
    markProcessed(event.idempotencyKey, event.eventId)

    // 8. Emit telemetry
    trackGameEventStrict(
        'World.Event.Processed',
        {
            eventType: event.type,
            actorKind: event.actor.kind,
            latencyMs,
            duplicate: false,
            correlationId: event.correlationId,
            causationId: event.causationId
        },
        { correlationId: event.correlationId }
    )

    // TODO: Future type-specific payload processing and side effects
    // For now, this is a foundation processor that validates and tracks events
    context.log('World event processed successfully', {
        eventId: event.eventId,
        type: event.type,
        latencyMs
    })
    span.setAttribute('tsa.correlation_id', event.correlationId)
    span.setAttribute('messaging.message_id', event.eventId)
    endSpan(span)
}

app.serviceBusQueue('QueueProcessWorldEvent', {
    connection: 'SERVICEBUS_CONNECTION',
    queueName: 'world-events',
    handler: queueProcessWorldEvent
})
