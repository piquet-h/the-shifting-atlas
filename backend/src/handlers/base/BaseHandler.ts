/**
 * Abstract base handler class for Azure Functions HTTP handlers.
 * Provides common functionality: timing, correlation, container access, telemetry.
 */
import { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { type GameEventName } from '@piquet-h/shared'
import { Container } from 'inversify'
import { extractCorrelationId, extractPlayerGuid, trackGameEventStrict } from '../../telemetry.js'

export abstract class BaseHandler {
    protected correlationId!: string
    protected playerGuid?: string
    protected container!: Container
    private started!: number

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
        trackGameEventStrict(
            eventName,
            { ...properties, latencyMs: this.latencyMs },
            { playerGuid: this.playerGuid, correlationId: this.correlationId }
        )
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
