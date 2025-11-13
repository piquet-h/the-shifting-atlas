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
import { v4 as uuidv4 } from 'uuid'
import { loadPersistenceConfigAsync, resolvePersistenceMode } from '../persistenceConfig.js'
import { CosmosDeadLetterRepository } from '../repos/deadLetterRepository.cosmos.js'
import type { IDeadLetterRepository } from '../repos/deadLetterRepository.js'
import { MemoryDeadLetterRepository } from '../repos/deadLetterRepository.memory.js'
import { CosmosProcessedEventRepository } from '../repos/processedEventRepository.cosmos.js'
import { MemoryProcessedEventRepository } from '../repos/processedEventRepository.memory.js'
import type { IProcessedEventRepository } from '../repos/processedEventRepository.js'
import { trackGameEventStrict } from '../telemetry.js'

// --- Configuration -----------------------------------------------------------

const PROCESSED_EVENTS_TTL_SECONDS = parseInt(process.env.PROCESSED_EVENTS_TTL_SECONDS || '604800', 10) // 7 days
const DUPE_TTL_MS = parseInt(process.env.WORLD_EVENT_DUPE_TTL_MS || '600000', 10) // 10 minutes
const CACHE_MAX_SIZE = parseInt(process.env.WORLD_EVENT_CACHE_MAX_SIZE || '10000', 10)

// --- Repository Initialization -----------------------------------------------

let deadLetterRepo: IDeadLetterRepository | null = null
let processedEventRepo: IProcessedEventRepository | null = null

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

/**
 * Initialize processed event repository lazily on first idempotency check
 */
async function getProcessedEventRepository(): Promise<IProcessedEventRepository> {
    if (processedEventRepo) {
        return processedEventRepo
    }

    const mode = resolvePersistenceMode()
    if (mode === 'cosmos') {
        const config = await loadPersistenceConfigAsync()
        if (config.cosmosSql) {
            processedEventRepo = new CosmosProcessedEventRepository(
                config.cosmosSql.endpoint,
                config.cosmosSql.database,
                config.cosmosSql.containers.processedEvents
            )
        } else {
            // Fallback to memory if SQL config missing
            processedEventRepo = new MemoryProcessedEventRepository(PROCESSED_EVENTS_TTL_SECONDS)
        }
    } else {
        processedEventRepo = new MemoryProcessedEventRepository(PROCESSED_EVENTS_TTL_SECONDS)
    }

    return processedEventRepo
}

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
        trackGameEventStrict('World.Event.Duplicate', props, { correlationId: event.correlationId })

        return
    }

    // Slow path: check durable registry (survives processor restarts)
    try {
        const repo = await getProcessedEventRepository()
        const existing = await repo.checkProcessed(event.idempotencyKey)

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
            trackGameEventStrict('World.Event.Duplicate', props, { correlationId: event.correlationId })

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
        trackGameEventStrict(
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

    // 5. First-time processing: set ingestedUtc if missing
    if (!event.ingestedUtc) {
        event.ingestedUtc = new Date().toISOString()
    }

    // 6. Calculate latency (occurred -> ingested)
    const latencyMs = event.ingestedUtc ? new Date(event.ingestedUtc).getTime() - new Date(event.occurredUtc).getTime() : undefined

    // 7. Mark as processed in durable registry + in-memory cache
    const processedUtc = new Date().toISOString()

    try {
        const repo = await getProcessedEventRepository()
        await repo.markProcessed({
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
        trackGameEventStrict(
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

    // 8. Emit telemetry
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
    trackGameEventStrict('World.Event.Processed', props, { correlationId: event.correlationId })

    // TODO: Future type-specific payload processing and side effects
    // For now, this is a foundation processor that validates and tracks events
    context.log('World event processed successfully', {
        eventId: event.eventId,
        type: event.type,
        latencyMs
    })
}
