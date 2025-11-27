/**
 * Dead-Letter Storage Types and Redaction Utilities
 *
 * Provides types and utilities for storing failed world events with
 * sensitive data redaction. Used by queue processors to persist validation
 * failures for debugging without exposing player information.
 */

/**
 * Error code classification for dead-letter records (Issue #401)
 * Used to distinguish transient vs permanent failures for retry decisions
 */
export type DeadLetterErrorCode =
    | 'json-parse' // Permanent: Invalid JSON format
    | 'schema-validation' // Permanent: Failed schema validation
    | 'handler-error' // Transient: Handler execution error (retry eligible)
    | 'unknown' // Unknown error category

/**
 * Dead-letter record stored in Cosmos SQL for failed world events
 */
export interface DeadLetterRecord {
    /** Unique identifier for this dead-letter record (UUID v4) */
    id: string

    /** Original event ID from the failed event envelope (if parseable) */
    originalEventId?: string

    /** Event type from the failed event (if parseable) */
    eventType?: string

    /** Actor kind from the failed event (if parseable) */
    actorKind?: string

    /** Redacted original envelope (sensitive fields masked) */
    redactedEnvelope: Record<string, unknown>

    /** Validation error details */
    error: {
        /** Error category (e.g., 'schema-validation', 'json-parse') */
        category: string

        /** Human-readable error message */
        message: string

        /** Structured validation issues (e.g., Zod error details) */
        issues?: Array<{
            path: string
            message: string
            code: string
        }>
    }

    /** Timestamp when the event was dead-lettered (ISO 8601) */
    deadLetteredUtc: string

    /** Original occurred timestamp from event (if parseable) */
    occurredUtc?: string

    /** Correlation ID from event (if parseable) */
    correlationId?: string

    /** Indicates if redaction was applied */
    redacted: boolean

    /** Partition key for Cosmos SQL (set to 'deadletter' for single partition) */
    partitionKey: string

    // --- Issue #401: New fields for enhanced DLQ investigation ---

    /** Original correlation ID preserved for cross-service tracing */
    originalCorrelationId?: string

    /** Human-readable failure reason for quick triage */
    failureReason?: string

    /** ISO 8601 timestamp of the first processing attempt */
    firstAttemptTimestamp?: string

    /** Error code classification for filtering/alerting */
    errorCode?: DeadLetterErrorCode

    /** Number of retry attempts before dead-lettering (0 = immediate DLQ) */
    retryCount?: number

    /** Final error message after all retries exhausted */
    finalError?: string
}

/**
 * Configuration for payload truncation
 */
const MAX_PAYLOAD_SIZE = 10000 // characters
const MAX_ARRAY_ITEMS = 10
const TRUNCATION_MARKER = '...[TRUNCATED]'

/**
 * Redact sensitive fields from a world event envelope before storage.
 *
 * Redaction rules:
 * - Player IDs: Keep last 4 characters, mask rest with asterisks
 * - Payloads: Replace with type summary and truncate if large
 * - Arrays: Limit to first N items
 * - Large strings: Truncate with marker
 *
 * @param envelope - Original event envelope (may be partial/invalid)
 * @returns Redacted envelope safe for storage
 */
export function redactEnvelope(envelope: unknown): Record<string, unknown> {
    if (typeof envelope !== 'object' || envelope === null) {
        return { _raw: String(envelope).substring(0, 1000) }
    }

    const original = envelope as Record<string, unknown>
    const redacted: Record<string, unknown> = {}

    // Copy non-sensitive fields as-is
    for (const [key, value] of Object.entries(original)) {
        if (
            key === 'eventId' ||
            key === 'type' ||
            key === 'version' ||
            key === 'occurredUtc' ||
            key === 'ingestedUtc' ||
            key === 'correlationId' ||
            key === 'causationId' ||
            key === 'idempotencyKey'
        ) {
            redacted[key] = value
            continue
        }

        if (key === 'actor' && typeof value === 'object' && value !== null) {
            const actor = value as Record<string, unknown>
            redacted[key] = {
                kind: actor.kind,
                id: actor.id ? redactId(String(actor.id)) : undefined
            }
            continue
        }

        if (key === 'payload') {
            redacted[key] = redactPayload(value)
            continue
        }

        // Default: truncate other fields
        redacted[key] = truncateValue(value)
    }

    return redacted
}

/**
 * Redact an ID by keeping last 4 characters and masking the rest
 */
function redactId(id: string): string {
    if (id.length <= 4) {
        return '****'
    }
    const last4 = id.slice(-4)
    const masked = '*'.repeat(Math.min(8, id.length - 4))
    return `${masked}${last4}`
}

/**
 * Redact payload by creating a type summary instead of storing full content
 */
function redactPayload(payload: unknown): Record<string, unknown> {
    if (typeof payload !== 'object' || payload === null) {
        return {
            _type: typeof payload,
            _summary: String(payload).substring(0, 100)
        }
    }

    const obj = payload as Record<string, unknown>
    const summary: Record<string, unknown> = {
        _fieldCount: Object.keys(obj).length,
        _fields: Object.keys(obj)
    }

    // Include redacted IDs if present
    for (const [key, value] of Object.entries(obj)) {
        if (key.toLowerCase().includes('id') && typeof value === 'string') {
            summary[key] = redactId(value)
        }
    }

    return summary
}

/**
 * Truncate a value to prevent extremely large storage
 */
function truncateValue(value: unknown): unknown {
    if (typeof value === 'string') {
        if (value.length > MAX_PAYLOAD_SIZE) {
            return value.substring(0, MAX_PAYLOAD_SIZE) + TRUNCATION_MARKER
        }
        return value
    }

    if (Array.isArray(value)) {
        if (value.length > MAX_ARRAY_ITEMS) {
            return [...value.slice(0, MAX_ARRAY_ITEMS), TRUNCATION_MARKER]
        }
        return value.map(truncateValue)
    }

    if (typeof value === 'object' && value !== null) {
        const obj = value as Record<string, unknown>
        const truncated: Record<string, unknown> = {}
        for (const [k, v] of Object.entries(obj)) {
            truncated[k] = truncateValue(v)
        }
        return truncated
    }

    return value
}

/**
 * Options for creating a dead-letter record with enhanced metadata (Issue #401)
 */
export interface CreateDeadLetterRecordOptions {
    /** Original correlation ID for cross-service tracing */
    originalCorrelationId?: string
    /** Human-readable failure reason */
    failureReason?: string
    /** Timestamp of first processing attempt */
    firstAttemptTimestamp?: string
    /** Error code classification */
    errorCode?: DeadLetterErrorCode
    /** Number of retry attempts before dead-lettering */
    retryCount?: number
    /** Final error message after retries exhausted */
    finalError?: string
}

/**
 * Create a dead-letter record from a failed event and error details
 *
 * @param rawEvent - Original event data (may be invalid/partial)
 * @param error - Error information from validation failure
 * @param options - Optional enhanced metadata for DLQ investigation (Issue #401)
 * @returns Complete dead-letter record ready for storage
 */
export function createDeadLetterRecord(
    rawEvent: unknown,
    error: {
        category: string
        message: string
        issues?: Array<{ path: string; message: string; code: string }>
    },
    options?: CreateDeadLetterRecordOptions
): DeadLetterRecord {
    const redactedEnvelope = redactEnvelope(rawEvent)

    // Try to extract metadata from the event if it's parseable
    let originalEventId: string | undefined
    let eventType: string | undefined
    let actorKind: string | undefined
    let occurredUtc: string | undefined
    let correlationId: string | undefined

    if (typeof rawEvent === 'object' && rawEvent !== null) {
        const evt = rawEvent as Record<string, unknown>
        originalEventId = typeof evt.eventId === 'string' ? evt.eventId : undefined
        eventType = typeof evt.type === 'string' ? evt.type : undefined
        occurredUtc = typeof evt.occurredUtc === 'string' ? evt.occurredUtc : undefined
        correlationId = typeof evt.correlationId === 'string' ? evt.correlationId : undefined

        if (typeof evt.actor === 'object' && evt.actor !== null) {
            const actor = evt.actor as Record<string, unknown>
            actorKind = typeof actor.kind === 'string' ? actor.kind : undefined
        }
    }

    // Generate unique ID for dead-letter record
    // Use crypto.randomUUID if available (Node 19+), fallback to manual UUID generation
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : generateFallbackUUID()

    // Derive error code from category if not provided
    const errorCode = options?.errorCode ?? deriveErrorCode(error.category)

    // Use provided correlation ID or fall back to extracted one
    const originalCorrelationId = options?.originalCorrelationId ?? correlationId

    return {
        id,
        originalEventId,
        eventType,
        actorKind,
        redactedEnvelope,
        error,
        deadLetteredUtc: new Date().toISOString(),
        occurredUtc,
        correlationId,
        redacted: true,
        partitionKey: 'deadletter', // Single partition for dead-letters (low volume)
        // Issue #401: Enhanced DLQ metadata
        originalCorrelationId,
        failureReason: options?.failureReason ?? error.message,
        firstAttemptTimestamp: options?.firstAttemptTimestamp,
        errorCode,
        retryCount: options?.retryCount ?? 0,
        finalError: options?.finalError ?? error.message
    }
}

/**
 * Derive error code from category string
 */
function deriveErrorCode(category: string): DeadLetterErrorCode {
    switch (category) {
        case 'json-parse':
            return 'json-parse'
        case 'schema-validation':
            return 'schema-validation'
        case 'handler-error':
            return 'handler-error'
        default:
            return 'unknown'
    }
}

/**
 * Fallback UUID generation for environments without crypto.randomUUID
 */
function generateFallbackUUID(): string {
    // Simple UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}
