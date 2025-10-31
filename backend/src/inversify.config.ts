import appInsights from 'applicationinsights'
import { Container } from 'inversify'
import 'reflect-metadata'
import { GremlinClient, GremlinClientConfig, IGremlinClient } from './gremlin'
import { BootstrapPlayerHandler } from './handlers/bootstrapPlayer.js'
import { GetExitsHandler } from './handlers/getExits.js'
import { GremlinHealthHandler } from './handlers/gremlinHealth.js'
import { HealthHandler } from './handlers/health.js'
import { LinkRoomsHandler } from './handlers/linkRooms.js'
import { LocationHandler } from './handlers/location.js'
import { LocationLookHandler } from './handlers/locationLook.js'
import { MoveHandler } from './handlers/moveCore.js'
import { PingHandler } from './handlers/ping.js'
import { SimplePingHandler } from './handlers/pingSimple.js'
import { PlayerCreateHandler } from './handlers/playerCreate.js'
import { PlayerGetHandler } from './handlers/playerGet.js'
import { PlayerLinkHandler } from './handlers/playerLink.js'
import { PlayerMoveHandler } from './handlers/playerMove.js'
import { IPersistenceConfig, loadPersistenceConfigAsync } from './persistenceConfig'
import { CosmosDescriptionRepository } from './repos/descriptionRepository.cosmos.js'
import { IDescriptionRepository } from './repos/descriptionRepository.js'
import { InMemoryDescriptionRepository } from './repos/descriptionRepository.memory.js'
import { CosmosExitRepository, IExitRepository } from './repos/exitRepository.js'
import { CosmosLocationRepository } from './repos/locationRepository.cosmos.js'
import { ILocationRepository, InMemoryLocationRepository } from './repos/locationRepository.js'
import { CosmosPlayerRepository } from './repos/playerRepository.cosmos.js'
import { IPlayerRepository } from './repos/playerRepository.js'
import { InMemoryPlayerRepository } from './repos/playerRepository.memory.js'
import { ITelemetryClient } from './telemetry/ITelemetryClient.js'

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

    // Register ITelemetryClient
    container.bind<ITelemetryClient>('ITelemetryClient').toConstantValue(appInsights.defaultClient)

    // Register handlers - these extend BaseHandler which has @injectable and constructor injection
    container.bind(MoveHandler).toSelf().inSingletonScope()
    container.bind(BootstrapPlayerHandler).toSelf().inSingletonScope()
    container.bind(PlayerLinkHandler).toSelf().inSingletonScope()
    container.bind(PlayerMoveHandler).toSelf().inSingletonScope()
    container.bind(PingHandler).toSelf().inSingletonScope()
    container.bind(HealthHandler).toSelf().inSingletonScope()
    container.bind(GremlinHealthHandler).toSelf().inSingletonScope()
    container.bind(SimplePingHandler).toSelf().inSingletonScope()
    container.bind(LocationHandler).toSelf().inSingletonScope()
    container.bind(LocationLookHandler).toSelf().inSingletonScope()
    container.bind(GetExitsHandler).toSelf().inSingletonScope()
    container.bind(LinkRoomsHandler).toSelf().inSingletonScope()
    container.bind(PlayerCreateHandler).toSelf().inSingletonScope()
    container.bind(PlayerGetHandler).toSelf().inSingletonScope()

    if (resolvedMode === 'cosmos') {
        // Cosmos mode - production configuration
        container.bind<GremlinClientConfig>('GremlinConfig').toConstantValue({
            endpoint: process.env.GREMLIN_ENDPOINT || '',
            database: process.env.GREMLIN_DATABASE || '',
            graph: process.env.GREMLIN_GRAPH || ''
        })
        container.bind<IGremlinClient>('GremlinClient').to(GremlinClient).inSingletonScope()

        container.bind<IExitRepository>('IExitRepository').to(CosmosExitRepository).inSingletonScope()
        container.bind<ILocationRepository>('ILocationRepository').to(CosmosLocationRepository).inSingletonScope()
        container.bind<IPlayerRepository>('IPlayerRepository').to(CosmosPlayerRepository).inSingletonScope()
        container.bind<IDescriptionRepository>('IDescriptionRepository').to(CosmosDescriptionRepository).inSingletonScope()
    } else {
        // Memory mode - integration tests and local development
        // InMemoryLocationRepository implements both ILocationRepository and IExitRepository
        // since exits are stored as nested properties of locations in memory
        container.bind<ILocationRepository>('ILocationRepository').to(InMemoryLocationRepository).inSingletonScope()
        container.bind<IExitRepository>('IExitRepository').toService('ILocationRepository')
        container.bind<IPlayerRepository>('IPlayerRepository').to(InMemoryPlayerRepository).inSingletonScope()
        container.bind<IDescriptionRepository>('IDescriptionRepository').to(InMemoryDescriptionRepository).inSingletonScope()
    }

    return container
}
