import { Container } from 'inversify'
import { ContainerMode, setupContainer } from '../../src/inversify.config.js'
import { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import { ILocationRepository } from '../../src/repos/locationRepository.js'
import { IPlayerRepository } from '../../src/repos/playerRepository.js'

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
 */
export async function getPlayerRepositoryForTest(mode: ContainerMode = 'memory'): Promise<IPlayerRepository> {
    const container = await getTestContainer(mode)
    return container.get<IPlayerRepository>('IPlayerRepository')
}

/**
 * Get DescriptionRepository from a test container
 */
export async function getDescriptionRepositoryForTest(mode: ContainerMode = 'memory'): Promise<IDescriptionRepository> {
    const container = await getTestContainer(mode)
    return container.get<IDescriptionRepository>('IDescriptionRepository')
}
