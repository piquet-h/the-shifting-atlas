/**
 * Input validation middleware for Azure Functions handlers
 */

import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import { err, GameEventName, validateLocationId, validatePlayerId } from '@piquet-h/shared'
import { extractCorrelationId, extractPlayerGuid, type GameTelemetryOptions } from '../telemetry/TelemetryService.js'

export type TrackGameEventFn = (name: GameEventName, properties: Record<string, unknown>, opts?: GameTelemetryOptions) => void

/**
 * Validate player ID from request headers
 * Returns 400 response with structured error if invalid
 * @param req - HTTP request
 * @param required - Whether player ID is required (default: true)
 * @param trackGameEvent - Optional telemetry tracking function
 * @returns null if valid, 400 response if invalid
 */
export function validatePlayerIdHeader(req: HttpRequest, required: boolean, trackGameEvent?: TrackGameEventFn): HttpResponseInit | null {
    const playerGuid = extractPlayerGuid(req.headers)
    const correlationId = extractCorrelationId(req.headers)

    const validation = validatePlayerId(playerGuid)

    if (!validation.success) {
        // Track validation failure if callback provided
        if (trackGameEvent) {
            trackGameEvent(
                'Security.Validation.Failed',
                {
                    field: 'playerGuid',
                    code: validation.error?.code,
                    message: validation.error?.message
                },
                { playerGuid, correlationId }
            )
        }

        // Return 400 if required or if ID is present but invalid
        if (required || playerGuid) {
            return {
                status: 400,
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                jsonBody: err(validation.error?.code || 'ValidationError', validation.error?.message || 'Invalid input', correlationId)
            }
        }
    }

    return null
}

/**
 * Validate location ID from query parameter
 * Returns 400 response with structured error if invalid
 * @param req - HTTP request
 * @param paramName - Query parameter name (default: 'id')
 * @param required - Whether location ID is required (default: true)
 * @param trackGameEvent - Optional telemetry tracking function
 * @returns null if valid, 400 response if invalid
 */
export function validateLocationIdParam(
    req: HttpRequest,
    paramName: string,
    required: boolean,
    trackGameEvent?: TrackGameEventFn
): HttpResponseInit | null {
    const locationId = req.query.get(paramName)
    const correlationId = extractCorrelationId(req.headers)
    const playerGuid = extractPlayerGuid(req.headers)

    // If not required and not provided, allow
    if (!required && !locationId) {
        return null
    }

    const validation = validateLocationId(locationId)

    if (!validation.success) {
        // Track validation failure if callback provided
        if (trackGameEvent) {
            trackGameEvent(
                'Security.Validation.Failed',
                {
                    field: paramName,
                    code: validation.error?.code,
                    message: validation.error?.message
                },
                { playerGuid, correlationId }
            )
        }

        return {
            status: 400,
            headers: {
                'Content-Type': 'application/json; charset=utf-8'
            },
            jsonBody: err(validation.error?.code || 'ValidationError', validation.error?.message || 'Invalid input', correlationId)
        }
    }

    return null
}
