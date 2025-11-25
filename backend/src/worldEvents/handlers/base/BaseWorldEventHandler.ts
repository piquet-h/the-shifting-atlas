/**
 * Abstract base class for type-specific world event handlers.
 * Eliminates duplicate validation, dead-letter, and telemetry boilerplate.
 *
 * Subclasses implement:
 * - validatePayload(): Check payload structure and return missing/invalid fields
 * - executeHandler(): Apply domain mutations with validated payload
 *
 * Base class provides:
 * - Automatic dead-letter storage for validation failures
 * - Consistent telemetry emission (World.Event.HandlerInvoked)
 * - Error handling and outcome classification
 * - Correlation ID propagation
 */

import type { InvocationContext } from '@azure/functions'
import { createDeadLetterRecord } from '@piquet-h/shared/deadLetter'
import type { WorldEventEnvelope, WorldEventType } from '@piquet-h/shared/events'
import { inject, injectable } from 'inversify'
import type { IDeadLetterRepository } from '../../../repos/deadLetterRepository.js'
import { TelemetryService } from '../../../telemetry/TelemetryService.js'
import type { IWorldEventHandler, WorldEventHandlerResult } from '../../types.js'

/**
 * Validation result from payload inspection
 */
export interface ValidationResult {
    valid: boolean
    missing: string[]
    message?: string
}

/**
 * Abstract base handler for world events
 * Consolidates validation, dead-letter, telemetry patterns
 */
@injectable()
export abstract class BaseWorldEventHandler implements IWorldEventHandler {
    abstract readonly type: WorldEventType

    constructor(
        @inject('IDeadLetterRepository') protected deadLetterRepo: IDeadLetterRepository,
        @inject(TelemetryService) protected telemetry: TelemetryService
    ) {}

    /**
     * Main entry point: validate, execute, or handle failures
     */
    async handle(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult> {
        // Validate payload structure
        const validation = this.validatePayload(event.payload)

        if (!validation.valid) {
            return await this.handleValidationFailure(event, context, validation)
        }

        // Execute handler-specific logic
        try {
            const result = await this.executeHandler(event, context)

            // Emit success/noop telemetry
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: this.constructor.name,
                    outcome: result.outcome,
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )

            return result
        } catch (err) {
            // Transient error - emit telemetry and bubble for retry
            this.telemetry.trackGameEvent(
                'World.Event.HandlerInvoked',
                {
                    eventType: event.type,
                    handler: this.constructor.name,
                    outcome: 'error',
                    errorMessage: String(err),
                    correlationId: event.correlationId
                },
                { correlationId: event.correlationId }
            )
            context.error(`${this.constructor.name} error`, { error: String(err) })
            throw err
        }
    }

    /**
     * Validate payload structure. Return missing fields or custom validation message.
     * Subclasses implement specific validation logic.
     */
    protected abstract validatePayload(payload: unknown): ValidationResult

    /**
     * Execute handler-specific domain mutations after validation passes.
     * Subclasses implement business logic.
     */
    protected abstract executeHandler(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult>

    /**
     * Handle validation failure: store dead-letter, emit telemetry, return outcome
     */
    private async handleValidationFailure(
        event: WorldEventEnvelope,
        context: InvocationContext,
        validation: ValidationResult
    ): Promise<WorldEventHandlerResult> {
        const message = validation.message || `Missing required fields for ${event.type}`
        const issues = validation.missing.map((f) => ({ path: f, message: 'Missing field', code: 'missing' as const }))

        const record = createDeadLetterRecord(event, {
            category: 'handler-validation',
            message,
            issues
        })

        try {
            await this.deadLetterRepo.store(record)
        } catch (e) {
            context.error('Failed to store dead-letter for handler validation failure', { error: String(e) })
        }

        this.telemetry.trackGameEvent(
            'World.Event.HandlerInvoked',
            {
                eventType: event.type,
                handler: this.constructor.name,
                outcome: 'validation-failed',
                missingCount: validation.missing.length,
                correlationId: event.correlationId
            },
            { correlationId: event.correlationId }
        )

        context.warn(`${this.constructor.name} validation failed`, { missing: validation.missing })

        return {
            outcome: 'validation-failed',
            details: validation.message || `Missing: ${validation.missing.join(',')}`
        }
    }
}
