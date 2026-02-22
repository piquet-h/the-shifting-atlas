/**
 * Exit Generation Hint Queue Processor Handler
 *
 * Processes exit generation hint events from the ExitGenerationHints queue.
 * These events are emitted when a player attempts to move in a direction
 * without an existing exit.
 *
 * Responsibilities:
 * - Validate incoming hint payloads against schema
 * - Enforce idempotency via ${originLocationId}:${dir} key
 * - Check for expired intents (hints too old to process)
 * - Store invalid/expired hints in DLQ with categorization
 * - Materialize exits: create stub neighbor location + bidirectional exit edges
 * - Clear pending availability after successful materialization
 * - Emit telemetry for each outcome (hint received, materialized, skipped-idempotent,
 *   forbidden-policy, failed-validation)
 *
 * Configuration (env vars):
 * - EXIT_HINT_MAX_AGE_MS: Maximum age for hints before expiration (default: 5 minutes)
 * - EXIT_HINT_DUPE_TTL_MS: In-memory cache TTL for deduplication (default: 10 minutes)
 *
 * See docs/architecture/exit-generation-hints.md for specification.
 */
import type { InvocationContext } from '@azure/functions'
import type { Direction, ExitAvailabilityMetadata } from '@piquet-h/shared'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'
import { buildExitHintIdempotencyKey, isExitHintExpired, safeValidateExitGenerationHintPayload } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import { v4 as uuidv4 } from 'uuid'
import { TOKENS } from '../di/tokens.js'
import type { IDeadLetterRepository } from '../repos/deadLetterRepository.js'
import type { ILocationRepository } from '../repos/locationRepository.js'
import { enrichNormalizedErrorAttributes } from '../telemetry/errorTelemetry.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { getContainer } from './utils/contextHelpers.js'

// --- Configuration -----------------------------------------------------------

/** Max age for exit hints before they're considered expired (default: 5 minutes) */
const EXIT_HINT_MAX_AGE_MS = parseInt(process.env.EXIT_HINT_MAX_AGE_MS || '300000', 10)

/** In-memory cache TTL for deduplication (default: 10 minutes) */
const EXIT_HINT_DUPE_TTL_MS = parseInt(process.env.EXIT_HINT_DUPE_TTL_MS || '600000', 10)

/** Max entries in idempotency cache before eviction */
const EXIT_HINT_CACHE_MAX_SIZE = parseInt(process.env.EXIT_HINT_CACHE_MAX_SIZE || '10000', 10)

// --- Error Message Truncation Limits -----------------------------------------

/** Max length for error messages in telemetry dimensions */
const TELEMETRY_ERROR_MESSAGE_MAX_LENGTH = 200
/** Max length for final error in dead-letter records */
const DEAD_LETTER_FINAL_ERROR_MAX_LENGTH = 500

// --- In-Memory Cache (Fast-Path Optimization) --------------------------------

interface CacheEntry {
    timestamp: number
    correlationId: string
}

const idempotencyCache = new Map<string, CacheEntry>()

/**
 * Reset the idempotency cache (primarily for testing).
 */
export function __resetExitHintIdempotencyCacheForTests(): void {
    idempotencyCache.clear()
}

/**
 * Check if hint is duplicate based on idempotencyKey.
 * Returns true if seen recently (within TTL).
 */
function isDuplicate(idempotencyKey: string): boolean {
    const entry = idempotencyCache.get(idempotencyKey)
    if (!entry) return false

    const age = Date.now() - entry.timestamp
    if (age > EXIT_HINT_DUPE_TTL_MS) {
        // Expired, remove
        idempotencyCache.delete(idempotencyKey)
        return false
    }
    return true
}

/**
 * Mark hint as processed in idempotency cache.
 */
function markProcessed(idempotencyKey: string, correlationId: string): void {
    // Enforce max size with simple FIFO eviction
    if (idempotencyCache.size >= EXIT_HINT_CACHE_MAX_SIZE) {
        const firstKey = idempotencyCache.keys().next().value
        if (firstKey) {
            idempotencyCache.delete(firstKey)
        }
    }

    idempotencyCache.set(idempotencyKey, {
        timestamp: Date.now(),
        correlationId
    })
}

/**
 * Hash prefix for logging idempotency keys without exposing full key content.
 */
function hashPrefix(key: string): string {
    let hash = 0
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash
    }
    return Math.abs(hash).toString(16).slice(0, 8)
}

// --- Main Handler ------------------------------------------------------------

/**
 * Exit Generation Hint Queue message shape.
 *
 * The queue message is a WorldEventEnvelope with:
 * - type: 'Navigation.Exit.GenerationHint'
 * - payload: ExitGenerationHintPayload
 * - correlationId: Propagated from HTTP request
 */
interface ExitHintQueueMessage {
    eventId: string
    type: string
    occurredUtc: string
    ingestedUtc?: string
    actor: {
        kind: string
        id?: string
    }
    correlationId: string
    causationId?: string
    idempotencyKey: string
    version: number
    payload: unknown
}

@injectable()
export class QueueProcessExitGenerationHintHandler {
    constructor(
        @inject('IDeadLetterRepository') private deadLetterRepository: IDeadLetterRepository,
        @inject(TelemetryService) private telemetryService: TelemetryService,
        @inject(TOKENS.LocationRepository) private locationRepository: ILocationRepository
    ) {}

    async handle(message: unknown, context: InvocationContext): Promise<void> {
        const firstAttemptTimestamp = new Date().toISOString()

        // 1. Parse message (Azure Service Bus messages can be JSON or string)
        let rawMessage: ExitHintQueueMessage
        try {
            if (typeof message === 'string') {
                rawMessage = JSON.parse(message)
            } else {
                rawMessage = message as ExitHintQueueMessage
            }
        } catch (parseError) {
            context.error('Failed to parse exit hint queue message as JSON', { parseError: String(parseError) })
            await this.storeDeadLetter(
                message,
                {
                    category: 'invalid-payload',
                    message: 'Failed to parse queue message as JSON',
                    issues: [{ path: 'message', message: String(parseError), code: 'invalid_json' }]
                },
                {
                    correlationId: context.invocationId,
                    firstAttemptTimestamp,
                    errorCode: 'json-parse'
                },
                context
            )
            return
        }

        // Extract correlation ID from message for tracing
        const correlationId = rawMessage.correlationId || context.invocationId

        // 2. Validate that this is the correct event type
        if (rawMessage.type !== 'Navigation.Exit.GenerationHint') {
            context.warn('Exit hint handler received wrong event type', {
                expectedType: 'Navigation.Exit.GenerationHint',
                actualType: rawMessage.type,
                correlationId
            })
            // Not a DLQ case - just skip (misrouted message)
            return
        }

        // 3. Validate payload schema
        const validationResult = safeValidateExitGenerationHintPayload(rawMessage.payload)
        if (!validationResult.success) {
            const errors = validationResult.error.issues.map((e) => ({
                path: String(e.path.join('.')),
                message: e.message,
                code: String(e.code)
            }))

            context.error('Exit hint payload validation failed', { errors, correlationId })

            await this.storeDeadLetter(
                rawMessage,
                {
                    category: 'invalid-payload',
                    message: 'Exit hint payload failed schema validation',
                    issues: errors
                },
                {
                    correlationId,
                    firstAttemptTimestamp,
                    errorCode: 'schema-validation'
                },
                context
            )
            return
        }

        const payload = validationResult.data

        // 4. Check for expired intent
        if (isExitHintExpired(payload.timestamp, EXIT_HINT_MAX_AGE_MS)) {
            context.warn('Exit hint expired, discarding', {
                timestamp: payload.timestamp,
                maxAgeMs: EXIT_HINT_MAX_AGE_MS,
                correlationId
            })

            await this.storeDeadLetter(
                rawMessage,
                {
                    category: 'expired-intent',
                    message: `Exit hint expired (older than ${EXIT_HINT_MAX_AGE_MS}ms)`,
                    issues: [{ path: 'timestamp', message: 'Hint is too old to process', code: 'expired' }]
                },
                {
                    correlationId,
                    firstAttemptTimestamp,
                    // Using 'unknown' as standard error codes don't cover business rule violations.
                    // The 'category' field ('expired-intent') provides the specific classification.
                    errorCode: 'unknown'
                },
                context
            )

            // Emit telemetry for expired hint
            this.telemetryService.trackGameEvent(
                'Navigation.Exit.GenerationRequested',
                {
                    dir: payload.dir,
                    originLocationId: hashPrefix(payload.originLocationId),
                    playerId: hashPrefix(payload.playerId),
                    outcome: 'expired',
                    correlationId
                },
                { correlationId }
            )
            return
        }

        // 5. Build idempotency key: ${originLocationId}:${dir}
        const idempotencyKey = buildExitHintIdempotencyKey(payload.originLocationId, payload.dir)

        // 6. Idempotency check (in-memory cache)
        if (isDuplicate(idempotencyKey)) {
            context.log('Duplicate exit hint detected (in-memory cache)', {
                idempotencyKeyHash: hashPrefix(idempotencyKey),
                correlationId
            })

            this.telemetryService.trackGameEvent(
                'Navigation.Exit.GenerationRequested',
                {
                    dir: payload.dir,
                    originLocationId: hashPrefix(payload.originLocationId),
                    playerId: hashPrefix(payload.playerId),
                    outcome: 'duplicate',
                    debounceHit: true,
                    correlationId
                },
                { correlationId }
            )
            return
        }

        // 7. Mark as processed in cache
        markProcessed(idempotencyKey, correlationId)

        // 8. Log hint received
        context.log('Exit generation hint received', {
            eventId: rawMessage.eventId,
            dir: payload.dir,
            originLocationId: hashPrefix(payload.originLocationId),
            playerId: hashPrefix(payload.playerId),
            debounced: payload.debounced,
            idempotencyKeyHash: hashPrefix(idempotencyKey),
            correlationId
        })

        // 9. Look up origin location
        const origin = await this.locationRepository.get(payload.originLocationId)
        if (!origin) {
            context.error('Exit generation hint: origin location not found', {
                originLocationIdHash: hashPrefix(payload.originLocationId),
                correlationId
            })
            await this.storeDeadLetter(
                rawMessage,
                {
                    category: 'missing-origin',
                    message: 'Origin location not found for exit generation hint',
                    issues: [{ path: 'originLocationId', message: 'Location not found', code: 'not-found' }]
                },
                { correlationId, firstAttemptTimestamp, errorCode: 'handler-error' },
                context
            )
            this.telemetryService.trackGameEventStrict(
                'Navigation.Exit.GenerationRequested',
                {
                    dir: payload.dir,
                    originLocationIdHash: hashPrefix(payload.originLocationId),
                    playerIdHash: hashPrefix(payload.playerId),
                    debounced: payload.debounced,
                    outcome: 'failed-validation',
                    correlationId
                },
                { correlationId }
            )
            return
        }

        // 10. Check if hard exit already exists for this direction (idempotent path)
        const existingExit = origin.exits?.find((e) => e.direction === payload.dir)
        if (existingExit) {
            context.log('Exit generation hint: hard exit already exists, skipping (idempotent)', {
                dir: payload.dir,
                originLocationIdHash: hashPrefix(payload.originLocationId),
                correlationId
            })
            this.telemetryService.trackGameEventStrict(
                'Navigation.Exit.GenerationRequested',
                {
                    dir: payload.dir,
                    originLocationIdHash: hashPrefix(payload.originLocationId),
                    playerIdHash: hashPrefix(payload.playerId),
                    debounced: payload.debounced,
                    outcome: 'skipped-idempotent',
                    correlationId
                },
                { correlationId }
            )
            return
        }

        // 11. Check if direction is forbidden by generation policy
        const forbiddenEntry = origin.exitAvailability?.forbidden?.[payload.dir as Direction]
        if (forbiddenEntry !== undefined) {
            // Inline format detection mirrors normalizeForbiddenEntry() in shared/src/exitAvailability.ts.
            // TODO: Replace with normalizeForbiddenEntry(forbiddenEntry).reason once @piquet-h/shared ≥ 0.3.134 is consumed.
            const forbiddenReason =
                typeof forbiddenEntry === 'object' && forbiddenEntry !== null
                    ? (forbiddenEntry as { reason?: string }).reason
                    : String(forbiddenEntry)
            context.log('Exit generation hint: direction is forbidden by policy', {
                dir: payload.dir,
                originLocationIdHash: hashPrefix(payload.originLocationId),
                reason: forbiddenReason || 'unspecified',
                correlationId
            })
            this.telemetryService.trackGameEventStrict(
                'Navigation.Exit.GenerationRequested',
                {
                    dir: payload.dir,
                    originLocationIdHash: hashPrefix(payload.originLocationId),
                    playerIdHash: hashPrefix(payload.playerId),
                    debounced: payload.debounced,
                    outcome: 'forbidden-policy',
                    correlationId
                },
                { correlationId }
            )
            return
        }

        // 12. Materialize: create stub neighbor location and bidirectional exit
        const stubId = uuidv4()
        const stubTerrain = origin.terrain ?? 'open-plain'

        await this.locationRepository.upsert({
            id: stubId,
            name: 'Unexplored Region',
            description: '',
            terrain: stubTerrain,
            tags: [],
            exits: [],
            version: 1
        })

        await this.locationRepository.ensureExitBidirectional(payload.originLocationId, payload.dir, stubId, { reciprocal: true })

        // 13. Clear pending availability for this direction
        const existingPending = origin.exitAvailability?.pending
        if (existingPending && payload.dir in existingPending) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [payload.dir as Direction]: _removed, ...updatedPending } = existingPending
            const hasPending = Object.keys(updatedPending).length > 0
            const updatedAvailability: ExitAvailabilityMetadata = {
                ...origin.exitAvailability,
                pending: hasPending ? (updatedPending as Partial<Record<Direction, string>>) : undefined
            }
            // Re-fetch to get latest state (includes newly created exit in Cosmos)
            const refreshed = await this.locationRepository.get(payload.originLocationId)
            if (refreshed) {
                await this.locationRepository.upsert({
                    ...refreshed,
                    exitAvailability: updatedAvailability
                })
            }
        }

        context.log('Exit generation hint materialized', {
            dir: payload.dir,
            originLocationIdHash: hashPrefix(payload.originLocationId),
            newLocationId: stubId,
            correlationId
        })

        // 14. Emit success telemetry
        this.telemetryService.trackGameEventStrict(
            'Navigation.Exit.GenerationRequested',
            {
                dir: payload.dir,
                originLocationIdHash: hashPrefix(payload.originLocationId),
                playerIdHash: hashPrefix(payload.playerId),
                debounced: payload.debounced,
                outcome: 'materialized',
                correlationId
            },
            { correlationId }
        )
    }

    /**
     * Store a dead-letter record for failed hints.
     */
    private async storeDeadLetter(
        rawMessage: unknown,
        error: { category: string; message: string; issues?: Array<{ path: string; message: string; code: string }> },
        options: { correlationId: string; firstAttemptTimestamp: string; errorCode: string },
        context: InvocationContext
    ): Promise<void> {
        try {
            const deadLetterRecord = createDeadLetterRecord(rawMessage, error, {
                originalCorrelationId: options.correlationId,
                failureReason: error.message,
                firstAttemptTimestamp: options.firstAttemptTimestamp,
                errorCode: options.errorCode as 'json-parse' | 'schema-validation' | 'handler-error' | 'unknown',
                retryCount: 0,
                finalError: error.message.substring(0, DEAD_LETTER_FINAL_ERROR_MAX_LENGTH)
            })

            await this.deadLetterRepository.store(deadLetterRecord)

            // Emit dead-letter telemetry
            const deadLetterProps: Record<string, unknown> = {
                reason: error.category,
                errorCount: error.issues?.length ?? 1,
                recordId: deadLetterRecord.id,
                retryCount: 0,
                finalError: error.message.substring(0, TELEMETRY_ERROR_MESSAGE_MAX_LENGTH)
            }
            enrichNormalizedErrorAttributes(deadLetterProps, {
                errorCode: error.category,
                errorMessage: error.message,
                errorKind: 'validation'
            })
            this.telemetryService.trackGameEventStrict('World.Event.DeadLettered', deadLetterProps, {
                correlationId: options.correlationId
            })

            context.log('Dead-letter record created for exit hint', { recordId: deadLetterRecord.id })
        } catch (deadLetterError) {
            context.error('Failed to store dead-letter record for exit hint', { error: String(deadLetterError) })
        }
    }
}

/**
 * Queue trigger handler function for Azure Functions.
 */
export async function queueProcessExitGenerationHint(message: unknown, context: InvocationContext): Promise<void> {
    const container = getContainer(context)
    const handler = container.get(QueueProcessExitGenerationHintHandler)
    await handler.handle(message, context)
}
