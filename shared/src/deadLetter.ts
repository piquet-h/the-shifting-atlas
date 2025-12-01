/** Dead-letter types and redaction utilities for failed events. */

/**
 * Error code classification for dead-letter records (Issue #401)
 * Used to distinguish transient vs permanent failures for retry decisions
 */
export type DeadLetterErrorCode = 'json-parse' | 'schema-validation' | 'handler-error' | 'unknown'

/** Dead-letter record stored in Cosmos SQL. */
export interface DeadLetterRecord {
    /** Record ID (UUID v4) */
    id: string

    /** Original event ID (if parseable) */
    originalEventId?: string

    /** Event type (if parseable) */
    eventType?: string

    /** Actor kind (if parseable) */
    actorKind?: string

    /** Redacted envelope (sensitive fields masked) */
    redactedEnvelope: Record<string, unknown>

    /** Validation error details */
    error: {
        /** Error category */
        category: string

        /** Error message */
        message: string

        /** Structured validation issues */
        issues?: Array<{
            path: string
            message: string
            code: string
        }>
    }

    /** Dead-lettered timestamp (ISO 8601) */
    deadLetteredUtc: string

    /** Original occurred timestamp (if parseable) */
    occurredUtc?: string

    /** Correlation ID (if parseable) */
    correlationId?: string

    /** True if redaction applied */
    redacted: boolean

    /** Partition key ('deadletter') */
    partitionKey: string

    /** Original correlation ID for cross-service tracing */
    originalCorrelationId?: string

    /** Failure reason */
    failureReason?: string

    /** First processing attempt timestamp (ISO 8601) */
    firstAttemptTimestamp?: string

    /** Error code classification */
    errorCode?: DeadLetterErrorCode

    /** Retry attempts (0 = immediate DLQ) */
    retryCount?: number

    /** Final error message after retries exhausted */
    finalError?: string
}

/** Payload truncation config */
const MAX_PAYLOAD_SIZE = 10000 // characters
const MAX_ARRAY_ITEMS = 10
const TRUNCATION_MARKER = '...[TRUNCATED]'

/** Redact sensitive fields from an event envelope before storage. */
export function redactEnvelope(envelope: unknown): Record<string, unknown> {
    if (typeof envelope !== 'object' || envelope === null) {
        return { _raw: String(envelope).substring(0, 1000) }
    }

    const original = envelope as Record<string, unknown>
    const redacted: Record<string, unknown> = {}

    // Copy non-sensitive fields
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

        // Default: truncate
        redacted[key] = truncateValue(value)
    }

    return redacted
}

/** Redact ID by keeping last 4 chars and masking the rest. */
function redactId(id: string): string {
    if (id.length <= 4) {
        return '****'
    }
    const last4 = id.slice(-4)
    const masked = '*'.repeat(Math.min(8, id.length - 4))
    return `${masked}${last4}`
}

/** Redact payload by creating a type summary instead of storing full content. */
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

    // Include redacted IDs
    for (const [key, value] of Object.entries(obj)) {
        if (key.toLowerCase().includes('id') && typeof value === 'string') {
            summary[key] = redactId(value)
        }
    }

    return summary
}

/** Truncate large values/arrays/objects. */
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

/** Options for creating a dead-letter record with enhanced metadata. */
export interface CreateDeadLetterRecordOptions {
    /** Original correlation ID */
    originalCorrelationId?: string
    /** Human-readable failure reason */
    failureReason?: string
    /** First processing attempt timestamp */
    firstAttemptTimestamp?: string
    /** Error code classification */
    errorCode?: DeadLetterErrorCode
    /** Number of retry attempts before dead-lettering */
    retryCount?: number
    /** Final error message after retries exhausted */
    finalError?: string
}

/** Create a dead-letter record from a failed event and error details. */
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

    // Extract metadata if parseable
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

    // Generate record ID
    const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : generateFallbackUUID()

    // Derive error code
    const derivedErrorCode = options?.errorCode ?? deriveErrorCode(error.category)

    // Resolve original correlation ID
    const resolvedOriginalCorrelationId = options?.originalCorrelationId ?? correlationId

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
        partitionKey: 'deadletter',
        originalCorrelationId: resolvedOriginalCorrelationId,
        failureReason: options?.failureReason ?? error.message,
        firstAttemptTimestamp: options?.firstAttemptTimestamp,
        errorCode: derivedErrorCode,
        retryCount: options?.retryCount ?? 0,
        finalError: options?.finalError ?? error.message
    }
}

/** Derive error code from category string. */
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

/** Fallback UUID generation for environments without crypto.randomUUID. */
function generateFallbackUUID(): string {
    // Simple UUID v4 implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}
