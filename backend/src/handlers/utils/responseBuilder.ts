/**
 * HTTP response builder utilities for Azure Functions handlers.
 * Centralizes response construction to eliminate duplication across handlers.
 *
 * Error responses use the standardized error envelope from http/errorEnvelope.ts
 * for consistent error structure and telemetry correlation.
 */
import { HttpResponseInit } from '@azure/functions'
import { ok } from '@piquet-h/shared'
import { formatError, formatValidationErrors, type StandardErrorCode, type ValidationErrorItem } from '../../http/errorEnvelope.js'
import { CORRELATION_HEADER } from '../../telemetry/TelemetryService.js'

// Re-export types for convenience
export type { StandardErrorCode, ValidationErrorItem }

export interface ResponseOptions {
    correlationId: string
    playerGuid?: string
    additionalHeaders?: Record<string, string>
}

/**
 * Build a JSON response with standard headers.
 * @param status - HTTP status code
 * @param body - Response body (will be serialized to JSON)
 * @param options - Response options (correlation ID, player GUID, additional headers)
 * @returns Azure Functions HTTP response
 */
export function jsonResponse(status: number, body: unknown, options: ResponseOptions): HttpResponseInit {
    const headers: Record<string, string> = {
        [CORRELATION_HEADER]: options.correlationId,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...options.additionalHeaders
    }

    if (options.playerGuid) {
        headers['x-player-guid'] = options.playerGuid
    }

    return { status, headers, jsonBody: body }
}

/**
 * Build a successful (200) response with ok envelope.
 * @param data - Response data to wrap in ok envelope
 * @param options - Response options
 * @returns Azure Functions HTTP response with 200 status
 */
export function okResponse(data: unknown, options: ResponseOptions): HttpResponseInit {
    return jsonResponse(200, ok(data, options.correlationId), options)
}

/**
 * Build an error response with standardized error envelope.
 * Uses formatError from http/errorEnvelope.ts for consistent structure.
 *
 * @param status - HTTP error status code
 * @param code - Error code (e.g., 'NotFound', 'InvalidInput')
 * @param message - Human-readable error message
 * @param options - Response options
 * @returns Azure Functions HTTP response with error status and err envelope
 */
export function errorResponse(status: number, code: StandardErrorCode, message: string, options: ResponseOptions): HttpResponseInit {
    return jsonResponse(status, formatError(code, message, options.correlationId), options)
}

/**
 * Build an error response with aggregated validation errors.
 *
 * @param errors - Array of validation errors
 * @param options - Response options
 * @returns Azure Functions HTTP response with 400 status
 */
export function validationErrorResponse(errors: ValidationErrorItem[], options: ResponseOptions): HttpResponseInit {
    return jsonResponse(400, formatValidationErrors(errors, options.correlationId), options)
}

/**
 * Build an internal error response for unhandled exceptions.
 * Masks the actual error message in production for security.
 *
 * @param error - The caught error
 * @param options - Response options
 * @returns Azure Functions HTTP response with 500 status
 */
export function internalErrorResponse(error: unknown, options: ResponseOptions): HttpResponseInit {
    const isProduction = process.env.NODE_ENV === 'production'
    const errorMessage = isProduction ? 'An internal error occurred' : error instanceof Error ? error.message : 'Unknown error'
    return errorResponse(500, 'InternalError', errorMessage, options)
}

/**
 * Build a service unavailable (503) response with data payload.
 * @param data - Response data to include
 * @param options - Response options
 * @returns Azure Functions HTTP response with 503 status
 */
export function serviceUnavailableResponse(data: unknown, options: ResponseOptions): HttpResponseInit {
    return jsonResponse(503, data, options)
}
