import { Container } from 'inversify'
import { setupContainer } from './inversify.config.js'
import { IDescriptionRepository } from './repos/descriptionRepository.js'
import { IExitRepository } from './repos/exitRepository.js'
import { ILocationRepository } from './repos/locationRepository.js'
import { IPlayerRepository } from './repos/playerRepository.js'

/**
 * Shared container for factory functions.
 * This allows integration tests and legacy code to continue using factory patterns
 * while benefiting from Inversify dependency injection.
 */
let sharedContainer: Container | undefined

async function getSharedContainer(): Promise<Container> {
    if (!sharedContainer) {
        sharedContainer = new Container()
        await setupContainer(sharedContainer)
    }
    return sharedContainer
}

/**
 * Reset the shared container (for testing purposes)
 */
export function __resetSharedContainer() {
    sharedContainer = undefined
}

/**
 * Factory function for LocationRepository
 * Delegates to Inversify container
 */
export async function getLocationRepository(): Promise<ILocationRepository> {
    const container = await getSharedContainer()
    return container.get<ILocationRepository>('ILocationRepository')
}

/**
 * Factory function for PlayerRepository
 * Delegates to Inversify container
 */
export async function getPlayerRepository(): Promise<IPlayerRepository> {
    const container = await getSharedContainer()
    return container.get<IPlayerRepository>('IPlayerRepository')
}

/**
 * Factory function for ExitRepository
 * Delegates to Inversify container
 */
export async function getExitRepository(): Promise<IExitRepository> {
    const container = await getSharedContainer()
    return container.get<IExitRepository>('IExitRepository')
}

/**
 * Factory function for DescriptionRepository
 * Delegates to Inversify container
 */
export async function getDescriptionRepository(): Promise<IDescriptionRepository> {
    const container = await getSharedContainer()
    return container.get<IDescriptionRepository>('IDescriptionRepository')
}
