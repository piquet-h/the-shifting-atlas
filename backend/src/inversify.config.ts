import appInsights from 'applicationinsights'
import { Container } from 'inversify'
import 'reflect-metadata'
import { GremlinClient, GremlinClientConfig, IGremlinClient } from './gremlin'
import { IPersistenceConfig, loadPersistenceConfigAsync } from './persistenceConfig'
import { CosmosDescriptionRepository } from './repos/descriptionRepository.cosmos.js'
import { IDescriptionRepository } from './repos/descriptionRepository.js'
import { InMemoryDescriptionRepository } from './repos/descriptionRepository.memory.js'
import { MockDescriptionRepository } from './repos/descriptionRepository.mock.js'
import { CosmosExitRepository, IExitRepository } from './repos/exitRepository.js'
import { MockExitRepository } from './repos/exitRepository.mock.js'
import { CosmosLocationRepository } from './repos/locationRepository.cosmos.js'
import { ILocationRepository, InMemoryLocationRepository } from './repos/locationRepository.js'
import { MockLocationRepository } from './repos/locationRepository.mock.js'
import { CosmosPlayerRepository } from './repos/playerRepository.cosmos.js'
import { IPlayerRepository } from './repos/playerRepository.js'
import { InMemoryPlayerRepository } from './repos/playerRepository.memory.js'
import { MockPlayerRepository } from './repos/playerRepository.mock.js'
import { ITelemetryClient } from './telemetry/ITelemetryClient.js'
import { MockTelemetryClient } from './telemetry/MockTelemetryClient.js'

export type ContainerMode = 'cosmos' | 'memory' | 'mock'

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

    // Register ITelemetryClient - use mock in test mode, real client otherwise
    if (resolvedMode === 'mock') {
        container.bind<ITelemetryClient>('ITelemetryClient').to(MockTelemetryClient).inSingletonScope()
    } else {
        container.bind<ITelemetryClient>('ITelemetryClient').toConstantValue(appInsights.defaultClient)
    }

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
