import { Container } from 'inversify'
import 'reflect-metadata'
import { WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS } from './config/worldEventProcessorConfig.js'
import { GremlinClient, GremlinClientConfig, IGremlinClient } from './gremlin/index.js'
import { BootstrapPlayerHandler } from './handlers/bootstrapPlayer.js'
import { ContainerHealthHandler } from './handlers/containerHealth.js'
import { GetExitsHandler } from './handlers/getExits.js'
import { GremlinHealthHandler } from './handlers/gremlinHealth.js'
import { HealthHandler } from './handlers/health.js'
import { LinkRoomsHandler } from './handlers/linkRooms.js'
import { LocationLookHandler } from './handlers/locationLook.js'
import { MoveHandler } from './handlers/moveCore.js'
import { PingHandler } from './handlers/ping.js'
import { SimplePingHandler } from './handlers/pingSimple.js'
import { PlayerCreateHandler } from './handlers/playerCreate.js'
import { PlayerGetHandler } from './handlers/playerGet.js'
import { PlayerLinkHandler } from './handlers/playerLink.js'
import { PlayerMoveHandler } from './handlers/playerMove.js'
import { QueueProcessWorldEventHandler } from './handlers/queueProcessWorldEvent.js'
import { IPersistenceConfig, loadPersistenceConfigAsync } from './persistenceConfig.js'
import { CosmosDbSqlClient, CosmosDbSqlClientConfig, ICosmosDbSqlClient } from './repos/base/cosmosDbSqlClient.js'
import { CosmosDeadLetterRepository } from './repos/deadLetterRepository.cosmos.js'
import type { IDeadLetterRepository } from './repos/deadLetterRepository.js'
import { MemoryDeadLetterRepository } from './repos/deadLetterRepository.memory.js'
import { CosmosDescriptionRepository } from './repos/descriptionRepository.cosmos.js'
import { IDescriptionRepository } from './repos/descriptionRepository.js'
import { InMemoryDescriptionRepository } from './repos/descriptionRepository.memory.js'
import { CosmosExitRepository, IExitRepository } from './repos/exitRepository.js'
import { CosmosInventoryRepository } from './repos/inventoryRepository.cosmos.js'
import { IInventoryRepository } from './repos/inventoryRepository.js'
import { MemoryInventoryRepository } from './repos/inventoryRepository.memory.js'
import { CosmosLayerRepository } from './repos/layerRepository.cosmos.js'
import { ILayerRepository } from './repos/layerRepository.js'
import { MemoryLayerRepository } from './repos/layerRepository.memory.js'
import { CosmosLocationRepository } from './repos/locationRepository.cosmos.js'
import { ILocationRepository } from './repos/locationRepository.js'
import { InMemoryLocationRepository } from './repos/locationRepository.memory.js'
import { CosmosPlayerRepository } from './repos/playerRepository.cosmos.js'
import { CosmosPlayerRepositorySql } from './repos/playerRepository.cosmosSql.js'
import { IPlayerRepository } from './repos/playerRepository.js'
import { InMemoryPlayerRepository } from './repos/playerRepository.memory.js'
import { CosmosProcessedEventRepository } from './repos/processedEventRepository.cosmos.js'
import type { IProcessedEventRepository } from './repos/processedEventRepository.js'
import { MemoryProcessedEventRepository } from './repos/processedEventRepository.memory.js'
import { CosmosWorldEventRepository } from './repos/worldEventRepository.cosmos.js'
import { IWorldEventRepository } from './repos/worldEventRepository.js'
import { MemoryWorldEventRepository } from './repos/worldEventRepository.memory.js'
import { ITelemetryClient } from './telemetry/ITelemetryClient.js'
import { NullTelemetryClient } from './telemetry/NullTelemetryClient.js'

export type ContainerMode = 'cosmos' | 'memory'

export const setupContainer = async (container: Container, mode?: ContainerMode) => {
    // Determine mode: explicit parameter > persistence config > default to memory
    let resolvedMode: ContainerMode
    if (mode) {
        resolvedMode = mode
    } else {
        const config = await loadPersistenceConfigAsync()
        container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(config)
        resolvedMode = config.mode === 'cosmos' ? 'cosmos' : 'memory'
    }

    // Register ITelemetryClient: use null client in memory mode (local dev), real client in cosmos mode
    if (resolvedMode === 'memory' || process.env.NODE_ENV === 'test') {
        container.bind<ITelemetryClient>('ITelemetryClient').toConstantValue(new NullTelemetryClient())
    } else {
        // Dynamically require to avoid module-level side effects in test mode
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const appInsights = require('applicationinsights')
        container.bind<ITelemetryClient>('ITelemetryClient').toConstantValue(appInsights.defaultClient)
    }

    // Register handlers as transient (no shared mutable state across requests)
    container.bind(MoveHandler).toSelf()
    container.bind(BootstrapPlayerHandler).toSelf()
    container.bind(PlayerLinkHandler).toSelf()
    container.bind(PlayerMoveHandler).toSelf()
    container.bind(PingHandler).toSelf()
    container.bind(HealthHandler).toSelf()
    container.bind(GremlinHealthHandler).toSelf()
    container.bind(SimplePingHandler).toSelf()
    container.bind(LocationLookHandler).toSelf()
    container.bind(GetExitsHandler).toSelf()
    container.bind(LinkRoomsHandler).toSelf()
    container.bind(PlayerCreateHandler).toSelf()
    container.bind(PlayerGetHandler).toSelf()
    container.bind(ContainerHealthHandler).toSelf()
    container.bind(QueueProcessWorldEventHandler).toSelf()

    if (resolvedMode === 'cosmos') {
        // Cosmos mode - prefer already loaded persistence configuration for consistency
        const persistenceConfig = container.get<IPersistenceConfig>('PersistenceConfig')
        const gremlinEndpoint = persistenceConfig.cosmos?.endpoint?.trim() || ''
        const gremlinDatabase = persistenceConfig.cosmos?.database || ''
        const gremlinGraph = persistenceConfig.cosmos?.graph || ''
        if (!gremlinEndpoint || !gremlinDatabase || !gremlinGraph) {
            console.warn(
                'Gremlin configuration incomplete via persistenceConfig (endpoint|database|graph). Verify COSMOS_GREMLIN_* variables. Binding may cause connection errors.'
            )
        }
        container
            .bind<GremlinClientConfig>('GremlinConfig')
            .toConstantValue({ endpoint: gremlinEndpoint, database: gremlinDatabase, graph: gremlinGraph })
        container.bind<IGremlinClient>('GremlinClient').to(GremlinClient).inSingletonScope()

        // Cosmos SQL API client configuration (dual persistence)
        const sqlEndpoint = persistenceConfig.cosmosSql?.endpoint?.trim() || ''
        const sqlDatabase = persistenceConfig.cosmosSql?.database || ''
        if (sqlEndpoint && sqlDatabase) {
            container.bind<CosmosDbSqlClientConfig>('CosmosDbSqlConfig').toConstantValue({ endpoint: sqlEndpoint, database: sqlDatabase })
            container.bind<ICosmosDbSqlClient>('CosmosDbSqlClient').to(CosmosDbSqlClient).inSingletonScope()

            // Bind Gremlin player repository as fallback for migration period
            container.bind<IPlayerRepository>('IPlayerRepository:Gremlin').to(CosmosPlayerRepository).inSingletonScope()

            // Bind SQL player repository as primary
            container.bind<IPlayerRepository>('IPlayerRepository').to(CosmosPlayerRepositorySql).inSingletonScope()
        } else {
            console.warn(
                'Cosmos SQL API configuration incomplete (endpoint|database). Player repository will use Gremlin only. Verify COSMOS_SQL_* variables.'
            )
            // Fall back to Gremlin-only player repository
            container.bind<IPlayerRepository>('IPlayerRepository').to(CosmosPlayerRepository).inSingletonScope()
        }

        container.bind<IExitRepository>('IExitRepository').to(CosmosExitRepository).inSingletonScope()
        container.bind<ILocationRepository>('ILocationRepository').to(CosmosLocationRepository).inSingletonScope()
        container.bind<IDescriptionRepository>('IDescriptionRepository').to(CosmosDescriptionRepository).inSingletonScope()
        container.bind<IInventoryRepository>('IInventoryRepository').to(CosmosInventoryRepository).inSingletonScope()
        container.bind<ILayerRepository>('ILayerRepository').to(CosmosLayerRepository).inSingletonScope()
        container.bind<IWorldEventRepository>('IWorldEventRepository').to(CosmosWorldEventRepository).inSingletonScope()

        const sqlConfig = persistenceConfig.cosmosSql
        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.deadLetters) {
            container.bind<string>('CosmosContainer:DeadLetters').toConstantValue(sqlConfig.containers.deadLetters)
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').to(CosmosDeadLetterRepository).inSingletonScope()
        } else {
            console.warn('[container] Cosmos SQL config missing for dead-letter repository; falling back to memory implementation')
            container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(new MemoryDeadLetterRepository())
        }

        if (sqlConfig?.endpoint && sqlConfig?.database && sqlConfig.containers.processedEvents) {
            container.bind<string>('CosmosContainer:ProcessedEvents').toConstantValue(sqlConfig.containers.processedEvents)
            container.bind<IProcessedEventRepository>('IProcessedEventRepository').to(CosmosProcessedEventRepository).inSingletonScope()
        } else {
            console.warn('[container] Cosmos SQL config missing for processed event repository; using memory implementation')
            container
                .bind<IProcessedEventRepository>('IProcessedEventRepository')
                .toConstantValue(new MemoryProcessedEventRepository(WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS))
        }
    } else {
        // Memory mode - integration tests and local development
        // Explicit bindings; share same instance for exit + location repository via dynamic value
        container.bind<ILocationRepository>('ILocationRepository').to(InMemoryLocationRepository).inSingletonScope()
        container
            .bind<IExitRepository>('IExitRepository')
            .toDynamicValue(() => container.get<ILocationRepository>('ILocationRepository') as unknown as IExitRepository)
            .inSingletonScope()
        container.bind<IPlayerRepository>('IPlayerRepository').to(InMemoryPlayerRepository).inSingletonScope()
        container.bind<IDescriptionRepository>('IDescriptionRepository').to(InMemoryDescriptionRepository).inSingletonScope()
        container.bind<IInventoryRepository>('IInventoryRepository').to(MemoryInventoryRepository).inSingletonScope()
        container.bind<ILayerRepository>('ILayerRepository').to(MemoryLayerRepository).inSingletonScope()
        container.bind<IWorldEventRepository>('IWorldEventRepository').to(MemoryWorldEventRepository).inSingletonScope()
        container.bind<IDeadLetterRepository>('IDeadLetterRepository').toConstantValue(new MemoryDeadLetterRepository())
        container
            .bind<IProcessedEventRepository>('IProcessedEventRepository')
            .toConstantValue(new MemoryProcessedEventRepository(WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS))
    }

    return container
}
