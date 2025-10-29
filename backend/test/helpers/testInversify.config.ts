/**
 * Test-specific Inversify configuration
 * Extends the main inversify config but imports mocks from the test folder
 */

import { Container } from 'inversify'
import 'reflect-metadata'
import { GremlinClient, GremlinClientConfig, IGremlinClient } from '../../src/gremlin/index.js'
import { BootstrapPlayerHandler } from '../../src/handlers/bootstrapPlayer.js'
import { GetExitsHandler } from '../../src/handlers/getExits.js'
import { HealthHandler } from '../../src/handlers/health.js'
import { LinkRoomsHandler } from '../../src/handlers/linkRooms.js'
import { LocationHandler } from '../../src/handlers/location.js'
import { MoveHandler } from '../../src/handlers/moveCore.js'
import { PingHandler } from '../../src/handlers/ping.js'
import { SimplePingHandler } from '../../src/handlers/pingSimple.js'
import { PlayerCreateHandler } from '../../src/handlers/playerCreate.js'
import { PlayerGetHandler } from '../../src/handlers/playerGet.js'
import { PlayerLinkHandler } from '../../src/handlers/playerLink.js'
import { PlayerMoveHandler } from '../../src/handlers/playerMove.js'
import { IPersistenceConfig, loadPersistenceConfigAsync } from '../../src/persistenceConfig.js'
import { CosmosDescriptionRepository } from '../../src/repos/descriptionRepository.cosmos.js'
import { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import { InMemoryDescriptionRepository } from '../../src/repos/descriptionRepository.memory.js'
import { CosmosExitRepository, IExitRepository } from '../../src/repos/exitRepository.js'
import { CosmosLocationRepository } from '../../src/repos/locationRepository.cosmos.js'
import { ILocationRepository, InMemoryLocationRepository } from '../../src/repos/locationRepository.js'
import { CosmosPlayerRepository } from '../../src/repos/playerRepository.cosmos.js'
import { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { InMemoryPlayerRepository } from '../../src/repos/playerRepository.memory.js'
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
    } else {
        const config = await loadPersistenceConfigAsync()
        container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(config)
        resolvedMode = config.mode === 'cosmos' ? 'cosmos' : 'memory'
    }

    // Register ITelemetryClient - always use mock in tests to avoid real App Insights calls
    // This includes E2E tests (cosmos mode) to prevent test telemetry pollution
    container.bind<ITelemetryClient>('ITelemetryClient').to(MockTelemetryClient).inSingletonScope()

    // Register handlers - these extend BaseHandler which has @injectable and constructor injection
    container.bind(MoveHandler).toSelf().inSingletonScope()
    container.bind(BootstrapPlayerHandler).toSelf().inSingletonScope()
    container.bind(PlayerLinkHandler).toSelf().inSingletonScope()
    container.bind(PlayerMoveHandler).toSelf().inSingletonScope()
    container.bind(PingHandler).toSelf().inSingletonScope()
    container.bind(HealthHandler).toSelf().inSingletonScope()
    container.bind(SimplePingHandler).toSelf().inSingletonScope()
    container.bind(LocationHandler).toSelf().inSingletonScope()
    container.bind(GetExitsHandler).toSelf().inSingletonScope()
    container.bind(LinkRoomsHandler).toSelf().inSingletonScope()
    container.bind(PlayerCreateHandler).toSelf().inSingletonScope()
    container.bind(PlayerGetHandler).toSelf().inSingletonScope()

    if (resolvedMode === 'cosmos') {
        // Cosmos mode - production configuration
        // For E2E tests (NODE_ENV=test), use *_TEST env vars if available
        const isTestEnv = process.env.NODE_ENV === 'test'

        const gremlinConfig = {
            endpoint: (isTestEnv ? process.env.GREMLIN_ENDPOINT_TEST : null) || process.env.GREMLIN_ENDPOINT || '',
            database: (isTestEnv ? process.env.GREMLIN_DATABASE_TEST : null) || process.env.GREMLIN_DATABASE || '',
            graph: (isTestEnv ? process.env.GREMLIN_GRAPH_TEST : null) || process.env.GREMLIN_GRAPH || ''
        }

        container.bind<GremlinClientConfig>('GremlinConfig').toConstantValue(gremlinConfig)
        container.bind<IGremlinClient>('GremlinClient').to(GremlinClient).inSingletonScope()

        container.bind<IExitRepository>('IExitRepository').to(CosmosExitRepository).inSingletonScope()
        container.bind<ILocationRepository>('ILocationRepository').to(CosmosLocationRepository).inSingletonScope()
        container.bind<IPlayerRepository>('IPlayerRepository').to(CosmosPlayerRepository).inSingletonScope()
        container.bind<IDescriptionRepository>('IDescriptionRepository').to(CosmosDescriptionRepository).inSingletonScope()
    } else if (resolvedMode === 'mock') {
        // Mock mode - unit tests with controllable test doubles
        container.bind<ILocationRepository>('ILocationRepository').to(MockLocationRepository).inSingletonScope()
        container.bind<IExitRepository>('IExitRepository').to(MockExitRepository).inSingletonScope()
        container.bind<IPlayerRepository>('IPlayerRepository').to(MockPlayerRepository).inSingletonScope()
        container.bind<IDescriptionRepository>('IDescriptionRepository').to(MockDescriptionRepository).inSingletonScope()
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
