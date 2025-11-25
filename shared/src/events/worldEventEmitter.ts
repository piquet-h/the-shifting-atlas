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
     * Patterns: 'loc:<locationId>', 'player:<playerId>', 'global:<category>'
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

    // 2. Validate actor
    validateActor(options.actor)

    // 3. Generate or use correlation ID
    let correlationId: string
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
        warnings.push(`correlationId not provided, auto-generated: ${correlationId}`)
    }

    // 4. Validate causation ID if provided
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

    // 5. Generate event ID and timestamps
    const eventId = generateUuid()
    const occurredUtc = options.occurredUtc || new Date().toISOString()

    // 6. Generate idempotency key if not provided
    const idempotencyKey = options.idempotencyKey || generateIdempotencyKey(validatedEventType, options.scopeKey, options.actor.kind)

    // 7. Build the envelope
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

    // 8. Final schema validation
    const validationResult = WorldEventEnvelopeSchema.safeParse(envelope)
    if (!validationResult.success) {
        const issues = validationResult.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
            code: String(issue.code)
        }))
        throw new WorldEventValidationError('Event envelope validation failed', issues)
    }

    // 9. Prepare message properties for Service Bus
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
