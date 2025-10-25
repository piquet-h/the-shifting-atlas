import { Container } from 'inversify'
import { setupContainer } from '../../src/inversify.config.js'
import { ILocationRepository } from '../../src/repos/locationRepository.js'
import { getPlayerRepository, IPlayerRepository } from '../../src/repos/playerRepository.js'

/**
 * Test helper to get a fresh container for each test.
 * Ensures isolation between tests.
 */
export async function getTestContainer(): Promise<Container> {
    const container = new Container()
    await setupContainer(container)
    return container
}

/**
 * Get LocationRepository from a test container
 */
export async function getLocationRepositoryForTest(): Promise<ILocationRepository> {
    const container = await getTestContainer()
    return container.get<ILocationRepository>('ILocationRepository')
}

/**
 * Get PlayerRepository from a test container
 * Note: PlayerRepository not yet migrated to DI, uses factory pattern
 */
export async function getPlayerRepositoryForTest(): Promise<IPlayerRepository> {
    return await getPlayerRepository()
}
