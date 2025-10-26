/**
 * Context helper utilities for Azure Functions handlers.
 * Simplifies dependency injection container access.
 */
import { InvocationContext } from '@azure/functions'
import { Container } from 'inversify'

/**
 * Extract a repository or service from the inversify container.
 * Eliminates boilerplate of casting and extracting container from context.
 * @param context - Azure Functions invocation context
 * @param key - Inversify binding key (e.g., 'IPlayerRepository')
 * @returns The resolved dependency from the container
 */
export function getRepository<T>(context: InvocationContext, key: string): T {
    const container = context.extraInputs.get('container') as Container
    return container.get<T>(key)
}

/**
 * Get the inversify container from the invocation context.
 * @param context - Azure Functions invocation context
 * @returns The inversify container
 */
export function getContainer(context: InvocationContext): Container {
    return context.extraInputs.get('container') as Container
}
