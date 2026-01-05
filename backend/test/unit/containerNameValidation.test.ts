import assert from 'node:assert'
import { describe, test } from 'node:test'
import { Container } from 'inversify'
import type { IPersistenceConfig } from '../../src/persistenceConfig.js'

/**
 * Unit test: Verify that inversify container setup validates required container names
 *
 * Purpose: Ensure that setupContainer() fails fast with clear error messages when
 * COSMOS_SQL_CONTAINER_LAYERS or COSMOS_SQL_CONTAINER_EVENTS are missing from config.
 *
 * This prevents silent runtime failures when environment variables are misconfigured.
 */
describe('Container name validation in inversify.config.ts', () => {
    test('throws error when COSMOS_SQL_CONTAINER_LAYERS is missing', async () => {
        // Import setupContainer dynamically to avoid module-level side effects
        const { setupContainer } = await import('../../src/inversify.config.js')

        const container = new Container()

        // Mock persistence config with missing layers container
        const mockConfig: IPersistenceConfig = {
            mode: 'cosmos',
            cosmos: {
                endpoint: 'wss://example.gremlin.cosmos.azure.com:443/',
                database: 'game',
                graph: 'world'
            },
            cosmosSql: {
                endpoint: 'https://example.documents.azure.com:443/',
                database: 'game',
                containers: {
                    players: 'players',
                    inventory: 'inventory',
                    layers: '', // Missing - empty string
                    events: 'worldEvents',
                    deadLetters: 'deadLetters',
                    processedEvents: 'processedEvents',
                    exitHintDebounce: 'exitHintDebounce',
                    temporalLedger: 'temporalLedger',
                    worldClock: 'worldClock',
                    locationClocks: 'locationClocks'
                }
            }
        }

        container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(mockConfig)

        await assert.rejects(
            async () => {
                // Mock loadPersistenceConfigAsync to return our mock config
                const originalEnv = process.env.NODE_ENV
                process.env.NODE_ENV = 'test'
                try {
                    await setupContainer(container)
                } finally {
                    process.env.NODE_ENV = originalEnv
                }
            },
            {
                message: /Description layers container configuration missing.*COSMOS_SQL_CONTAINER_LAYERS/
            },
            'Should throw error when layers container name is missing'
        )
    })

    test('throws error when COSMOS_SQL_CONTAINER_EVENTS is missing', async () => {
        const { setupContainer } = await import('../../src/inversify.config.js')

        const container = new Container()

        // Mock persistence config with missing events container
        const mockConfig: IPersistenceConfig = {
            mode: 'cosmos',
            cosmos: {
                endpoint: 'wss://example.gremlin.cosmos.azure.com:443/',
                database: 'game',
                graph: 'world'
            },
            cosmosSql: {
                endpoint: 'https://example.documents.azure.com:443/',
                database: 'game',
                containers: {
                    players: 'players',
                    inventory: 'inventory',
                    layers: 'descriptionLayers',
                    events: '', // Missing - empty string
                    deadLetters: 'deadLetters',
                    processedEvents: 'processedEvents',
                    exitHintDebounce: 'exitHintDebounce',
                    temporalLedger: 'temporalLedger',
                    worldClock: 'worldClock',
                    locationClocks: 'locationClocks'
                }
            }
        }

        container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(mockConfig)

        await assert.rejects(
            async () => {
                const originalEnv = process.env.NODE_ENV
                process.env.NODE_ENV = 'test'
                try {
                    await setupContainer(container)
                } finally {
                    process.env.NODE_ENV = originalEnv
                }
            },
            {
                message: /World events container configuration missing.*COSMOS_SQL_CONTAINER_EVENTS/
            },
            'Should throw error when events container name is missing'
        )
    })

    test('succeeds when both container names are provided', async () => {
        const { setupContainer } = await import('../../src/inversify.config.js')

        const container = new Container()

        // Mock persistence config with complete container names
        const mockConfig: IPersistenceConfig = {
            mode: 'cosmos',
            cosmos: {
                endpoint: 'wss://example.gremlin.cosmos.azure.com:443/',
                database: 'game',
                graph: 'world'
            },
            cosmosSql: {
                endpoint: 'https://example.documents.azure.com:443/',
                database: 'game',
                containers: {
                    players: 'players',
                    inventory: 'inventory',
                    layers: 'descriptionLayers',
                    events: 'worldEvents',
                    deadLetters: 'deadLetters',
                    processedEvents: 'processedEvents',
                    exitHintDebounce: 'exitHintDebounce',
                    temporalLedger: 'temporalLedger',
                    worldClock: 'worldClock',
                    locationClocks: 'locationClocks'
                }
            }
        }

        container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(mockConfig)

        const originalEnv = process.env.NODE_ENV
        process.env.NODE_ENV = 'test'
        try {
            // Should not throw
            const result = await setupContainer(container)
            assert.ok(result, 'Container should be set up successfully')

            // Verify that the container names were bound correctly
            const layersContainerName = container.get<string>('CosmosContainer:Layers')
            assert.strictEqual(layersContainerName, 'descriptionLayers', 'Layers container name should be bound')

            const eventsContainerName = container.get<string>('CosmosContainer:Events')
            assert.strictEqual(eventsContainerName, 'worldEvents', 'Events container name should be bound')
        } finally {
            process.env.NODE_ENV = originalEnv
        }
    })
})
