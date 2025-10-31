/**
 * Abstract base handler class for Azure Functions HTTP handlers.
 * Provides common functionality: timing, correlation, container access, telemetry.
 */
import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { type GameEventName } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import { endSpan, startHttpSpan } from '../../instrumentation/opentelemetry.js'
import { extractCorrelationId, extractPlayerGuid } from '../../telemetry.js'
import type { ITelemetryClient } from '../../telemetry/ITelemetryClient.js'

@injectable()
export abstract class BaseHandler {
    protected correlationId!: string
    protected playerGuid?: string
    protected container!: Container
    private started!: number
    private span?: import('@opentelemetry/api').Span

    constructor(@inject('ITelemetryClient') protected telemetry: ITelemetryClient) {}

    /**
     * Main entry point for the handler. Sets up context and calls execute().
     * @param req - Azure Functions HTTP request
     * @param context - Azure Functions invocation context
     * @returns HTTP response
     */
    async handle(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
        this.started = Date.now()
        // Start HTTP span with traceparent continuation if header present
        this.span = startHttpSpan(`Http ${context.functionName}`, req.headers)
        this.span.setAttribute('http.method', req.method)
        try {
            // Derive target path (exclude query string)
            const url = new URL(req.url)
            this.span.setAttribute('http.target', url.pathname)
        } catch {
            // ignore URL parse errors
        }
        this.span.setAttribute('http.route', context.functionName)
        this.span.setAttribute('tsa.correlation_id', this.correlationId)
        this.correlationId = extractCorrelationId(req.headers)
        this.playerGuid = extractPlayerGuid(req.headers)
        this.container = context.extraInputs.get('container') as Container

        try {
            const result = await this.execute(req, context)
            if (this.span) {
                if (result.status !== undefined) this.span.setAttribute('http.status_code', result.status)
            }
            this.trackSuccess()
            endSpan(this.span!)
            return result
        } catch (error) {
            if (this.span) {
                this.span.setAttribute('http.status_code', 500)
            }
            this.trackError(error)
            endSpan(this.span!, error)
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

    /**
     * Get a repository or service from the inversify container.
     * @param key - Inversify binding key (e.g., 'IPlayerRepository')
     * @returns The resolved dependency
     */
    protected getRepository<T>(key: string): T {
        return this.container.get<T>(key)
    }

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
                playerGuid: this.playerGuid,
                correlationId: this.correlationId,
                service: process.env.TSA_SERVICE_NAME || 'backend'
            }
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
}
