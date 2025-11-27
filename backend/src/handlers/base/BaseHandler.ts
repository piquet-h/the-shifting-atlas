/**
 * Abstract base handler class for Azure Functions HTTP handlers.
 * Provides common functionality: timing, correlation, container access, telemetry.
 */
import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { type GameEventName } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import { errorResponse as buildErrorResponse, internalErrorResponse } from '../../http/errorEnvelope.js'
import type { ITelemetryClient } from '../../telemetry/ITelemetryClient.js'
import { extractCorrelationId, extractPlayerGuid } from '../../telemetry/TelemetryService.js'

@injectable()
export abstract class BaseHandler {
    protected correlationId!: string
    protected playerGuid?: string
    protected container!: Container
    private started!: number

    constructor(@inject('ITelemetryClient') protected telemetry: ITelemetryClient) {}

    /**
     * Main entry point for the handler. Sets up context and calls execute().
     * @param req - Azure Functions HTTP request
     * @param context - Azure Functions invocation context
     * @returns HTTP response
     */
    async handle(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
        this.started = Date.now()
        this.correlationId = extractCorrelationId(req.headers)
        this.playerGuid = extractPlayerGuid(req.headers)
        this.container = context.extraInputs.get('container') as Container

        try {
            const result = await this.execute(req, context)
            this.trackSuccess()
            return result
        } catch (error) {
            this.trackError(error)
            throw error
        }
    }

    /**
     * Subclass implementation of handler logic.
     * Override this method to implement handler-specific behavior.
     * @param req - Azure Functions HTTP request
     * @param context - Azure Functions invocation context
     * @returns HTTP response
     */
    protected abstract execute(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit>

    // All handlers use constructor-injected dependencies; dynamic container lookups removed.

    /**
     * Get the elapsed time since handler started (in milliseconds).
     */
    protected get latencyMs(): number {
        return Date.now() - this.started
    }

    /**
     * Emit a telemetry event with automatic correlation and timing.
     * @param eventName - Game event name (from shared package enumeration)
     * @param properties - Event properties
     */
    protected track(eventName: GameEventName, properties: Record<string, unknown>): void {
        this.telemetry.trackEvent({
            name: eventName,
            properties: {
                ...properties,
                latencyMs: this.latencyMs,
                // Only set playerGuid from BaseHandler if not already provided in properties
                // This prevents overwriting explicit playerGuid values with undefined
                playerGuid: properties.playerGuid ?? this.playerGuid,
                correlationId: this.correlationId,
                service: process.env.TSA_SERVICE_NAME || 'backend'
            }
        })
    }

    /**
     * Emit a telemetry event for an error with errorCode included.
     * Use this when returning an error response to ensure telemetry correlation.
     * @param eventName - Game event name (from shared package enumeration)
     * @param errorCode - The error code being returned (e.g., 'ValidationError', 'NotFound')
     * @param properties - Additional event properties
     */
    protected trackWithErrorCode(eventName: GameEventName, errorCode: string, properties: Record<string, unknown> = {}): void {
        this.track(eventName, {
            ...properties,
            errorCode
        })
    }

    /**
     * Called automatically after successful execute().
     * Override to emit success telemetry for specific handlers.
     */
    protected trackSuccess(): void {
        // Default: no-op. Subclasses can override.
    }

    /**
     * Called automatically when execute() throws an error.
     * Override to emit error telemetry for specific handlers.
     * @param error - The error that was thrown
     */
    protected trackError(error: unknown): void {
        // Default: no-op. Subclasses can override.
        void error // Prevent unused parameter warning
    }

    /**
     * Create a standardized error response using the error envelope.
     * @deprecated Use errorResponse from http/errorEnvelope.ts or utils/responseBuilder.ts instead.
     * @param error - The error object or message
     * @param status - HTTP status code (default: 500)
     * @returns HTTP response with error message
     */
    protected errorResponse(error: unknown, status: number = 500): HttpResponseInit {
        if (status === 500) {
            return internalErrorResponse(error, this.correlationId)
        }
        const errorMessage = error instanceof Error ? error.message : String(error)
        return buildErrorResponse(status, 'Error', errorMessage, this.correlationId)
    }

    /**
     * Create a standardized validation error response (400) using the error envelope.
     * @deprecated Use validationErrorResponse from http/errorEnvelope.ts or utils/responseBuilder.ts instead.
     * @param message - Validation error message
     * @returns HTTP 400 response with error message
     */
    protected validationErrorResponse(message: string): HttpResponseInit {
        return buildErrorResponse(400, 'ValidationError', message, this.correlationId)
    }

    /**
     * Create a standardized not found response (404) using the error envelope.
     * @deprecated Use errorResponse from http/errorEnvelope.ts or utils/responseBuilder.ts instead.
     * @param message - Optional custom message (default: "Not found")
     * @returns HTTP 404 response with error message
     */
    protected notFoundResponse(message: string = 'Not found'): HttpResponseInit {
        return buildErrorResponse(404, 'NotFound', message, this.correlationId)
    }
}
