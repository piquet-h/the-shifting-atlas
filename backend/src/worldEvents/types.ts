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
    /** Event type string this handler handles (e.g. 'World.Agent.Step'). Using string
     *  instead of WorldEventType allows new types to be added to shared and handled here
     *  before the shared package is re-published. */
    readonly type: string
    /** Validate payload & perform side effects. Throw to signal transient failure (retry). */
    handle(event: WorldEventEnvelope, context: InvocationContext): Promise<WorldEventHandlerResult>
}
