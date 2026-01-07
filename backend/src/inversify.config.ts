/**
 * Production Inversify Container Configuration
 *
 * This configuration is ONLY for production deployments.
 * It requires full Cosmos DB configuration and fails fast if incomplete.
 *
 * Tests should use test/helpers/testInversify.config.ts instead.
 *
 * Requirements:
 * - COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH must be set
 * - COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE must be set
 * - All Cosmos containers must be configured
 *
 * NO memory mode fallbacks - production deploys with full infrastructure or fails.
 */
import { PromptTemplateRepository, SystemClock, type IClock, type IPromptTemplateRepository } from '@piquet-h/shared'
import { Container } from 'inversify'
import 'reflect-metadata'
import { EXIT_HINT_DEBOUNCE_MS } from './config/exitHintDebounceConfig.js'
import { getPromptTemplateCacheConfig } from './config/promptTemplateCacheConfig.js'
import { GremlinClient, GremlinClientConfig, IGremlinClient } from './gremlin/index.js'
import { BootstrapPlayerHandler } from './handlers/bootstrapPlayer.js'
import { ContainerHealthHandler } from './handlers/containerHealth.js'
import { GetExitsHandler } from './handlers/getExits.js'
import { GetPromptTemplateHandler } from './handlers/getPromptTemplate.js'
import { GremlinHealthHandler } from './handlers/gremlinHealth.js'
import { HealthHandler } from './handlers/health.js'
import { LinkRoomsHandler } from './handlers/linkRooms.js'
import { LocationLookHandler } from './handlers/locationLook.js'
import { WorldHandler } from './handlers/mcp/world/world.js'
import { MoveHandler } from './handlers/moveCore.js'
import { PingHandler } from './handlers/ping.js'
import { SimplePingHandler } from './handlers/pingSimple.js'
import { PlayerCreateHandler } from './handlers/playerCreate.js'
import { PlayerGetHandler } from './handlers/playerGet.js'
import { PlayerLinkHandler } from './handlers/playerLink.js'
import { PlayerMoveHandler } from './handlers/playerMove.js'
import { QueueProcessExitGenerationHintHandler } from './handlers/queueProcessExitGenerationHint.js'
import { QueueSyncLocationAnchorsHandler } from './handlers/queueSyncLocationAnchors.js'
import { IPersistenceConfig, loadPersistenceConfigAsync } from './persistenceConfig.js'
import { CosmosDbSqlClient, CosmosDbSqlClientConfig, ICosmosDbSqlClient } from './repos/base/cosmosDbSqlClient.js'
import { CosmosDeadLetterRepository } from './repos/deadLetterRepository.cosmos.js'
import type { IDeadLetterRepository } from './repos/deadLetterRepository.js'
import { CosmosDescriptionRepository } from './repos/descriptionRepository.cosmos.js'
import { IDescriptionRepository } from './repos/descriptionRepository.js'
import { CosmosExitHintDebounceRepository } from './repos/exitHintDebounceRepository.cosmos.js'
import type { IExitHintDebounceRepository } from './repos/exitHintDebounceRepository.js'
import { CosmosExitRepository, IExitRepository } from './repos/exitRepository.js'
import { CosmosInventoryRepository } from './repos/inventoryRepository.cosmos.js'
import { IInventoryRepository } from './repos/inventoryRepository.js'
import { CosmosLayerRepository } from './repos/layerRepository.cosmos.js'
import { ILayerRepository } from './repos/layerRepository.js'
import { LocationClockRepositoryCosmos } from './repos/locationClockRepository.cosmos.js'
import type { ILocationClockRepository } from './repos/locationClockRepository.js'
import { CosmosLocationRepository } from './repos/locationRepository.cosmos.js'
import { ILocationRepository } from './repos/locationRepository.js'
import { IPlayerDocRepository, PlayerDocRepository } from './repos/PlayerDocRepository.js'
import { CosmosPlayerRepositorySql } from './repos/playerRepository.cosmosSql.js'
import { IPlayerRepository } from './repos/playerRepository.js'
import { CosmosProcessedEventRepository } from './repos/processedEventRepository.cosmos.js'
import type { IProcessedEventRepository } from './repos/processedEventRepository.js'
import { CosmosRealmRepository } from './repos/realmRepository.cosmos.js'
import type { IRealmRepository } from './repos/realmRepository.js'
import { TemporalLedgerRepositoryCosmos } from './repos/temporalLedgerRepository.cosmos.js'
import type { ITemporalLedgerRepository } from './repos/temporalLedgerRepository.js'
import { WorldClockRepositoryCosmos } from './repos/worldClockRepository.cosmos.js'
import type { IWorldClockRepository } from './repos/worldClockRepository.js'
import { CosmosWorldEventRepository } from './repos/worldEventRepository.cosmos.js'
import { IWorldEventRepository } from './repos/worldEventRepository.js'
import { DescriptionComposer } from './services/descriptionComposer.js'
import { LocationClockManager } from './services/LocationClockManager.js'
import { PlayerClockService } from './services/PlayerClockService.js'
import { RealmService } from './services/RealmService.js'
import { ReconcileEngine } from './services/ReconcileEngine.js'
import type { ILocationClockManager, IWorldClockService } from './services/types.js'
import { WorldClockService } from './services/WorldClockService.js'
import { ITelemetryClient } from './telemetry/ITelemetryClient.js'
import { NullTelemetryClient } from './telemetry/NullTelemetryClient.js'
import { TelemetryService } from './telemetry/TelemetryService.js'
import { EnvironmentChangeHandler } from './worldEvents/handlers/EnvironmentChangeHandler.js'
import { ExitCreateHandler } from './worldEvents/handlers/ExitCreateHandler.js'
import { NPCTickHandler } from './worldEvents/handlers/NPCTickHandler.js'
import { QueueProcessWorldEventHandler } from './worldEvents/queueProcessWorldEvent.js'

/**
 * Setup production container - requires full Cosmos DB configuration
 *
 * Fails fast if:
 * - Not running with Cosmos DB configuration
 * - Cosmos Gremlin or SQL API config incomplete
 * - Required containers not configured
 *
 * In test mode (NODE_ENV=test), uses NullTelemetryClient to prevent hanging.
 * For local development without Cosmos, use test config with memory mode instead.
 */
export const setupContainer = async (container: Container) => {
    // Load persistence configuration
    const config = await loadPersistenceConfigAsync()
    container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(config)

    // Production requirement: must be in cosmos mode
    if (config.mode !== 'cosmos') {
        throw new Error(
            'Production inversify.config.ts requires Cosmos DB configuration. ' +
                'Set PERSISTENCE_MODE=cosmos and provide COSMOS_GREMLIN_* and COSMOS_SQL_* variables. ' +
                'For local development, use test/helpers/testInversify.config.ts with memory mode.'
        )
    }

    const isTestMode = process.env.NODE_ENV === 'test'

    // Register ITelemetryClient based on environment
    // CRITICAL: Never load real Application Insights in test mode (causes hanging)
    if (isTestMode) {
        // Test mode: always use null client to prevent hanging
        container.bind<ITelemetryClient>('ITelemetryClient').to(NullTelemetryClient).inSingletonScope()
    } else if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
        // Production with App Insights: real Application Insights (already initialized in index.ts)
        const appInsightsModule = await import('applicationinsights')
        const appInsights = appInsightsModule.default
        container.bind<ITelemetryClient>('ITelemetryClient').toConstantValue(appInsights.defaultClient)
    } else {
        // Production without App Insights: null telemetry client
        container.bind<ITelemetryClient>('ITelemetryClient').to(NullTelemetryClient).inSingletonScope()
    }

    // Register TelemetryService (wraps ITelemetryClient with enrichment logic)
    // Consistency policy: concrete services use class-based injection only (no string token).
    container.bind<TelemetryService>(TelemetryService).toSelf().inSingletonScope()

    // Register handlers as transient (no shared mutable state across requests)
    container.bind(MoveHandler).toSelf()
    container.bind(BootstrapPlayerHandler).toSelf()
    // WorldHandler provides MCP tooling handlers (getLocation, listExits)
    // Bind it so the MCP wrapper functions can resolve the handler from the container.
    container.bind(WorldHandler).toSelf()
    container.bind(PlayerLinkHandler).toSelf()
    container.bind(PlayerMoveHandler).toSelf()
    container.bind(PingHandler).toSelf()
    container.bind(HealthHandler).toSelf()
    container.bind(GremlinHealthHandler).toSelf()
    container.bind(SimplePingHandler).toSelf()
    container.bind(LocationLookHandler).toSelf()
    container.bind(GetExitsHandler).toSelf()
    container.bind(GetPromptTemplateHandler).toSelf()
    container.bind(LinkRoomsHandler).toSelf()
    container.bind(PlayerCreateHandler).toSelf()
    container.bind(PlayerGetHandler).toSelf()
    container.bind(ContainerHealthHandler).toSelf()
    container.bind(QueueProcessWorldEventHandler).toSelf()
    container.bind(QueueProcessExitGenerationHintHandler).toSelf()
    container.bind(QueueSyncLocationAnchorsHandler).toSelf()
    container.bind(ExitCreateHandler).toSelf()
    container.bind(NPCTickHandler).toSelf()
    container.bind(EnvironmentChangeHandler).toSelf()

    // === Cosmos Gremlin API Configuration ===
    const gremlinEndpoint = config.cosmos?.endpoint?.trim() || ''
    const gremlinDatabase = config.cosmos?.database || ''
    const gremlinGraph = config.cosmos?.graph || ''

    if (!gremlinEndpoint || !gremlinDatabase || !gremlinGraph) {
        throw new Error(
            'Gremlin configuration incomplete. Required: COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH'
        )
    }

    container
        .bind<GremlinClientConfig>('GremlinConfig')
        .toConstantValue({ endpoint: gremlinEndpoint, database: gremlinDatabase, graph: gremlinGraph })
    container.bind<IGremlinClient>('GremlinClient').to(GremlinClient).inSingletonScope()

    // === Cosmos SQL API Configuration ===
    const sqlEndpoint = config.cosmosSql?.endpoint?.trim() || ''
    const sqlDatabase = config.cosmosSql?.database || ''

    if (!sqlEndpoint || !sqlDatabase) {
        throw new Error('Cosmos SQL API configuration incomplete. Required: COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE')
    }

    container.bind<CosmosDbSqlClientConfig>('CosmosDbSqlConfig').toConstantValue({ endpoint: sqlEndpoint, database: sqlDatabase })
    container.bind<ICosmosDbSqlClient>('CosmosDbSqlClient').to(CosmosDbSqlClient).inSingletonScope()

    // Bind PlayerDocRepository (SQL API player projection)
    container.bind<IPlayerDocRepository>('IPlayerDocRepository').to(PlayerDocRepository).inSingletonScope()

    // Bind SQL player repository as primary (Gremlin player vertex deprecated per ADR-004)
    container.bind<IPlayerRepository>('IPlayerRepository').to(CosmosPlayerRepositorySql).inSingletonScope()

    // === Cosmos Repositories ===
    container.bind<IExitRepository>('IExitRepository').to(CosmosExitRepository).inSingletonScope()
    container.bind<ILocationRepository>('ILocationRepository').to(CosmosLocationRepository).inSingletonScope()
    container.bind<IRealmRepository>('IRealmRepository').to(CosmosRealmRepository).inSingletonScope()
    container.bind<IDescriptionRepository>('IDescriptionRepository').to(CosmosDescriptionRepository).inSingletonScope()
    container.bind<IInventoryRepository>('IInventoryRepository').to(CosmosInventoryRepository).inSingletonScope()

    // === Cosmos SQL Containers (Layers & Events) ===
    // These containers are required in production (no defaults) - validation happens in persistenceConfig
    const layersContainer = config.cosmosSql?.containers.layers
    const eventsContainer = config.cosmosSql?.containers.events

    if (!layersContainer) {
        throw new Error('Description layers container configuration missing. Required: COSMOS_SQL_CONTAINER_LAYERS')
    }
    if (!eventsContainer) {
        throw new Error('World events container configuration missing. Required: COSMOS_SQL_CONTAINER_EVENTS')
    }

    container.bind<string>('CosmosContainer:Layers').toConstantValue(layersContainer)
    container.bind<ILayerRepository>('ILayerRepository').to(CosmosLayerRepository).inSingletonScope()

    container.bind<string>('CosmosContainer:Events').toConstantValue(eventsContainer)
    container.bind<IWorldEventRepository>('IWorldEventRepository').to(CosmosWorldEventRepository).inSingletonScope()

    // === Cosmos SQL Containers (Dead Letter & Processed Events) ===
    if (!config.cosmosSql?.containers.deadLetters) {
        throw new Error('Dead letter container configuration missing. Required: COSMOS_SQL_CONTAINER_DEADLETTERS')
    }
    container.bind<string>('CosmosContainer:DeadLetters').toConstantValue(config.cosmosSql.containers.deadLetters)
    container.bind<IDeadLetterRepository>('IDeadLetterRepository').to(CosmosDeadLetterRepository).inSingletonScope()

    if (!config.cosmosSql?.containers.processedEvents) {
        throw new Error('Processed events container configuration missing. Required: COSMOS_SQL_CONTAINER_PROCESSED_EVENTS')
    }
    container.bind<string>('CosmosContainer:ProcessedEvents').toConstantValue(config.cosmosSql.containers.processedEvents)
    container.bind<IProcessedEventRepository>('IProcessedEventRepository').to(CosmosProcessedEventRepository).inSingletonScope()

    // === Exit Hint Debounce Container ===
    if (!config.cosmosSql?.containers.exitHintDebounce) {
        throw new Error('Exit hint debounce container configuration missing. Required: COSMOS_SQL_CONTAINER_EXIT_HINT_DEBOUNCE')
    }
    container.bind<string>('CosmosContainer:ExitHintDebounce').toConstantValue(config.cosmosSql.containers.exitHintDebounce)
    container.bind<number>('ExitHintDebounceWindowMs').toConstantValue(EXIT_HINT_DEBOUNCE_MS)
    container.bind<IExitHintDebounceRepository>('IExitHintDebounceRepository').to(CosmosExitHintDebounceRepository).inSingletonScope()

    // === Temporal Ledger Container ===
    if (!config.cosmosSql?.containers.temporalLedger) {
        throw new Error('Temporal ledger container configuration missing. Required: COSMOS_SQL_CONTAINER_TEMPORAL_LEDGER')
    }
    container.bind<string>('CosmosContainer:TemporalLedger').toConstantValue(config.cosmosSql.containers.temporalLedger)
    container.bind<ITemporalLedgerRepository>('ITemporalLedgerRepository').to(TemporalLedgerRepositoryCosmos).inSingletonScope()

    container.bind<string>('CosmosContainer:WorldClock').toConstantValue(config.cosmosSql.containers.worldClock)
    container.bind<IWorldClockRepository>('IWorldClockRepository').to(WorldClockRepositoryCosmos).inSingletonScope()

    // === Location Clock Container ===
    // Note: Container name is read directly in LocationClockRepositoryCosmos constructor from env var
    container.bind<ILocationClockRepository>('ILocationClockRepository').to(LocationClockRepositoryCosmos).inSingletonScope()

    // === Clock (Time Abstraction) ===
    container.bind<IClock>('IClock').toConstantValue(new SystemClock())

    // === Prompt Template Repository (file-based, no Cosmos dependency) ===
    const promptCache = getPromptTemplateCacheConfig()
    container
        .bind<IPromptTemplateRepository>('IPromptTemplateRepository')
        .toConstantValue(new PromptTemplateRepository({ ttlMs: promptCache.ttlMs }))

    // === Services ===
    container.bind(DescriptionComposer).toSelf().inSingletonScope()
    container.bind(RealmService).toSelf().inSingletonScope()
    container.bind<ILocationClockManager>('ILocationClockManager').to(LocationClockManager).inSingletonScope()
    container.bind(PlayerClockService).toSelf().inSingletonScope()
    container.bind<IWorldClockService>('IWorldClockService').to(WorldClockService).inSingletonScope()
    container.bind(WorldClockService).toSelf().inSingletonScope()
    container.bind(ReconcileEngine).toSelf().inSingletonScope()

    return container
}
