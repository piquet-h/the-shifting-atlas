/**
 * HTTP Error Envelope Utility
 *
 * Standardized error response structure for all HTTP handlers.
 * Ensures consistent error format across the API for frontend parsing reliability
 * and telemetry correlation.
 *
 * Error envelope structure:
 * {
 *   success: false,
 *   error: { code: string, message: string },
 *   correlationId?: string,
 *   errors?: Array<{ code: string, message: string }>  // for aggregated validation errors
 * }
 */
import type { HttpResponseInit } from '@azure/functions'
import { CORRELATION_HEADER } from '../telemetry/TelemetryService.js'

/**
 * Standard error codes used across the API.
 * Extend as needed but prefer reusing existing codes for consistency.
 */
export type StandardErrorCode =
    // Validation errors (400)
    | 'ValidationError'
    | 'MissingField'
    | 'InvalidFormat'
    | 'InvalidDirection'
    | 'InvalidPlayerId'
    | 'InvalidLocationId'
    | 'MissingPlayerId'
    | 'MissingPlayerGuid'
    | 'MissingLocationId'
    | 'MissingOriginId'
    | 'MissingDestId'
    | 'InvalidJson'
    | 'AmbiguousDirection'
    | 'NoExit'
    // Not found errors (404)
    | 'NotFound'
    | 'PlayerNotFound'
    | 'LocationNotFound'
    | 'FromNotFound'
    // Conflict errors (409)
    | 'ExternalIdConflict'
    // Rate limiting (429)
    | 'RateLimitExceeded'
    // Internal errors (500)
    | 'InternalError'
    | 'MoveFailed'
    // Generic fallback
    | string

/**
 * Error envelope structure for API responses.
 */
export interface ErrorEnvelope {
    success: false
    error: {
        code: string
        message: string
    }
    correlationId?: string
    /** Aggregated validation errors when multiple fields fail validation */
    errors?: Array<{ code: string; message: string }>
}

/**
 * Validation error item for aggregated validation responses.
 */
export interface ValidationErrorItem {
    code: string
    message: string
}

/**
 * Format a single error into the standard envelope structure.
 *
 * @param code - Error code (e.g., 'ValidationError', 'NotFound')
 * @param message - Human-readable error message
 * @param correlationId - Optional correlation ID for telemetry
 * @returns ErrorEnvelope object
 */
export function formatError(code: StandardErrorCode, message: string, correlationId?: string): ErrorEnvelope {
    return {
        success: false,
        error: { code, message },
        correlationId
    }
}

/**
 * Format multiple validation errors into an aggregated envelope.
 *
 * @param errors - Array of validation errors
 * @param correlationId - Optional correlation ID for telemetry
 * @returns ErrorEnvelope with errors array
 */
export function formatValidationErrors(errors: ValidationErrorItem[], correlationId?: string): ErrorEnvelope {
    const primaryError = errors[0] || { code: 'ValidationError', message: 'Validation failed' }
    return {
        success: false,
        error: primaryError,
        correlationId,
        errors: errors.length > 1 ? errors : undefined
    }
}

/**
 * Build a complete HTTP error response with proper headers and envelope.
 *
 * @param status - HTTP status code (4xx or 5xx)
 * @param code - Error code
 * @param message - Human-readable error message
 * @param correlationId - Correlation ID for telemetry
 * @returns Azure Functions HttpResponseInit
 */
export function errorResponse(status: number, code: StandardErrorCode, message: string, correlationId: string): HttpResponseInit {
    return {
        status,
        headers: {
            [CORRELATION_HEADER]: correlationId,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        jsonBody: formatError(code, message, correlationId)
    }
}

/**
 * Build an HTTP error response with aggregated validation errors.
 *
 * @param errors - Array of validation errors
 * @param correlationId - Correlation ID for telemetry
 * @returns Azure Functions HttpResponseInit with 400 status
 */
export function validationErrorResponse(errors: ValidationErrorItem[], correlationId: string): HttpResponseInit {
    return {
        status: 400,
        headers: {
            [CORRELATION_HEADER]: correlationId,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        jsonBody: formatValidationErrors(errors, correlationId)
    }
}

/**
 * Build an internal error response for unhandled exceptions.
 * Masks the actual error message in production for security.
 *
 * @param error - The caught error
 * @param correlationId - Correlation ID for telemetry
 * @returns Azure Functions HttpResponseInit with 500 status
 */
export function internalErrorResponse(error: unknown, correlationId: string): HttpResponseInit {
    // In production, don't expose internal error messages
    const isProduction = process.env.NODE_ENV === 'production'
    let errorMessage: string

    if (isProduction) {
        errorMessage = 'An internal error occurred'
    } else if (error instanceof Error) {
        errorMessage = error.message
    } else if (typeof error === 'string' && error.length > 0) {
        errorMessage = error
    } else {
        errorMessage = 'Unknown error'
    }

    return errorResponse(500, 'InternalError', errorMessage, correlationId)
}
