/**
 * Integration test: Verify Cosmos SQL container partition keys match expected schema
 *
 * Goal: Prevent silent runtime regressions from mis-provisioned containers or drifting
 * environment variable/config wiring by failing fast in CI when partition keys don't match.
 *
 * Expected partition key paths (current deployed state per infrastructure/main.bicep):
 * - players: /id
 * - inventory: /playerId
 * - descriptionLayers: /locationId (future migration to /scopeId documented in cosmos-sql-containers.md)
 * - worldEvents: /scopeKey
 *
 * How to run locally:
 * 1. Ensure PERSISTENCE_MODE=cosmos in local.settings.json (or use `npm run use:cosmos`)
 * 2. Ensure all COSMOS_SQL_* environment variables are set correctly
 * 3. Run: npm run test:integration
 *
 * This test runs in both memory and cosmos modes via describeForBothModes(),
 * but partition key validation is skipped in memory mode (no containers to validate).
 */

import assert from 'node:assert'
import { afterEach, beforeEach, test } from 'node:test'
import type { Container } from '@azure/cosmos'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import type { ICosmosDbSqlClient } from '../../src/repos/base/cosmosDbSqlClient.js'
import { describeForBothModes } from '../helpers/describeForBothModes.js'

/**
 * Expected partition key schema for each container (current deployed state)
 * NOTE: descriptionLayers will migrate from /locationId to /scopeId in future
 * (see docs/architecture/cosmos-sql-containers.md migration notes)
 */
const EXPECTED_PARTITION_KEYS: Record<string, string> = {
    players: '/id',
    inventory: '/playerId',
    descriptionLayers: '/locationId',
    worldEvents: '/scopeKey'
}

describeForBothModes('Cosmos SQL container partition keys', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    test('verify all containers have correct partition key paths', async () => {
        // Skip validation in memory mode (no actual containers to validate)
        if (mode === 'memory') {
            console.log('  ℹ️  Skipping partition key validation in memory mode (no Cosmos containers)')
            return
        }

        // Get the Cosmos SQL client from the container
        let sqlClient: ICosmosDbSqlClient
        try {
            const container = await fixture.getContainer()
            sqlClient = container.get<ICosmosDbSqlClient>('CosmosDbSqlClient')
        } catch (error) {
            throw new Error(
                `Failed to get CosmosDbSqlClient from DI container. ` +
                    `Ensure COSMOS_SQL_ENDPOINT and COSMOS_SQL_DATABASE environment variables are set. ` +
                    `Original error: ${error instanceof Error ? error.message : String(error)}`
            )
        }

        // Validate each container's partition key
        const errors: string[] = []

        for (const [containerName, expectedPath] of Object.entries(EXPECTED_PARTITION_KEYS)) {
            try {
                const container: Container = sqlClient.getContainer(containerName)
                const { resource: containerDef } = await container.read()

                if (!containerDef) {
                    errors.push(`Container '${containerName}': Container definition not found`)
                    continue
                }

                const actualPath = containerDef.partitionKey?.paths?.[0]

                if (actualPath !== expectedPath) {
                    errors.push(
                        `Container '${containerName}': Partition key mismatch\n` +
                            `  Expected: ${expectedPath}\n` +
                            `  Actual:   ${actualPath || '(not set)'}\n` +
                            `  Action:   Verify container provisioning in Bicep/ARM templates and environment variables`
                    )
                }
            } catch (error) {
                const cosmosError = error as { code?: number; message?: string }
                if (cosmosError.code === 404) {
                    errors.push(
                        `Container '${containerName}': Not found (404)\n` +
                            `  Check COSMOS_SQL_CONTAINER_${containerName.toUpperCase()} environment variable`
                    )
                } else {
                    errors.push(
                        `Container '${containerName}': Failed to read container metadata\n` +
                            `  Error: ${cosmosError.message || String(error)}`
                    )
                }
            }
        }

        // Report all errors at once for better visibility
        if (errors.length > 0) {
            assert.fail(
                `Partition key validation failed for ${errors.length} container(s):\n\n` +
                    errors.map((e, i) => `${i + 1}. ${e}`).join('\n\n') +
                    `\n\nExpected schema (per docs/architecture/cosmos-sql-containers.md):\n` +
                    Object.entries(EXPECTED_PARTITION_KEYS)
                        .map(([name, path]) => `  - ${name}: ${path}`)
                        .join('\n')
            )
        }

        console.log('  ✓ All container partition keys match expected schema')
    })
})
