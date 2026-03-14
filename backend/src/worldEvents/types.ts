import type { InvocationContext } from '@azure/functions'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'

/** Outcome classifications for type-specific world event handlers */
export type WorldEventHandlerOutcome =
    | 'success' // Handler applied domain mutation successfully
    | 'validation-failed' // Payload/schema invalid for handler (dead-letter already stored)
    | 'noop' // No operation performed (e.g., already applied idempotent state)
    | 'error' // Unexpected/transient error (will bubble for retry)

export interface WorldEventHandlerResult {
    outcome: WorldEventHandlerOutcome
    details?: string
}

/** Interface for type-specific world event handlers */
export interface IWorldEventHandler {
    /** Event type string this handler handles (e.g. 'World.Agent.Step').
     *
     *  Using `string` instead of `WorldEventType` allows new event types to be handled
     *  here before the shared package is re-published to the registry. The trade-off is
     *  that typos in handler type strings are not caught at compile time; they are
     *  caught at runtime because an unregistered type string simply finds no handler in
     *  the registry and logs a 'No type-specific handler registered' warning.
     *  Always validate new type strings against WorldEventTypeSchema in shared. */
    readonly type: string
    /** Validate payload & perform side effects. Throw to signal transient failure (retry). */
    handle(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult>
}
