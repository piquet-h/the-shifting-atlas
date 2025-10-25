import appInsights from 'applicationinsights'
import { Container } from 'inversify'
import 'reflect-metadata'
import { GremlinClient, GremlinClientConfig, IGremlinClient } from './gremlin'
import { IPersistenceConfig, loadPersistenceConfigAsync } from './persistenceConfig'
import { CosmosExitRepository, IExitRepository } from './repos/exitRepository.js'
import { InMemoryExitRepository } from './repos/exitRepository.memory.js'
import { CosmosLocationRepository } from './repos/locationRepository.cosmos.js'
import { ILocationRepository, InMemoryLocationRepository } from './repos/locationRepository.js'

export const setupContainer = async (container: Container) => {
    container.bind<appInsights.TelemetryClient>('TelemetryClient').toConstantValue(appInsights.defaultClient)

    const config = await loadPersistenceConfigAsync()
    container.bind<IPersistenceConfig>('PersistenceConfig').toConstantValue(config)

    if (config.mode === 'cosmos') {
        container.bind<GremlinClientConfig>('GremlinConfig').toConstantValue({
            endpoint: process.env.GREMLIN_ENDPOINT || '',
            database: process.env.GREMLIN_DATABASE || '',
            graph: process.env.GREMLIN_GRAPH || ''
        })
        container.bind<IGremlinClient>('GremlinClient').to(GremlinClient).inSingletonScope()

        container.bind<IExitRepository>('IExitRepository').to(CosmosExitRepository).inSingletonScope()
        container.bind<ILocationRepository>('ILocationRepository').to(CosmosLocationRepository).inSingletonScope()
    } else {
        // Memory mode
        container.bind<ILocationRepository>('ILocationRepository').to(InMemoryLocationRepository).inSingletonScope()
        container.bind<IExitRepository>('IExitRepository').to(InMemoryExitRepository).inSingletonScope()
    }

    return container
}
