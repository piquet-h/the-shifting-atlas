/**
 * HTTP response builder utilities for Azure Functions handlers.
 * Centralizes response construction to eliminate duplication across handlers.
 */
import { HttpResponseInit } from '@azure/functions'
import { err, ok } from '@piquet-h/shared'
import { CORRELATION_HEADER } from '../../telemetry.js'

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
 * Build an error response with err envelope.
 * @param status - HTTP error status code
 * @param code - Error code (e.g., 'NotFound', 'InvalidInput')
 * @param message - Human-readable error message
 * @param options - Response options
 * @returns Azure Functions HTTP response with error status and err envelope
 */
export function errorResponse(status: number, code: string, message: string, options: ResponseOptions): HttpResponseInit {
    return jsonResponse(status, err(code, message, options.correlationId), options)
}
