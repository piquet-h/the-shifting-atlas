import { Container } from 'inversify'
import { ContainerMode, setupContainer } from '../../src/inversify.config.js'
import { ILocationRepository } from '../../src/repos/locationRepository.js'
import { getPlayerRepository, IPlayerRepository } from '../../src/repos/playerRepository.js'

/**
 * Test helper to get a fresh container for each test.
 * Ensures isolation between tests.
 * @param mode - 'mock', 'memory', or 'cosmos'
 */
export async function getTestContainer(mode: ContainerMode = 'memory'): Promise<Container> {
    const container = new Container()
    await setupContainer(container, mode)
    return container
}

/**
 * Get LocationRepository from a test container
 */
export async function getLocationRepositoryForTest(mode: ContainerMode = 'memory'): Promise<ILocationRepository> {
    const container = await getTestContainer(mode)
    return container.get<ILocationRepository>('ILocationRepository')
}

/**
 * Get PlayerRepository from a test container
 * Note: PlayerRepository not yet migrated to DI, uses factory pattern
 */
export async function getPlayerRepositoryForTest(): Promise<IPlayerRepository> {
    return await getPlayerRepository()
}

// Re-export for backward compatibility
export { __resetPlayerRepositoryForTests } from '../../src/repos/playerRepository.js'
export { __resetLocationRepositoryForTests } from '../../src/repos/locationRepository.js'
