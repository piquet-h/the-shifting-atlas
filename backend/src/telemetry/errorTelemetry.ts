/**
 * Error Telemetry Normalization
 *
 * Standardizes mapping of domain and HTTP errors to normalized event properties
 * and classification codes to improve reliability of error-rate queries and alerting.
 *
 * Features:
 * - Classification table: validation, not-found, conflict, internal
 * - Helper recordError() attaches game.error.code, game.error.message, game.error.kind
 * - Duplicate error prevention (first wins per correlation context)
 * - Message truncation >256 chars
 *
 * See: docs/observability.md - Error Telemetry section
 */

import { TELEMETRY_ATTRIBUTE_KEYS } from '@piquet-h/shared'

/**
 * Error classification kinds for normalized error telemetry.
 * Maps to HTTP semantics and domain error categories.
 */
export type ErrorKind = 'validation' | 'not-found' | 'conflict' | 'internal'

/**
 * Maximum length for error messages in telemetry (truncated to prevent bloat)
 */
export const ERROR_MESSAGE_MAX_LENGTH = 256

/**
 * Error telemetry attribute keys (game.error.* namespace)
 * These extend the base TELEMETRY_ATTRIBUTE_KEYS from shared.
 */
export const ERROR_TELEMETRY_KEYS = {
    /** Domain error classification code */
    ERROR_CODE: TELEMETRY_ATTRIBUTE_KEYS.ERROR_CODE,
    /** Truncated error message (max 256 chars) */
    ERROR_MESSAGE: 'game.error.message',
    /** Error kind (validation, not-found, conflict, internal) */
    ERROR_KIND: 'game.error.kind'
} as const

/**
 * Options for enriching error events with normalized attributes.
 */
export interface ErrorEventAttributes {
    /** Domain error code (e.g., 'InvalidPlayerId', 'NoExit') */
    errorCode?: string | null
    /** Error message (will be truncated to ERROR_MESSAGE_MAX_LENGTH) */
    errorMessage?: string | null
    /** Error kind classification (validation, not-found, conflict, internal) */
    errorKind?: ErrorKind | null
}

/**
 * Enrich telemetry properties with normalized error attributes.
 * Adds game.error.code, game.error.message, and game.error.kind.
 * Message is truncated to ERROR_MESSAGE_MAX_LENGTH (256 chars) to prevent telemetry bloat.
 *
 * @param properties - Base telemetry properties object (will be mutated)
 * @param attrs - Error attribute values
 * @returns The mutated properties object for chaining
 */
export function enrichNormalizedErrorAttributes(properties: Record<string, unknown>, attrs: ErrorEventAttributes): Record<string, unknown> {
    if (attrs.errorCode) {
        properties[ERROR_TELEMETRY_KEYS.ERROR_CODE] = attrs.errorCode
    }
    if (attrs.errorMessage) {
        // Truncate message to prevent telemetry bloat (>256 chars edge case)
        const truncated =
            attrs.errorMessage.length > ERROR_MESSAGE_MAX_LENGTH
                ? attrs.errorMessage.substring(0, ERROR_MESSAGE_MAX_LENGTH - 3) + '...'
                : attrs.errorMessage
        properties[ERROR_TELEMETRY_KEYS.ERROR_MESSAGE] = truncated
    }
    if (attrs.errorKind) {
        properties[ERROR_TELEMETRY_KEYS.ERROR_KIND] = attrs.errorKind
    }
    return properties
}

/**
 * Error classification table mapping domain error codes to kinds.
 * Maps standard error codes to their classification for telemetry normalization.
 */
export const ERROR_CLASSIFICATION_TABLE: Record<string, ErrorKind> = {
    // Validation errors (400) - client input issues
    ValidationError: 'validation',
    MissingField: 'validation',
    InvalidFormat: 'validation',
    InvalidDirection: 'validation',
    InvalidPlayerId: 'validation',
    InvalidLocationId: 'validation',
    MissingPlayerId: 'validation',
    MissingPlayerGuid: 'validation',
    MissingLocationId: 'validation',
    MissingOriginId: 'validation',
    MissingDestId: 'validation',
    InvalidJson: 'validation',
    AmbiguousDirection: 'validation',
    NoExit: 'validation',

    // Not found errors (404) - resource doesn't exist
    NotFound: 'not-found',
    PlayerNotFound: 'not-found',
    LocationNotFound: 'not-found',
    FromNotFound: 'not-found',
    'from-missing': 'not-found',

    // Conflict errors (409) - concurrent modification or duplicate
    ExternalIdConflict: 'conflict',
    ConcurrencyError: 'conflict',
    DuplicateError: 'conflict',

    // Rate limiting (429) - throttling (treated as validation since it's a client-side issue)
    RateLimitExceeded: 'validation',

    // Internal errors (500) - server-side issues
    InternalError: 'internal',
    MoveFailed: 'internal',
    DatabaseError: 'internal',
    TimeoutError: 'internal'
}

/**
 * Infer error kind from HTTP status code when error code is unknown.
 * 429 (rate limiting) is classified as validation since it's a client-side issue.
 */
export function inferErrorKindFromStatus(statusCode: number): ErrorKind {
    if ((statusCode >= 400 && statusCode < 404) || statusCode === 429) return 'validation'
    if (statusCode === 404) return 'not-found'
    if (statusCode === 409) return 'conflict'
    return 'internal'
}

/**
 * Classify an error code to its kind.
 * Falls back to inferring from HTTP status if code is not in the classification table.
 */
export function classifyError(errorCode: string, httpStatus?: number): ErrorKind {
    const classified = ERROR_CLASSIFICATION_TABLE[errorCode]
    if (classified) return classified

    // Fallback: infer from HTTP status code
    if (httpStatus !== undefined) {
        return inferErrorKindFromStatus(httpStatus)
    }

    // Default to internal for unknown errors
    return 'internal'
}

/**
 * Error context for the recordError helper.
 * Tracks whether an error has already been recorded for duplicate prevention.
 */
export interface ErrorRecordingContext {
    /** Correlation ID for the request/operation */
    correlationId: string
    /** Whether an error has already been recorded (first-wins) */
    errorRecorded?: boolean
    /** HTTP status code (if available) */
    httpStatus?: number
}

/**
 * Error details for recording.
 */
export interface ErrorDetails {
    /** Error code (e.g., 'ValidationError', 'NotFound') */
    code: string
    /** Error message (will be truncated if >256 chars) */
    message: string
    /** Additional properties to include in telemetry */
    properties?: Record<string, unknown>
}

/**
 * Result of recordError operation.
 */
export interface RecordErrorResult {
    /** Whether the error was recorded (false if duplicate) */
    recorded: boolean
    /** The error attributes that were applied */
    attributes: ErrorEventAttributes
}

/**
 * Build normalized error attributes for telemetry.
 * Handles truncation of messages >256 chars.
 *
 * @param error - Error details (code and message)
 * @param httpStatus - Optional HTTP status code for classification fallback
 * @returns Normalized error attributes
 */
export function buildErrorAttributes(error: ErrorDetails, httpStatus?: number): ErrorEventAttributes {
    const errorKind = classifyError(error.code, httpStatus)

    return {
        errorCode: error.code,
        errorMessage: error.message,
        errorKind
    }
}

/**
 * Record an error in telemetry with normalized attributes.
 * Implements duplicate prevention (first-wins): subsequent errors on the same
 * context are ignored to prevent double-counting in error rate queries.
 *
 * @param context - Error recording context with correlationId and errorRecorded flag
 * @param error - Error details to record
 * @param properties - Base telemetry properties object (will be mutated with error attributes)
 * @returns Result indicating whether error was recorded and the attributes applied
 */
export function recordError(context: ErrorRecordingContext, error: ErrorDetails, properties: Record<string, unknown>): RecordErrorResult {
    if (context.errorRecorded) {
        return {
            recorded: false,
            attributes: {} as ErrorEventAttributes
        }
    }

    const attrs = buildErrorAttributes(error, context.httpStatus)

    enrichNormalizedErrorAttributes(properties, attrs)

    context.errorRecorded = true

    if (error.properties) {
        Object.assign(properties, error.properties)
    }

    return {
        recorded: true,
        attributes: attrs
    }
}

/**
 * Check if an error has already been recorded for a given context.
 */
export function hasErrorRecorded(context: ErrorRecordingContext): boolean {
    return context.errorRecorded === true
}

/**
 * Create a new error recording context.
 *
 * @param correlationId - Correlation ID for the request/operation
 * @param httpStatus - Optional HTTP status code
 * @returns New error recording context
 */
export function createErrorRecordingContext(correlationId: string, httpStatus?: number): ErrorRecordingContext {
    return {
        correlationId,
        httpStatus,
        errorRecorded: false
    }
}

export { TELEMETRY_ATTRIBUTE_KEYS } from '@piquet-h/shared'
