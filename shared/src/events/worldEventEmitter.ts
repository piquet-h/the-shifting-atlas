/**
 * World Event Emission Helper
 *
 * Centralizes world event creation with proper correlation ID propagation,
 * schema validation, and consistent envelope structure. Produces messages
 * ready to be sent to Service Bus.
 *
 * Purpose:
 * - Ensure ≥95% of emitted world events include valid correlation IDs
 * - Validate events against WorldEventEnvelope schema before emission
 * - Generate correlation IDs as fallback (with warning for tracking)
 * - Provide consistent Service Bus message properties
 *
 * See docs/architecture/world-event-contract.md for complete specification.
 */

import { z } from 'zod'
import type { Actor, WorldEventEnvelope, WorldEventType } from './worldEventSchema.js'
import { ActorKindSchema, WorldEventEnvelopeSchema, WorldEventTypeSchema } from './worldEventSchema.js'

/**
 * UUID v4 generation (simple implementation for shared package).
 * Uses crypto.randomUUID when available, otherwise generates manually.
 */
function generateUuid(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID()
    }
    // Fallback: manual UUID v4 generation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}

/**
 * Error code for retryable Service Bus errors
 */
export const RETRYABLE_ERROR_CODE = 'SERVICEBUS_UNAVAILABLE'

/**
 * Retryable error thrown when Service Bus is unavailable.
 * Callers should implement retry logic with exponential backoff.
 */
export class ServiceBusUnavailableError extends Error {
    readonly code = RETRYABLE_ERROR_CODE
    readonly retryable = true

    constructor(
        message: string,
        public readonly cause?: Error
    ) {
        super(message)
        this.name = 'ServiceBusUnavailableError'
        Error.captureStackTrace?.(this, ServiceBusUnavailableError)
    }
}

/**
 * Validation error thrown when event schema validation fails.
 */
export class WorldEventValidationError extends Error {
    readonly retryable = false

    constructor(
        message: string,
        public readonly issues: Array<{ path: string; message: string; code: string }>
    ) {
        super(message)
        this.name = 'WorldEventValidationError'
        Error.captureStackTrace?.(this, WorldEventValidationError)
    }
}

/**
 * Options for emitting a world event.
 */
export interface EmitWorldEventOptions {
    /**
     * Event type from the WorldEventType enum.
     * Must be a valid event type defined in WorldEventTypeSchema.
     */
    eventType: WorldEventType | string

    /**
     * Scope key for partition-efficient queries.
     * Must follow canonical patterns:
     * - 'loc:<locationId>' for location-scoped events
     * - 'player:<playerId>' for player-scoped events
     * - 'global:<category>' for system-wide events (e.g., 'global:maintenance')
     *
     * Invalid patterns will throw WorldEventValidationError.
     */
    scopeKey: string

    /**
     * Event-specific payload data.
     * Must be a JSON-serializable object.
     */
    payload: Record<string, unknown>

    /**
     * Actor information (kind and optional id).
     */
    actor: Actor

    /**
     * Correlation ID from HTTP request context.
     * If not provided, a new GUID is generated with a warning flag.
     */
    correlationId?: string

    /**
     * Operation ID from Azure Functions invocation context.
     * Useful for tracing across distributed operations.
     */
    operationId?: string

    /**
     * Causation ID linking to upstream event (optional).
     * Used for building causation chains.
     */
    causationId?: string

    /**
     * Idempotency key for at-least-once delivery collapse.
     * If not provided, will be generated from eventId + timestamp bucket.
     */
    idempotencyKey?: string

    /**
     * Event occurrence timestamp (ISO 8601).
     * Defaults to current time if not provided.
     */
    occurredUtc?: string
}

/**
 * Result of world event emission preparation.
 * Contains the validated envelope and Service Bus message properties.
 */
export interface EmitWorldEventResult {
    /**
     * Validated world event envelope ready for queue.
     */
    envelope: WorldEventEnvelope

    /**
     * Custom properties for Service Bus message.
     * Include these when sending to ensure correlation and filtering.
     */
    messageProperties: {
        correlationId: string
        operationId?: string
        eventType: string
        scopeKey: string
    }

    /**
     * True if correlationId was auto-generated (not provided by caller).
     */
    correlationIdGenerated: boolean

    /**
     * Warning flags for caller awareness (e.g., auto-generated correlationId).
     */
    warnings: string[]
}

/**
 * Validate event type against the schema enum.
 * Throws WorldEventValidationError if invalid.
 */
function validateEventType(eventType: string): WorldEventType {
    const result = WorldEventTypeSchema.safeParse(eventType)
    if (!result.success) {
        const validTypes = WorldEventTypeSchema.options.join(', ')
        throw new WorldEventValidationError(`Invalid event type: "${eventType}". Valid types: ${validTypes}`, [
            {
                path: 'eventType',
                message: `Must be one of: ${validTypes}`,
                code: 'invalid_enum_value'
            }
        ])
    }
    return result.data
}

/**
 * Validate actor against the schema.
 * Throws WorldEventValidationError if invalid.
 */
function validateActor(actor: Actor): void {
    const kindResult = ActorKindSchema.safeParse(actor.kind)
    if (!kindResult.success) {
        const validKinds = ActorKindSchema.options.join(', ')
        throw new WorldEventValidationError(`Invalid actor kind: "${actor.kind}". Valid kinds: ${validKinds}`, [
            {
                path: 'actor.kind',
                message: `Must be one of: ${validKinds}`,
                code: 'invalid_enum_value'
            }
        ])
    }

    // Validate actor.id is UUID if provided
    if (actor.id !== undefined) {
        const uuidResult = z.string().uuid().safeParse(actor.id)
        if (!uuidResult.success) {
            throw new WorldEventValidationError(`Invalid actor ID: "${actor.id}". Must be a valid UUID`, [
                {
                    path: 'actor.id',
                    message: 'Must be a valid UUID',
                    code: 'invalid_string'
                }
            ])
        }
    }
}

/**
 * Validate scopeKey against canonical patterns.
 * Throws WorldEventValidationError if invalid.
 *
 * Canonical patterns:
 * - loc:<locationId> (e.g., 'loc:550e8400-e29b-41d4-a716-446655440000')
 * - player:<playerId> (e.g., 'player:550e8400-e29b-41d4-a716-446655440000')
 * - global:<category> (e.g., 'global:maintenance', 'global:tick')
 */
function validateScopeKey(scopeKey: string): void {
    // Check for empty or missing scopeKey
    if (!scopeKey || scopeKey.trim().length === 0) {
        throw new WorldEventValidationError('scopeKey cannot be empty', [
            {
                path: 'scopeKey',
                message: 'scopeKey is required and cannot be empty',
                code: 'invalid_string'
            }
        ])
    }

    // Validate canonical pattern: prefix:value
    const match = scopeKey.match(/^(loc|player|global):(.+)$/)
    if (!match) {
        throw new WorldEventValidationError(
            `Invalid scopeKey format: "${scopeKey}". Must follow pattern: "loc:<id>", "player:<id>", or "global:<category>"`,
            [
                {
                    path: 'scopeKey',
                    message: 'Must be "loc:<locationId>", "player:<playerId>", or "global:<category>"',
                    code: 'invalid_string'
                }
            ]
        )
    }

    const [, prefix, value] = match

    // Validate value part is not empty
    if (!value || value.trim().length === 0) {
        throw new WorldEventValidationError(`scopeKey value cannot be empty after prefix "${prefix}:"`, [
            {
                path: 'scopeKey',
                message: `Value after "${prefix}:" cannot be empty`,
                code: 'invalid_string'
            }
        ])
    }

    // For loc and player prefixes, validate UUID format
    if (prefix === 'loc' || prefix === 'player') {
        const uuidResult = z.string().uuid().safeParse(value)
        if (!uuidResult.success) {
            throw new WorldEventValidationError(`scopeKey value must be a valid UUID for "${prefix}:" prefix. Got: "${value}"`, [
                {
                    path: 'scopeKey',
                    message: `Value after "${prefix}:" must be a valid UUID`,
                    code: 'invalid_string'
                }
            ])
        }
    }
}

/**
 * Generate an idempotency key from event details.
 * Pattern: <actorKind>:<eventType>:<scopeKey>:<minuteBucket>
 */
function generateIdempotencyKey(eventType: string, scopeKey: string, actorKind: string): string {
    const minuteBucket = Math.floor(Date.now() / 60000)
    return `${actorKind}:${eventType}:${scopeKey}:${minuteBucket}`
}

/**
 * Prepare a world event for emission to Service Bus.
 *
 * This function:
 * 1. Validates the event type against the allowed enum
 * 2. Validates the actor information
 * 3. Generates correlation ID if not provided (with warning)
 * 4. Creates a complete WorldEventEnvelope
 * 5. Validates the complete envelope against schema
 * 6. Returns the envelope with Service Bus message properties
 *
 * @param options - Event emission options
 * @returns Prepared event result with envelope and message properties
 * @throws WorldEventValidationError if validation fails
 */
export function emitWorldEvent(options: EmitWorldEventOptions): EmitWorldEventResult {
    const warnings: string[] = []

    // 1. Validate event type
    const validatedEventType = validateEventType(options.eventType)

    // 2. Validate scopeKey format
    validateScopeKey(options.scopeKey)

    // 3. Validate actor
    validateActor(options.actor)

    // 4. Generate or use correlation ID
    let correlationId: string
    let correlationIdGenerated = false
    if (options.correlationId) {
        // Validate provided correlation ID is a UUID
        const uuidResult = z.string().uuid().safeParse(options.correlationId)
        if (!uuidResult.success) {
            throw new WorldEventValidationError(`Invalid correlationId: "${options.correlationId}". Must be a valid UUID`, [
                {
                    path: 'correlationId',
                    message: 'Must be a valid UUID',
                    code: 'invalid_string'
                }
            ])
        }
        correlationId = options.correlationId
    } else {
        // Generate new correlation ID with warning
        correlationId = generateUuid()
        correlationIdGenerated = true
        warnings.push(`correlationId not provided, auto-generated: ${correlationId}`)
    }

    // 5. Validate causation ID if provided
    if (options.causationId) {
        const uuidResult = z.string().uuid().safeParse(options.causationId)
        if (!uuidResult.success) {
            throw new WorldEventValidationError(`Invalid causationId: "${options.causationId}". Must be a valid UUID`, [
                {
                    path: 'causationId',
                    message: 'Must be a valid UUID',
                    code: 'invalid_string'
                }
            ])
        }
    }

    // 6. Generate event ID and timestamps
    const eventId = generateUuid()
    const occurredUtc = options.occurredUtc || new Date().toISOString()

    // 7. Generate idempotency key if not provided
    const idempotencyKey = options.idempotencyKey || generateIdempotencyKey(validatedEventType, options.scopeKey, options.actor.kind)

    // 8. Build the envelope
    const envelope: WorldEventEnvelope = {
        eventId,
        type: validatedEventType,
        occurredUtc,
        actor: options.actor,
        correlationId,
        idempotencyKey,
        version: 1,
        payload: options.payload
    }

    // Add optional causation ID
    if (options.causationId) {
        envelope.causationId = options.causationId
    }

    // 9. Final schema validation
    const validationResult = WorldEventEnvelopeSchema.safeParse(envelope)
    if (!validationResult.success) {
        const issues = validationResult.error.issues.map((issue: { path: (string | number)[]; message: string; code: string }) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: String(issue.code)
        }))
        throw new WorldEventValidationError('Event envelope validation failed', issues)
    }

    // 10. Prepare message properties for Service Bus
    const messageProperties: EmitWorldEventResult['messageProperties'] = {
        correlationId,
        eventType: validatedEventType,
        scopeKey: options.scopeKey
    }

    if (options.operationId) {
        messageProperties.operationId = options.operationId
    }

    return {
        envelope: validationResult.data,
        messageProperties,
        correlationIdGenerated,
        warnings
    }
}

/**
 * Check if an error is a retryable Service Bus error.
 * Supports both direct instanceof check and duck-typing for serialized errors
 * that may have lost their prototype chain (e.g., across process boundaries).
 * @param error - Error to check
 * @returns true if the error is retryable
 */
export function isRetryableError(error: unknown): error is ServiceBusUnavailableError {
    if (error instanceof ServiceBusUnavailableError) {
        return true
    }
    // Duck-type check for serialized errors (e.g., from JSON.parse)
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === RETRYABLE_ERROR_CODE) {
        return true
    }
    return false
}

/**
 * Type guard for WorldEventValidationError.
 * @param error - Error to check
 * @returns true if the error is a validation error
 */
export function isValidationError(error: unknown): error is WorldEventValidationError {
    return error instanceof WorldEventValidationError
}

// --- Service Bus Message Wrapper for CorrelationId Injection ---

/**
 * Service Bus message application properties with correlationId.
 */
export interface ServiceBusApplicationProperties {
    correlationId: string
    /** Original correlationId if applicationProperties had a different value */
    'publish.correlationId.original'?: string
    eventType: string
    scopeKey: string
    operationId?: string
    [key: string]: unknown
}

/**
 * Service Bus message ready for sending, with correlationId injected.
 */
export interface EnqueuedWorldEventMessage {
    /**
     * Message body (the WorldEventEnvelope).
     */
    body: WorldEventEnvelope

    /**
     * Content type for proper deserialization.
     */
    contentType: 'application/json'

    /**
     * Message-level correlationId for Service Bus filtering/routing.
     */
    correlationId: string

    /**
     * Application properties with correlationId and event metadata.
     */
    applicationProperties: ServiceBusApplicationProperties
}

/**
 * Result of preparing a world event message for Service Bus enqueue.
 */
export interface PrepareEnqueueResult {
    /**
     * Service Bus message ready to send.
     */
    message: EnqueuedWorldEventMessage

    /**
     * The correlationId used (from envelope or auto-generated).
     */
    correlationId: string

    /**
     * True if correlationId was auto-generated (not provided).
     */
    correlationIdGenerated: boolean

    /**
     * Original correlationId from applicationProperties if it differed.
     */
    originalApplicationPropertiesCorrelationId?: string

    /**
     * Warnings for caller awareness.
     */
    warnings: string[]
}

/**
 * Options for batch enqueue behavior.
 */
export interface BatchEnqueueOptions {
    /**
     * Correlation mode for batch messages.
     * - 'shared': All messages in batch share the same correlationId (default)
     * - 'individual': Each message gets its own correlationId (envelope or generated)
     */
    correlationMode?: 'shared' | 'individual'

    /**
     * Shared correlationId for batch when mode is 'shared'.
     * If not provided and mode is 'shared', generates a new UUID for the batch.
     */
    batchCorrelationId?: string
}

/**
 * Prepare a world event message for Service Bus enqueue.
 *
 * This wrapper function:
 * 1. Injects correlationId into applicationProperties (from envelope or generates UUID)
 * 2. Is idempotent: preserves existing correlationId if already set
 * 3. Edge case: if applicationProperties has a different correlationId, preserves original
 *    in 'publish.correlationId.original' attribute
 *
 * Telemetry: Caller should emit 'World.Event.QueuePublish' with the returned correlationId and messageType.
 *
 * @param emitResult - Result from emitWorldEvent()
 * @param existingApplicationProperties - Optional existing applicationProperties that may contain correlationId
 * @returns Prepared message ready for Service Bus send
 */
export function prepareEnqueueMessage(
    emitResult: EmitWorldEventResult,
    existingApplicationProperties?: Record<string, unknown>
): PrepareEnqueueResult {
    const warnings: string[] = [...emitResult.warnings]
    const envelope = emitResult.envelope

    // Determine correlationId: envelope's correlationId is authoritative
    const correlationId = envelope.correlationId
    // Use the explicit flag from emitResult (added for cleaner dependency)
    const correlationIdGenerated = emitResult.correlationIdGenerated

    // Build applicationProperties
    const applicationProperties: ServiceBusApplicationProperties = {
        correlationId,
        eventType: envelope.type,
        scopeKey: emitResult.messageProperties.scopeKey
    }

    // Add operationId if present
    if (emitResult.messageProperties.operationId) {
        applicationProperties.operationId = emitResult.messageProperties.operationId
    }

    // Check for existing applicationProperties with different correlationId
    let originalApplicationPropertiesCorrelationId: string | undefined
    if (existingApplicationProperties) {
        const existingCorrelationId = existingApplicationProperties.correlationId
        if (typeof existingCorrelationId === 'string' && existingCorrelationId !== correlationId) {
            // Preserve original correlationId from applicationProperties
            applicationProperties['publish.correlationId.original'] = existingCorrelationId
            originalApplicationPropertiesCorrelationId = existingCorrelationId
            // Log only truncated correlationId for security (first 8 chars)
            const truncatedId = existingCorrelationId.substring(0, 8)
            warnings.push(
                `applicationProperties had different correlationId: ${truncatedId}..., preserved in 'publish.correlationId.original'`
            )
        }

        // Merge other existing applicationProperties (except correlationId which we're overriding)
        for (const [key, value] of Object.entries(existingApplicationProperties)) {
            if (key !== 'correlationId' && !(key in applicationProperties)) {
                applicationProperties[key] = value
            }
        }
    }

    const message: EnqueuedWorldEventMessage = {
        body: envelope,
        contentType: 'application/json',
        correlationId,
        applicationProperties
    }

    return {
        message,
        correlationId,
        correlationIdGenerated,
        originalApplicationPropertiesCorrelationId,
        warnings
    }
}

/**
 * Prepare multiple world event messages for batch enqueue.
 *
 * Batch Correlation Strategy (documented choice):
 * - 'shared' mode: All messages share the same correlationId for batch tracing
 * - 'individual' mode: Each message uses its envelope's correlationId
 *
 * @param emitResults - Array of results from emitWorldEvent()
 * @param options - Batch enqueue options
 * @returns Array of prepared messages
 */
export function prepareBatchEnqueueMessages(
    emitResults: EmitWorldEventResult[],
    options: BatchEnqueueOptions = {}
): PrepareEnqueueResult[] {
    const { correlationMode = 'individual', batchCorrelationId } = options

    if (correlationMode === 'shared') {
        // Generate or use provided batch correlationId
        const sharedCorrelationId = batchCorrelationId ?? generateUuid()

        return emitResults.map((emitResult) => {
            // Override envelope's correlationId with shared batch correlationId
            const modifiedEnvelope: WorldEventEnvelope = {
                ...emitResult.envelope,
                correlationId: sharedCorrelationId
            }
            const modifiedResult: EmitWorldEventResult = {
                ...emitResult,
                envelope: modifiedEnvelope,
                messageProperties: {
                    ...emitResult.messageProperties,
                    correlationId: sharedCorrelationId
                }
            }
            const result = prepareEnqueueMessage(modifiedResult)
            if (!batchCorrelationId) {
                result.warnings.push(`Batch mode 'shared': using generated correlationId ${sharedCorrelationId}`)
            }
            return result
        })
    }

    // Individual mode: each message keeps its own correlationId
    return emitResults.map((emitResult) => prepareEnqueueMessage(emitResult))
}
