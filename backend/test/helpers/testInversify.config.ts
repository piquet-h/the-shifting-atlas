/**
 * Test-specific Inversify configuration
 *
 * This configuration is ONLY for tests (unit and integration).
 * Production code should use src/inversify.config.ts instead.
 *
 * Key differences from production config:
 * - ALWAYS uses MockTelemetryClient (never real Application Insights)
 * - Supports 'mock' mode with simplified mock repositories
 * - Supports 'memory' mode for integration tests
 * - Supports 'cosmos' mode for E2E tests (but still mocks telemetry)
 */

import { FakeClock } from '@piquet-h/shared'
import { Container } from 'inversify'
import 'reflect-metadata'
import { EXIT_HINT_DEBOUNCE_MS } from '../../src/config/exitHintDebounceConfig.js'
import { WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS } from '../../src/config/worldEventProcessorConfig.js'
import { registerHandlers } from '../../src/di/registerHandlers.js'
import { registerClock, registerCoreServices, registerPromptTemplateRepository } from '../../src/di/registerServices.js'
import { registerWorldEventHandlers } from '../../src/di/registerWorldEventHandlers.js'
import { TOKENS } from '../../src/di/tokens.js'
import { GremlinClient, GremlinClientConfig, IGremlinClient } from '../../src/gremlin/index.js'
import { IPersistenceConfig, loadPersistenceConfigAsync } from '../../src/persistenceConfig.js'
import { CosmosDbSqlClient, CosmosDbSqlClientConfig, ICosmosDbSqlClient } from '../../src/repos/base/cosmosDbSqlClient.js'
import { CosmosDeadLetterRepository } from '../../src/repos/deadLetterRepository.cosmos.js'
import type { IDeadLetterRepository } from '../../src/repos/deadLetterRepository.js'
import { MemoryDeadLetterRepository } from '../../src/repos/deadLetterRepository.memory.js'
import { CosmosDescriptionRepository } from '../../src/repos/descriptionRepository.cosmos.js'
import { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import { InMemoryDescriptionRepository } from '../../src/repos/descriptionRepository.memory.js'
import { CosmosExitHintDebounceRepository } from '../../src/repos/exitHintDebounceRepository.cosmos.js'
import type { IExitHintDebounceRepository } from '../../src/repos/exitHintDebounceRepository.js'
import { MemoryExitHintDebounceRepository } from '../../src/repos/exitHintDebounceRepository.memory.js'
import { CosmosExitRepository, IExitRepository } from '../../src/repos/exitRepository.js'
import { CosmosInventoryRepository } from '../../src/repos/inventoryRepository.cosmos.js'
import { IInventoryRepository } from '../../src/repos/inventoryRepository.js'
import { MemoryInventoryRepository } from '../../src/repos/inventoryRepository.memory.js'
import { CosmosLayerRepository } from '../../src/repos/layerRepository.cosmos.js'
import { ILayerRepository } from '../../src/repos/layerRepository.js'
import { MemoryLayerRepository } from '../../src/repos/layerRepository.memory.js'
import { LocationClockRepositoryCosmos } from '../../src/repos/locationClockRepository.cosmos.js'
import { ILocationClockRepository } from '../../src/repos/locationClockRepository.js'
import { MemoryLocationClockRepository } from '../../src/repos/locationClockRepository.memory.js'
import { CosmosLocationRepository } from '../../src/repos/locationRepository.cosmos.js'
import { ILocationRepository } from '../../src/repos/locationRepository.js'
import { InMemoryLocationRepository } from '../../src/repos/locationRepository.memory.js'
import { ILoreRepository } from '../../src/repos/loreRepository.js'
import { MemoryLoreRepository } from '../../src/repos/loreRepository.memory.js'
import { IPlayerDocRepository, PlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'
import { MemoryPlayerDocRepository } from '../../src/repos/PlayerDocRepository.memory.js'
import { CosmosPlayerRepositorySql } from '../../src/repos/playerRepository.cosmosSql.js'
import { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { InMemoryPlayerRepository } from '../../src/repos/playerRepository.memory.js'
import { CosmosProcessedEventRepository } from '../../src/repos/processedEventRepository.cosmos.js'
import type { IProcessedEventRepository } from '../../src/repos/processedEventRepository.js'
import { MemoryProcessedEventRepository } from '../../src/repos/processedEventRepository.memory.js'
import { CosmosRealmRepository } from '../../src/repos/realmRepository.cosmos.js'
import { IRealmRepository } from '../../src/repos/realmRepository.js'
import { InMemoryRealmRepository } from '../../src/repos/realmRepository.memory.js'
import { TemporalLedgerRepositoryCosmos } from '../../src/repos/temporalLedgerRepository.cosmos.js'
import { ITemporalLedgerRepository } from '../../src/repos/temporalLedgerRepository.js'
import { TemporalLedgerRepositoryMemory } from '../../src/repos/temporalLedgerRepository.memory.js'
import { WorldClockRepositoryCosmos } from '../../src/repos/worldClockRepository.cosmos.js'
import { IWorldClockRepository } from '../../src/repos/worldClockRepository.js'
import { WorldClockRepositoryMemory } from '../../src/repos/worldClockRepository.memory.js'
import { CosmosWorldEventRepository } from '../../src/repos/worldEventRepository.cosmos.js'
import { IWorldEventRepository } from '../../src/repos/worldEventRepository.js'
import { MemoryWorldEventRepository } from '../../src/repos/worldEventRepository.memory.js'
import { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
// Import mocks from test folder
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { MockDescriptionRepository } from '../mocks/repositories/descriptionRepository.mock.js'
import { MockExitRepository } from '../mocks/repositories/exitRepository.mock.js'
import { MockLocationRepository } from '../mocks/repositories/locationRepository.mock.js'
import { MockPlayerRepository } from '../mocks/repositories/playerRepository.mock.js'

export type ContainerMode = 'cosmos' | 'memory' | 'mock'

export const setupTestContainer = async (container: Container, mode?: ContainerMode) => {
    // Determine mode: explicit parameter > persistence config > default to memory
    let resolvedMode: ContainerMode
    if (mode) {
        resolvedMode = mode

        // Safety check: if mode is 'mock', ensure we're not using real Cosmos config
        // This protects unit tests from accidentally using real infrastructure
        if (mode === 'mock' && process.env.PERSISTENCE_MODE === 'cosmos') {
            // For mock mode, create a mock config object instead of loading real config
            const mockConfig: IPersistenceConfig = { mode: 'memory' }
            container.bind<IPersistenceConfig>(TOKENS.PersistenceConfig).toConstantValue(mockConfig)
        } else {
            // Always bind PersistenceConfig even in explicit mode
            const config = await loadPersistenceConfigAsync()
            container.bind<IPersistenceConfig>(TOKENS.PersistenceConfig).toConstantValue(config)
        }
    } else {
        const config = await loadPersistenceConfigAsync()
        container.bind<IPersistenceConfig>(TOKENS.PersistenceConfig).toConstantValue(config)
        resolvedMode = config.mode === 'cosmos' ? 'cosmos' : 'memory'
    }

    // Register ITelemetryClient - ALWAYS use mock in tests (never real Application Insights)
    // This applies to ALL test modes (mock, memory, cosmos) to prevent:
    // - Test telemetry pollution in production App Insights
    // - Hanging tests due to Application Insights background processes
    container.bind<ITelemetryClient>(TOKENS.TelemetryClient).to(MockTelemetryClient).inSingletonScope()

    // Shared registrations (used by both prod and test containers)
    registerCoreServices(container)
    // Handlers should be transient (default scope) to mirror production behavior.
    registerHandlers(container)
    registerWorldEventHandlers(container)

    if (resolvedMode === 'cosmos') {
        // Cosmos mode - E2E tests use *_TEST env vars when NODE_ENV=test
        const isTestEnv = process.env.NODE_ENV === 'test'

        const gremlinConfig: GremlinClientConfig = {
            endpoint:
                (isTestEnv && process.env.GREMLIN_ENDPOINT_TEST) ||
                process.env.COSMOS_GREMLIN_ENDPOINT ||
                process.env.GREMLIN_ENDPOINT ||
                '',
            database:
                (isTestEnv && process.env.GREMLIN_DATABASE_TEST) ||
                process.env.COSMOS_GREMLIN_DATABASE ||
                process.env.GREMLIN_DATABASE ||
                '',
            graph: (isTestEnv && process.env.GREMLIN_GRAPH_TEST) || process.env.COSMOS_GREMLIN_GRAPH || process.env.GREMLIN_GRAPH || ''
        }

        container.bind<GremlinClientConfig>(TOKENS.GremlinConfig).toConstantValue(gremlinConfig)
        container.bind<IGremlinClient>(TOKENS.GremlinClient).to(GremlinClient).inSingletonScope()

        container.bind<IExitRepository>(TOKENS.ExitRepository).to(CosmosExitRepository).inSingletonScope()
        container.bind<ILocationRepository>(TOKENS.LocationRepository).to(CosmosLocationRepository).inSingletonScope()
        container.bind<IRealmRepository>(TOKENS.RealmRepository).to(CosmosRealmRepository).inSingletonScope()
        container.bind<IDescriptionRepository>(TOKENS.DescriptionRepository).to(CosmosDescriptionRepository).inSingletonScope()
        container.bind<IInventoryRepository>(TOKENS.InventoryRepository).to(CosmosInventoryRepository).inSingletonScope()
        container.bind<ILayerRepository>(TOKENS.LayerRepository).to(CosmosLayerRepository).inSingletonScope()
        container.bind<IWorldEventRepository>(TOKENS.WorldEventRepository).to(CosmosWorldEventRepository).inSingletonScope()

        const sqlConfig = container.get<IPersistenceConfig>(TOKENS.PersistenceConfig).cosmosSql
        if (sqlConfig?.endpoint && sqlConfig?.database) {
            // If running tests, use *_TEST env vars if available
            const testEndpoint = isTestEnv && process.env.COSMOS_SQL_ENDPOINT_TEST
            const testDbName = isTestEnv && process.env.COSMOS_SQL_DATABASE_TEST

            const effectiveEndpoint = testEndpoint || sqlConfig.endpoint
            const effectiveDatabase = testDbName || sqlConfig.database

            if (isTestEnv && !testEndpoint) {
                console.warn('[testInversify.config] COSMOS_SQL_ENDPOINT_TEST not set. Using production endpoint!')
            }
            if (isTestEnv && !testDbName) {
                console.warn('[testInversify.config] COSMOS_SQL_DATABASE_TEST not set. Using production database!')
            }

            container.bind<CosmosDbSqlClientConfig>(TOKENS.CosmosDbSqlConfig).toConstantValue({
                endpoint: effectiveEndpoint,
                database: effectiveDatabase
            })
            container.bind<ICosmosDbSqlClient>(TOKENS.CosmosDbSqlClient).to(CosmosDbSqlClient).inSingletonScope()

            // Use SQL-first player repository for Cosmos mode (Gremlin write cutover complete)
            container.bind<IPlayerRepository>(TOKENS.PlayerRepository).to(CosmosPlayerRepositorySql).inSingletonScope()

            // Bind PlayerDocRepository (SQL API player projection)
            container.bind<IPlayerDocRepository>(TOKENS.PlayerDocRepository).to(PlayerDocRepository).inSingletonScope()
        } else {
            // Fallback to memory implementation if SQL config missing
            container.bind<IPlayerDocRepository>(TOKENS.PlayerDocRepository).to(MemoryPlayerDocRepository).inSingletonScope()
        }
        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.deadLetters) {
            container.bind<string>(TOKENS.CosmosContainerDeadLetters).toConstantValue(sqlConfig.containers.deadLetters)
            container.bind<IDeadLetterRepository>(TOKENS.DeadLetterRepository).to(CosmosDeadLetterRepository).inSingletonScope()
        } else {
            container
                .bind<IDeadLetterRepository>(TOKENS.DeadLetterRepository)
                .toDynamicValue(() => new MemoryDeadLetterRepository())
                .inSingletonScope()
        }

        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.processedEvents) {
            container.bind<string>(TOKENS.CosmosContainerProcessedEvents).toConstantValue(sqlConfig.containers.processedEvents)
            container.bind<IProcessedEventRepository>(TOKENS.ProcessedEventRepository).to(CosmosProcessedEventRepository).inSingletonScope()
        } else {
            container
                .bind<IProcessedEventRepository>(TOKENS.ProcessedEventRepository)
                .toDynamicValue(() => new MemoryProcessedEventRepository(WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS))
                .inSingletonScope()
        }

        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.exitHintDebounce) {
            container.bind<string>(TOKENS.CosmosContainerExitHintDebounce).toConstantValue(sqlConfig.containers.exitHintDebounce)
            container.bind<number>(TOKENS.ExitHintDebounceWindowMs).toConstantValue(EXIT_HINT_DEBOUNCE_MS)
            container
                .bind<IExitHintDebounceRepository>(TOKENS.ExitHintDebounceRepository)
                .to(CosmosExitHintDebounceRepository)
                .inSingletonScope()
        } else {
            container
                .bind<IExitHintDebounceRepository>(TOKENS.ExitHintDebounceRepository)
                .toDynamicValue(() => new MemoryExitHintDebounceRepository(EXIT_HINT_DEBOUNCE_MS))
                .inSingletonScope()
        }

        // Temporal Ledger Repository (SQL API)
        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.temporalLedger) {
            container.bind<string>(TOKENS.CosmosContainerTemporalLedger).toConstantValue(sqlConfig.containers.temporalLedger)
            container.bind<ITemporalLedgerRepository>(TOKENS.TemporalLedgerRepository).to(TemporalLedgerRepositoryCosmos).inSingletonScope()
        } else {
            container.bind<ITemporalLedgerRepository>(TOKENS.TemporalLedgerRepository).to(TemporalLedgerRepositoryMemory).inSingletonScope()
        }

        // World Clock Repository (SQL API)
        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.worldClock) {
            container.bind<string>(TOKENS.CosmosContainerWorldClock).toConstantValue(sqlConfig.containers.worldClock)
            container.bind<IWorldClockRepository>(TOKENS.WorldClockRepository).to(WorldClockRepositoryCosmos).inSingletonScope()
        } else {
            container.bind<IWorldClockRepository>(TOKENS.WorldClockRepository).to(WorldClockRepositoryMemory).inSingletonScope()
        }

        // Location Clock Repository (SQL API)
        // Note: Uses same SQL client and database as world clock
        if (sqlConfig?.endpoint && sqlConfig?.database) {
            container.bind<ILocationClockRepository>(TOKENS.LocationClockRepository).to(LocationClockRepositoryCosmos).inSingletonScope()
        } else {
            container.bind<ILocationClockRepository>(TOKENS.LocationClockRepository).to(MemoryLocationClockRepository).inSingletonScope()
        }
    } else if (resolvedMode === 'mock') {
        // Mock mode - unit tests with controllable test doubles
        container.bind<ILocationRepository>(TOKENS.LocationRepository).to(MockLocationRepository).inSingletonScope()
        container.bind<IExitRepository>(TOKENS.ExitRepository).to(MockExitRepository).inSingletonScope()
        // Realm support is required for RealmService (and WorldContextHandler) even in mock mode.
        // Use the in-memory implementation to keep unit tests hermetic.
        container.bind<IRealmRepository>(TOKENS.RealmRepository).to(InMemoryRealmRepository).inSingletonScope()
        container.bind<IPlayerRepository>(TOKENS.PlayerRepository).to(MockPlayerRepository).inSingletonScope()
        container.bind<IDescriptionRepository>(TOKENS.DescriptionRepository).to(MockDescriptionRepository).inSingletonScope()
        container.bind<IInventoryRepository>(TOKENS.InventoryRepository).to(MemoryInventoryRepository).inSingletonScope()
        container.bind<ILayerRepository>(TOKENS.LayerRepository).to(MemoryLayerRepository).inSingletonScope()
        container.bind<IWorldEventRepository>(TOKENS.WorldEventRepository).to(MemoryWorldEventRepository).inSingletonScope()
        container
            .bind<IDeadLetterRepository>(TOKENS.DeadLetterRepository)
            .toDynamicValue(() => new MemoryDeadLetterRepository())
            .inSingletonScope()
        container.bind<IPlayerDocRepository>(TOKENS.PlayerDocRepository).to(MemoryPlayerDocRepository).inSingletonScope()
        container
            .bind<IProcessedEventRepository>(TOKENS.ProcessedEventRepository)
            .toDynamicValue(() => new MemoryProcessedEventRepository(WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS))
            .inSingletonScope()
        container
            .bind<IExitHintDebounceRepository>(TOKENS.ExitHintDebounceRepository)
            .toDynamicValue(() => new MemoryExitHintDebounceRepository(EXIT_HINT_DEBOUNCE_MS))
            .inSingletonScope()
        container.bind<ITemporalLedgerRepository>(TOKENS.TemporalLedgerRepository).to(TemporalLedgerRepositoryMemory).inSingletonScope()
        container.bind<IWorldClockRepository>(TOKENS.WorldClockRepository).to(WorldClockRepositoryMemory).inSingletonScope()
        container.bind<ILocationClockRepository>(TOKENS.LocationClockRepository).to(MemoryLocationClockRepository).inSingletonScope()

        // Lore (MCP)
        container.bind<ILoreRepository>(TOKENS.LoreRepository).to(MemoryLoreRepository).inSingletonScope()
    } else {
        // Memory mode - integration tests and local development
        // InMemoryLocationRepository implements both ILocationRepository and IExitRepository
        // since exits are stored as nested properties of locations in memory
        container.bind<ILocationRepository>(TOKENS.LocationRepository).to(InMemoryLocationRepository).inSingletonScope()
        container.bind<IExitRepository>(TOKENS.ExitRepository).toService(TOKENS.LocationRepository)
        container.bind<IRealmRepository>(TOKENS.RealmRepository).to(InMemoryRealmRepository).inSingletonScope()
        container.bind<IPlayerRepository>(TOKENS.PlayerRepository).to(InMemoryPlayerRepository).inSingletonScope()
        container.bind<IDescriptionRepository>(TOKENS.DescriptionRepository).to(InMemoryDescriptionRepository).inSingletonScope()
        container.bind<IInventoryRepository>(TOKENS.InventoryRepository).to(MemoryInventoryRepository).inSingletonScope()
        container.bind<ILayerRepository>(TOKENS.LayerRepository).to(MemoryLayerRepository).inSingletonScope()
        container.bind<IWorldEventRepository>(TOKENS.WorldEventRepository).to(MemoryWorldEventRepository).inSingletonScope()
        container
            .bind<IDeadLetterRepository>(TOKENS.DeadLetterRepository)
            .toDynamicValue(() => new MemoryDeadLetterRepository())
            .inSingletonScope()
        container.bind<IPlayerDocRepository>(TOKENS.PlayerDocRepository).to(MemoryPlayerDocRepository).inSingletonScope()
        container
            .bind<IProcessedEventRepository>(TOKENS.ProcessedEventRepository)
            .toDynamicValue(() => new MemoryProcessedEventRepository(WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS))
            .inSingletonScope()
        container
            .bind<IExitHintDebounceRepository>(TOKENS.ExitHintDebounceRepository)
            .toDynamicValue(() => new MemoryExitHintDebounceRepository(EXIT_HINT_DEBOUNCE_MS))
            .inSingletonScope()
        container.bind<ITemporalLedgerRepository>(TOKENS.TemporalLedgerRepository).to(TemporalLedgerRepositoryMemory).inSingletonScope()
        container.bind<IWorldClockRepository>(TOKENS.WorldClockRepository).to(WorldClockRepositoryMemory).inSingletonScope()
        container.bind<ILocationClockRepository>(TOKENS.LocationClockRepository).to(MemoryLocationClockRepository).inSingletonScope()

        // Lore (MCP)
        container.bind<ILoreRepository>(TOKENS.LoreRepository).to(MemoryLoreRepository).inSingletonScope()
    }

    // === Clock (Time Abstraction) ===
    // Always use FakeClock in tests for deterministic time control
    registerClock(container, () => new FakeClock())

    // === Prompt Template Repository (file-based, no Cosmos dependency) ===
    registerPromptTemplateRepository(container)

    return container
}
