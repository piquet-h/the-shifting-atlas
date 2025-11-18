/**
 * Shared helper for running integration test suites against both memory and cosmos modes
 *
 * Usage:
 * ```typescript
 * import { describeForBothModes } from '../helpers/describeForBothModes.js'
 *
 * describeForBothModes('My Repository', (mode) => {
 *     let fixture: IntegrationTestFixture
 *
 *     beforeEach(async () => {
 *         fixture = new IntegrationTestFixture(mode)
 *         await fixture.setup()
 *     })
 *
 *     afterEach(async () => {
 *         await fixture.teardown()
 *     })
 *
 *     test('my test', async () => {
 *         // Test code here
 *     })
 * })
 * ```
 */

import { describe, test } from 'node:test'
import type { ContainerMode } from './testInversify.config.js'

/**
 * Run test suite against both memory and cosmos modes
 * Cosmos mode tests will skip gracefully if infrastructure is not available
 *
 * @param suiteName - Name of the test suite (e.g., "Location Repository")
 * @param testFn - Test function that receives the mode and defines tests
 */
export function describeForBothModes(suiteName: string, testFn: (mode: ContainerMode) => void): void {
    const modes: ContainerMode[] = ['memory', 'cosmos']

    for (const mode of modes) {
        describe(`${suiteName} [${mode}]`, () => {
            // Skip cosmos tests if PERSISTENCE_MODE is not explicitly set to 'cosmos'
            // This allows tests to run in CI without requiring Cosmos DB credentials
            if (mode === 'cosmos' && process.env.PERSISTENCE_MODE !== 'cosmos') {
                test.skip('Cosmos tests skipped (PERSISTENCE_MODE != cosmos)', () => {})
                return
            }
            testFn(mode)
        })
    }
}
