/**
 * Centralized Inversify tokens (string identifiers).
 *
 * This repo currently uses string tokens rather than Symbol tokens.
 * Keeping them in one place reduces drift and typos across container configs,
 * health checks, and @inject decorators.
 */
export const TOKENS = {
    // Core
    PersistenceConfig: 'PersistenceConfig',
    TelemetryClient: 'ITelemetryClient',
    Clock: 'IClock',
    PromptTemplateRepository: 'IPromptTemplateRepository',

    // Gremlin
    GremlinConfig: 'GremlinConfig',
    GremlinClient: 'GremlinClient',

    // Cosmos SQL
    CosmosDbSqlConfig: 'CosmosDbSqlConfig',
    CosmosDbSqlClient: 'CosmosDbSqlClient',

    // Repositories
    PlayerRepository: 'IPlayerRepository',
    PlayerDocRepository: 'IPlayerDocRepository',
    LocationRepository: 'ILocationRepository',
    ExitRepository: 'IExitRepository',
    RealmRepository: 'IRealmRepository',
    DescriptionRepository: 'IDescriptionRepository',
    InventoryRepository: 'IInventoryRepository',
    LayerRepository: 'ILayerRepository',
    WorldEventRepository: 'IWorldEventRepository',
    DeadLetterRepository: 'IDeadLetterRepository',
    ProcessedEventRepository: 'IProcessedEventRepository',
    ExitHintDebounceRepository: 'IExitHintDebounceRepository',
    TemporalLedgerRepository: 'ITemporalLedgerRepository',
    WorldClockRepository: 'IWorldClockRepository',
    LocationClockRepository: 'ILocationClockRepository',
    LoreRepository: 'ILoreRepository',

    // Services
    TemporalProximityService: 'ITemporalProximityService',
    WorldClockService: 'IWorldClockService',
    LocationClockManager: 'ILocationClockManager',
    AzureOpenAIClient: 'IAzureOpenAIClient',
    AzureOpenAIConfig: 'AzureOpenAIConfig',
    AIDescriptionService: 'IAIDescriptionService',
    WorldEventPublisher: 'IWorldEventPublisher',

    // Cosmos container names / config bits
    CosmosContainerLayers: 'CosmosContainer:Layers',
    CosmosContainerEvents: 'CosmosContainer:Events',
    CosmosContainerDeadLetters: 'CosmosContainer:DeadLetters',
    CosmosContainerProcessedEvents: 'CosmosContainer:ProcessedEvents',
    CosmosContainerExitHintDebounce: 'CosmosContainer:ExitHintDebounce',
    CosmosContainerTemporalLedger: 'CosmosContainer:TemporalLedger',
    CosmosContainerWorldClock: 'CosmosContainer:WorldClock',
    CosmosContainerLoreFacts: 'CosmosContainer:LoreFacts',

    ExitHintDebounceWindowMs: 'ExitHintDebounceWindowMs'
} as const

export type TokenName = keyof typeof TOKENS
export type TokenValue = (typeof TOKENS)[TokenName]
