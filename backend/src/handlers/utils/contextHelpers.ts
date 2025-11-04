/**
 * Context helper utilities for Azure Functions handlers.
 * Simplifies dependency injection container access.
 */
import { InvocationContext } from '@azure/functions'
import { Container } from 'inversify'

/**
 * Get the inversify container from the invocation context.
 * Handlers should rely on constructor injection; this is for exceptional cases.
 */
export function getContainer(context: InvocationContext): Container {
    return context.extraInputs.get('container') as Container
}
