/**
 * Dual-Mode Test Helper
 *
 * Provides utilities to run integration tests against both 'memory' and 'cosmos' persistence modes,
 * ensuring comprehensive test coverage without relying on environment variables or local.settings.json.
 *
 * Usage:
 * ```typescript
 * import { describeForBothModes } from '../helpers/dualModeTest.js'
 *
 * describeForBothModes('My Feature', (mode, getRepo) => {
 *   test('does something', async () => {
 *     const repo = await getRepo('ILocationRepository')
 *     // test logic here
 *   })
 * })
 * ```
 */

import { describe } from 'node:test'
import { ContainerMode } from '../../src/inversify.config.js'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import type { IExitRepository } from '../../src/repos/exitRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { getTestContainer } from './testContainer.js'

/**
 * Repository interface types that can be retrieved from the container
 */
type RepositoryType = 'ILocationRepository' | 'IPlayerRepository' | 'IDescriptionRepository' | 'IExitRepository'

type RepositoryMap = {
    ILocationRepository: ILocationRepository
    IPlayerRepository: IPlayerRepository
    IDescriptionRepository: IDescriptionRepository
    IExitRepository: IExitRepository
}

/**
 * Helper function to get a repository from a test container
 */
async function getRepository<T extends RepositoryType>(mode: ContainerMode, repoType: T): Promise<RepositoryMap[T]> {
    const container = await getTestContainer(mode)
    return container.get<RepositoryMap[T]>(repoType)
}

/**
 * Run a test suite against both 'memory' and 'cosmos' persistence modes.
 *
 * This ensures integration tests validate behavior consistently across both implementations
 * without depending on environment variables or local.settings.json.
 *
 * @param suiteName - Name of the test suite (e.g., "Player Bootstrap Flow")
 * @param testFn - Test suite definition function receiving (mode, getRepo) parameters
 *
 * @example
 * ```typescript
 * describeForBothModes('Location Repository', (mode, getRepo) => {
 *   test('can create location', async () => {
 *     const repo = await getRepo('ILocationRepository')
 *     const result = await repo.upsert({ id: 'test', name: 'Test', description: 'Test location', version: 1 })
 *     assert.ok(result.created)
 *   })
 * })
 * ```
 */
export function describeForBothModes(
    suiteName: string,
    testFn: (mode: ContainerMode, getRepo: <T extends RepositoryType>(repoType: T) => Promise<RepositoryMap[T]>) => void
): void {
    const modes: ContainerMode[] = ['memory', 'cosmos']

    for (const mode of modes) {
        describe(`${suiteName} [${mode}]`, () => {
            testFn(mode, async <T extends RepositoryType>(repoType: T) => getRepository(mode, repoType))
        })
    }
}

/**
 * Run a test suite against a specific persistence mode.
 * Useful when a test is only relevant for one mode.
 *
 * @param suiteName - Name of the test suite
 * @param mode - Persistence mode to test ('memory' or 'cosmos')
 * @param testFn - Test suite definition function
 */
export function describeForMode(
    suiteName: string,
    mode: ContainerMode,
    testFn: (getRepo: <T extends RepositoryType>(repoType: T) => Promise<RepositoryMap[T]>) => void
): void {
    describe(`${suiteName} [${mode}]`, () => {
        testFn(async <T extends RepositoryType>(repoType: T) => getRepository(mode, repoType))
    })
}
