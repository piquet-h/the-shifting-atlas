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

import { Container } from 'inversify'
import 'reflect-metadata'
import { EXIT_HINT_DEBOUNCE_MS } from '../../src/config/exitHintDebounceConfig.js'
import { WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS } from '../../src/config/worldEventProcessorConfig.js'
import { GremlinClient, GremlinClientConfig, IGremlinClient } from '../../src/gremlin/index.js'
import { BootstrapPlayerHandler } from '../../src/handlers/bootstrapPlayer.js'
import { ContainerHealthHandler } from '../../src/handlers/containerHealth.js'
import { GetExitsHandler } from '../../src/handlers/getExits.js'
import { GremlinHealthHandler } from '../../src/handlers/gremlinHealth.js'
import { HealthHandler } from '../../src/handlers/health.js'
import { LinkRoomsHandler } from '../../src/handlers/linkRooms.js'
import { LocationLookHandler } from '../../src/handlers/locationLook.js'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import { PingHandler } from '../../src/handlers/ping.js'
import { SimplePingHandler } from '../../src/handlers/pingSimple.js'
import { PlayerCreateHandler } from '../../src/handlers/playerCreate.js'
import { PlayerGetHandler } from '../../src/handlers/playerGet.js'
import { PlayerLinkHandler } from '../../src/handlers/playerLink.js'
import { PlayerMoveHandler } from '../../src/handlers/playerMove.js'
import { QueueProcessExitGenerationHintHandler } from '../../src/handlers/queueProcessExitGenerationHint.js'
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
import { CosmosLocationRepository } from '../../src/repos/locationRepository.cosmos.js'
import { ILocationRepository } from '../../src/repos/locationRepository.js'
import { InMemoryLocationRepository } from '../../src/repos/locationRepository.memory.js'
import { IPlayerDocRepository, PlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'
import { MemoryPlayerDocRepository } from '../../src/repos/PlayerDocRepository.memory.js'
import { CosmosPlayerRepository } from '../../src/repos/playerRepository.cosmos.js'
import { CosmosPlayerRepositorySql } from '../../src/repos/playerRepository.cosmosSql.js'
import { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { InMemoryPlayerRepository } from '../../src/repos/playerRepository.memory.js'
import { CosmosProcessedEventRepository } from '../../src/repos/processedEventRepository.cosmos.js'
import type { IProcessedEventRepository } from '../../src/repos/processedEventRepository.js'
import { MemoryProcessedEventRepository } from '../../src/repos/processedEventRepository.memory.js'
import { CosmosWorldEventRepository } from '../../src/repos/worldEventRepository.cosmos.js'
import { IWorldEventRepository } from '../../src/repos/worldEventRepository.js'
import { MemoryWorldEventRepository } from '../../src/repos/worldEventRepository.memory.js'
import { LocationClockRepositoryCosmos } from '../../src/repos/locationClockRepository.cosmos.js'
import { MemoryLocationClockRepository } from '../../src/repos/locationClockRepository.memory.js'
import { ILocationClockRepository } from '../../src/repos/locationClockRepository.js'
import { TemporalLedgerRepositoryCosmos } from '../../src/repos/temporalLedgerRepository.cosmos.js'
import { ITemporalLedgerRepository } from '../../src/repos/temporalLedgerRepository.js'
import { TemporalLedgerRepositoryMemory } from '../../src/repos/temporalLedgerRepository.memory.js'
import { WorldClockRepositoryCosmos } from '../../src/repos/worldClockRepository.cosmos.js'
import { IWorldClockRepository } from '../../src/repos/worldClockRepository.js'
import { WorldClockRepositoryMemory } from '../../src/repos/worldClockRepository.memory.js'
import { DescriptionComposer } from '../../src/services/descriptionComposer.js'
import { LocationClockManager } from '../../src/services/LocationClockManager.js'
import { PlayerClockService } from '../../src/services/PlayerClockService.js'
import { WorldClockService } from '../../src/services/WorldClockService.js'
import { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { EnvironmentChangeHandler } from '../../src/worldEvents/handlers/EnvironmentChangeHandler.js'
import { ExitCreateHandler } from '../../src/worldEvents/handlers/ExitCreateHandler.js'
import { NPCTickHandler } from '../../src/worldEvents/handlers/NPCTickHandler.js'
import { QueueProcessWorldEventHandler } from '../../src/worldEvents/queueProcessWorldEvent.js'
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
            container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(mockConfig)
        } else {
            // Always bind PersistenceConfig even in explicit mode
            const config = await loadPersistenceConfigAsync()
            container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(config)
        }
    } else {
        const config = await loadPersistenceConfigAsync()
        container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(config)
        resolvedMode = config.mode === 'cosmos' ? 'cosmos' : 'memory'
    }

    // Register ITelemetryClient - ALWAYS use mock in tests (never real Application Insights)
    // This applies to ALL test modes (mock, memory, cosmos) to prevent:
    // - Test telemetry pollution in production App Insights
    // - Hanging tests due to Application Insights background processes
    container.bind<ITelemetryClient>('ITelemetryClient').to(MockTelemetryClient).inSingletonScope()

    // Register TelemetryService (wraps ITelemetryClient with enrichment logic)
    // Class-based injection only per consistency policy (no string token binding required).
    container.bind<TelemetryService>(TelemetryService).toSelf().inSingletonScope()

    // Register handlers - these extend BaseHandler which has @injectable and constructor injection
    container.bind(MoveHandler).toSelf().inSingletonScope()
    container.bind(BootstrapPlayerHandler).toSelf().inSingletonScope()
    container.bind(PlayerLinkHandler).toSelf().inSingletonScope()
    container.bind(PlayerMoveHandler).toSelf().inSingletonScope()
    container.bind(PingHandler).toSelf().inSingletonScope()
    container.bind(HealthHandler).toSelf().inSingletonScope()
    container.bind(GremlinHealthHandler).toSelf().inSingletonScope()
    container.bind(SimplePingHandler).toSelf().inSingletonScope()
    container.bind(LocationLookHandler).toSelf().inSingletonScope()
    container.bind(GetExitsHandler).toSelf().inSingletonScope()
    container.bind(LinkRoomsHandler).toSelf().inSingletonScope()
    container.bind(PlayerCreateHandler).toSelf().inSingletonScope()
    container.bind(PlayerGetHandler).toSelf().inSingletonScope()
    container.bind(ContainerHealthHandler).toSelf().inSingletonScope()
    container.bind(QueueProcessWorldEventHandler).toSelf().inSingletonScope()
    container.bind(QueueProcessExitGenerationHintHandler).toSelf().inSingletonScope()
    container.bind(ExitCreateHandler).toSelf().inSingletonScope()
    container.bind(NPCTickHandler).toSelf().inSingletonScope()
    container.bind(EnvironmentChangeHandler).toSelf().inSingletonScope()

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

        container.bind<GremlinClientConfig>('GremlinConfig').toConstantValue(gremlinConfig)
        container.bind<IGremlinClient>('GremlinClient').to(GremlinClient).inSingletonScope()

        container.bind<IExitRepository>('IExitRepository').to(CosmosExitRepository).inSingletonScope()
        container.bind<ILocationRepository>('ILocationRepository').to(CosmosLocationRepository).inSingletonScope()
        container.bind<IDescriptionRepository>('IDescriptionRepository').to(CosmosDescriptionRepository).inSingletonScope()
        container.bind<IInventoryRepository>('IInventoryRepository').to(CosmosInventoryRepository).inSingletonScope()
        container.bind<ILayerRepository>('ILayerRepository').to(CosmosLayerRepository).inSingletonScope()
        container.bind<IWorldEventRepository>('IWorldEventRepository').to(CosmosWorldEventRepository).inSingletonScope()

        const sqlConfig = container.get<IPersistenceConfig>('PersistenceConfig').cosmosSql
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

            container.bind<CosmosDbSqlClientConfig>('CosmosDbSqlConfig').toConstantValue({
                endpoint: effectiveEndpoint,
                database: effectiveDatabase
            })
            container.bind<ICosmosDbSqlClient>('CosmosDbSqlClient').to(CosmosDbSqlClient).inSingletonScope()

            // Use SQL-first player repository for Cosmos mode (Gremlin write cutover complete)
            container.bind('IPlayerRepository:GremlinReadOnly').to(CosmosPlayerRepository).inSingletonScope()
            container.bind<IPlayerRepository>('IPlayerRepository').to(CosmosPlayerRepositorySql).inSingletonScope()

            // Bind PlayerDocRepository (SQL API player projection)
            container.bind<IPlayerDocRepository>('IPlayerDocRepository').to(PlayerDocRepository).inSingletonScope()
        } else {
            // Fallback to memory implementation if SQL config missing
            container.bind<IPlayerDocRepository>('IPlayerDocRepository').to(MemoryPlayerDocRepository).inSingletonScope()
        }
        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.deadLetters) {
            container.bind<string>('CosmosContainer:DeadLetters').toConstantValue(sqlConfig.containers.deadLetters)
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').to(CosmosDeadLetterRepository).inSingletonScope()
        } else {
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(new MemoryDeadLetterRepository())
        }

        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.processedEvents) {
            container.bind<string>('CosmosContainer:ProcessedEvents').toConstantValue(sqlConfig.containers.processedEvents)
            container.bind<IProcessedEventRepository>('IProcessedEventRepository').to(CosmosProcessedEventRepository).inSingletonScope()
        } else {
            container
                .bind<IProcessedEventRepository>('IProcessedEventRepository')
                .toConstantValue(new MemoryProcessedEventRepository(WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS))
        }

        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.exitHintDebounce) {
            container.bind<string>('CosmosContainer:ExitHintDebounce').toConstantValue(sqlConfig.containers.exitHintDebounce)
            container.bind<number>('ExitHintDebounceWindowMs').toConstantValue(EXIT_HINT_DEBOUNCE_MS)
            container
                .bind<IExitHintDebounceRepository>('IExitHintDebounceRepository')
                .to(CosmosExitHintDebounceRepository)
                .inSingletonScope()
        } else {
            container
                .bind<IExitHintDebounceRepository>('IExitHintDebounceRepository')
                .toConstantValue(new MemoryExitHintDebounceRepository(EXIT_HINT_DEBOUNCE_MS))
        }

        // Temporal Ledger Repository (SQL API)
        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.temporalLedger) {
            container.bind<string>('CosmosContainer:TemporalLedger').toConstantValue(sqlConfig.containers.temporalLedger)
            container.bind<ITemporalLedgerRepository>('ITemporalLedgerRepository').to(TemporalLedgerRepositoryCosmos).inSingletonScope()
        } else {
            container.bind<ITemporalLedgerRepository>('ITemporalLedgerRepository').to(TemporalLedgerRepositoryMemory).inSingletonScope()
        }

        // World Clock Repository (SQL API)
        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.worldClock) {
            container.bind<string>('CosmosContainer:WorldClock').toConstantValue(sqlConfig.containers.worldClock)
            container.bind<IWorldClockRepository>('IWorldClockRepository').to(WorldClockRepositoryCosmos).inSingletonScope()
        } else {
            container.bind<IWorldClockRepository>('IWorldClockRepository').to(WorldClockRepositoryMemory).inSingletonScope()
        }

        // Location Clock Repository (SQL API)
        // Note: Uses same SQL client and database as world clock
        if (sqlConfig?.endpoint && sqlConfig?.database) {
            container.bind<ILocationClockRepository>('ILocationClockRepository').to(LocationClockRepositoryCosmos).inSingletonScope()
        } else {
            container.bind<ILocationClockRepository>('ILocationClockRepository').to(MemoryLocationClockRepository).inSingletonScope()
        }
    } else if (resolvedMode === 'mock') {
        // Mock mode - unit tests with controllable test doubles
        container.bind<ILocationRepository>('ILocationRepository').to(MockLocationRepository).inSingletonScope()
        container.bind<IExitRepository>('IExitRepository').to(MockExitRepository).inSingletonScope()
        container.bind<IPlayerRepository>('IPlayerRepository').to(MockPlayerRepository).inSingletonScope()
        container.bind<IDescriptionRepository>('IDescriptionRepository').to(MockDescriptionRepository).inSingletonScope()
        container.bind<IInventoryRepository>('IInventoryRepository').to(MemoryInventoryRepository).inSingletonScope()
        container.bind<ILayerRepository>('ILayerRepository').to(MemoryLayerRepository).inSingletonScope()
        container.bind<IWorldEventRepository>('IWorldEventRepository').to(MemoryWorldEventRepository).inSingletonScope()
        container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(new MemoryDeadLetterRepository())
        container.bind<IPlayerDocRepository>('IPlayerDocRepository').to(MemoryPlayerDocRepository).inSingletonScope()
        container
            .bind<IProcessedEventRepository>('IProcessedEventRepository')
            .toConstantValue(new MemoryProcessedEventRepository(WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS))
        container
            .bind<IExitHintDebounceRepository>('IExitHintDebounceRepository')
            .toConstantValue(new MemoryExitHintDebounceRepository(EXIT_HINT_DEBOUNCE_MS))
        container.bind<ITemporalLedgerRepository>('ITemporalLedgerRepository').to(TemporalLedgerRepositoryMemory).inSingletonScope()
        container.bind<IWorldClockRepository>('IWorldClockRepository').to(WorldClockRepositoryMemory).inSingletonScope()
        container.bind<ILocationClockRepository>('ILocationClockRepository').to(MemoryLocationClockRepository).inSingletonScope()
    } else {
        // Memory mode - integration tests and local development
        // InMemoryLocationRepository implements both ILocationRepository and IExitRepository
        // since exits are stored as nested properties of locations in memory
        container.bind<ILocationRepository>('ILocationRepository').to(InMemoryLocationRepository).inSingletonScope()
        container.bind<IExitRepository>('IExitRepository').toService('ILocationRepository')
        container.bind<IPlayerRepository>('IPlayerRepository').to(InMemoryPlayerRepository).inSingletonScope()
        container.bind<IDescriptionRepository>('IDescriptionRepository').to(InMemoryDescriptionRepository).inSingletonScope()
        container.bind<IInventoryRepository>('IInventoryRepository').to(MemoryInventoryRepository).inSingletonScope()
        container.bind<ILayerRepository>('ILayerRepository').to(MemoryLayerRepository).inSingletonScope()
        container.bind<IWorldEventRepository>('IWorldEventRepository').to(MemoryWorldEventRepository).inSingletonScope()
        container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(new MemoryDeadLetterRepository())
        container.bind<IPlayerDocRepository>('IPlayerDocRepository').to(MemoryPlayerDocRepository).inSingletonScope()
        container
            .bind<IProcessedEventRepository>('IProcessedEventRepository')
            .toConstantValue(new MemoryProcessedEventRepository(WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS))
        container
            .bind<IExitHintDebounceRepository>('IExitHintDebounceRepository')
            .toConstantValue(new MemoryExitHintDebounceRepository(EXIT_HINT_DEBOUNCE_MS))
        container.bind<ITemporalLedgerRepository>('ITemporalLedgerRepository').to(TemporalLedgerRepositoryMemory).inSingletonScope()
        container.bind<IWorldClockRepository>('IWorldClockRepository').to(WorldClockRepositoryMemory).inSingletonScope()
        container.bind<ILocationClockRepository>('ILocationClockRepository').to(MemoryLocationClockRepository).inSingletonScope()
    }

    // Register services (available in all modes)
    container.bind(DescriptionComposer).toSelf().inSingletonScope()
    container.bind(WorldClockService).toSelf().inSingletonScope()
    container.bind(PlayerClockService).toSelf().inSingletonScope()
    container.bind(LocationClockManager).toSelf().inSingletonScope()

    return container
}
