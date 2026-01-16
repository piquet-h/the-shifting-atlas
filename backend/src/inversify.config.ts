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
import { SystemClock } from '@piquet-h/shared'
import { Container } from 'inversify'
import 'reflect-metadata'
import { EXIT_HINT_DEBOUNCE_MS } from './config/exitHintDebounceConfig.js'
import { registerHandlers } from './di/registerHandlers.js'
import { registerAzureOpenAI, registerClock, registerCoreServices, registerPromptTemplateRepository } from './di/registerServices.js'
import { registerWorldEventHandlers } from './di/registerWorldEventHandlers.js'
import { TOKENS } from './di/tokens.js'
import { GremlinClient, GremlinClientConfig, IGremlinClient } from './gremlin/index.js'
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
import { CosmosLoreRepository } from './repos/loreRepository.cosmos.js'
import { ILoreRepository } from './repos/loreRepository.js'
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
import { ITelemetryClient } from './telemetry/ITelemetryClient.js'
import { NullTelemetryClient } from './telemetry/NullTelemetryClient.js'

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
    container.bind<IPersistenceConfig>(TOKENS.PersistenceConfig).toConstantValue(config)

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
        container.bind<ITelemetryClient>(TOKENS.TelemetryClient).to(NullTelemetryClient).inSingletonScope()
    } else if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
        // Production with App Insights: real Application Insights (already initialized in index.ts)
        const appInsightsModule = await import('applicationinsights')
        const appInsights = appInsightsModule.default
        container.bind<ITelemetryClient>(TOKENS.TelemetryClient).toConstantValue(appInsights.defaultClient)
    } else {
        // Production without App Insights: null telemetry client
        container.bind<ITelemetryClient>(TOKENS.TelemetryClient).to(NullTelemetryClient).inSingletonScope()
    }

    // Shared registrations (used by both prod and test containers)
    registerCoreServices(container)
    registerAzureOpenAI(container)
    registerHandlers(container)
    registerWorldEventHandlers(container)

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
        .bind<GremlinClientConfig>(TOKENS.GremlinConfig)
        .toConstantValue({ endpoint: gremlinEndpoint, database: gremlinDatabase, graph: gremlinGraph })
    container.bind<IGremlinClient>(TOKENS.GremlinClient).to(GremlinClient).inSingletonScope()

    // === Cosmos SQL API Configuration ===
    const sqlEndpoint = config.cosmosSql?.endpoint?.trim() || ''
    const sqlDatabase = config.cosmosSql?.database || ''

    if (!sqlEndpoint || !sqlDatabase) {
        throw new Error('Cosmos SQL API configuration incomplete. Required: COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE')
    }

    container.bind<CosmosDbSqlClientConfig>(TOKENS.CosmosDbSqlConfig).toConstantValue({ endpoint: sqlEndpoint, database: sqlDatabase })
    container.bind<ICosmosDbSqlClient>(TOKENS.CosmosDbSqlClient).to(CosmosDbSqlClient).inSingletonScope()

    // Bind PlayerDocRepository (SQL API player projection)
    container.bind<IPlayerDocRepository>(TOKENS.PlayerDocRepository).to(PlayerDocRepository).inSingletonScope()

    // Bind SQL player repository as primary (Gremlin player vertex deprecated per ADR-004)
    container.bind<IPlayerRepository>(TOKENS.PlayerRepository).to(CosmosPlayerRepositorySql).inSingletonScope()

    // === Cosmos Repositories ===
    container.bind<IExitRepository>(TOKENS.ExitRepository).to(CosmosExitRepository).inSingletonScope()
    container.bind<ILocationRepository>(TOKENS.LocationRepository).to(CosmosLocationRepository).inSingletonScope()
    container.bind<IRealmRepository>(TOKENS.RealmRepository).to(CosmosRealmRepository).inSingletonScope()
    container.bind<IDescriptionRepository>(TOKENS.DescriptionRepository).to(CosmosDescriptionRepository).inSingletonScope()
    container.bind<IInventoryRepository>(TOKENS.InventoryRepository).to(CosmosInventoryRepository).inSingletonScope()

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

    container.bind<string>(TOKENS.CosmosContainerLayers).toConstantValue(layersContainer)
    container.bind<ILayerRepository>(TOKENS.LayerRepository).to(CosmosLayerRepository).inSingletonScope()

    container.bind<string>(TOKENS.CosmosContainerEvents).toConstantValue(eventsContainer)
    container.bind<IWorldEventRepository>(TOKENS.WorldEventRepository).to(CosmosWorldEventRepository).inSingletonScope()

    // === Cosmos SQL Containers (Dead Letter & Processed Events) ===
    if (!config.cosmosSql?.containers.deadLetters) {
        throw new Error('Dead letter container configuration missing. Required: COSMOS_SQL_CONTAINER_DEADLETTERS')
    }
    container.bind<string>(TOKENS.CosmosContainerDeadLetters).toConstantValue(config.cosmosSql.containers.deadLetters)
    container.bind<IDeadLetterRepository>(TOKENS.DeadLetterRepository).to(CosmosDeadLetterRepository).inSingletonScope()

    if (!config.cosmosSql?.containers.processedEvents) {
        throw new Error('Processed events container configuration missing. Required: COSMOS_SQL_CONTAINER_PROCESSED_EVENTS')
    }
    container.bind<string>(TOKENS.CosmosContainerProcessedEvents).toConstantValue(config.cosmosSql.containers.processedEvents)
    container.bind<IProcessedEventRepository>(TOKENS.ProcessedEventRepository).to(CosmosProcessedEventRepository).inSingletonScope()

    // === Exit Hint Debounce Container ===
    if (!config.cosmosSql?.containers.exitHintDebounce) {
        throw new Error('Exit hint debounce container configuration missing. Required: COSMOS_SQL_CONTAINER_EXIT_HINT_DEBOUNCE')
    }
    container.bind<string>(TOKENS.CosmosContainerExitHintDebounce).toConstantValue(config.cosmosSql.containers.exitHintDebounce)
    container.bind<number>(TOKENS.ExitHintDebounceWindowMs).toConstantValue(EXIT_HINT_DEBOUNCE_MS)
    container.bind<IExitHintDebounceRepository>(TOKENS.ExitHintDebounceRepository).to(CosmosExitHintDebounceRepository).inSingletonScope()

    // === Temporal Ledger Container ===
    if (!config.cosmosSql?.containers.temporalLedger) {
        throw new Error('Temporal ledger container configuration missing. Required: COSMOS_SQL_CONTAINER_TEMPORAL_LEDGER')
    }
    container.bind<string>(TOKENS.CosmosContainerTemporalLedger).toConstantValue(config.cosmosSql.containers.temporalLedger)
    container.bind<ITemporalLedgerRepository>(TOKENS.TemporalLedgerRepository).to(TemporalLedgerRepositoryCosmos).inSingletonScope()

    container.bind<string>(TOKENS.CosmosContainerWorldClock).toConstantValue(config.cosmosSql.containers.worldClock)
    container.bind<IWorldClockRepository>(TOKENS.WorldClockRepository).to(WorldClockRepositoryCosmos).inSingletonScope()

    // === Location Clock Container ===
    // Note: Container name is read directly in LocationClockRepositoryCosmos constructor from env var
    container.bind<ILocationClockRepository>(TOKENS.LocationClockRepository).to(LocationClockRepositoryCosmos).inSingletonScope()
    // === Lore Facts Container ===
    if (!config.cosmosSql?.containers.loreFacts) {
        throw new Error('Lore facts container configuration missing. Required: COSMOS_SQL_CONTAINER_LORE_FACTS')
    }
    container.bind<string>(TOKENS.CosmosContainerLoreFacts).toConstantValue(config.cosmosSql.containers.loreFacts)
    container.bind<ILoreRepository>(TOKENS.LoreRepository).to(CosmosLoreRepository).inSingletonScope()

    // === Clock (Time Abstraction) ===
    registerClock(container, () => new SystemClock())

    // === Prompt Template Repository (file-based, no Cosmos dependency) ===
    registerPromptTemplateRepository(container)

    return container
}
