import { Container } from 'inversify'
import { WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS } from './config/worldEventProcessorConfig.js'
import { TOKENS } from './di/tokens.js'
import type { IDeadLetterRepository } from './repos/deadLetterRepository.js'
import { MemoryDeadLetterRepository } from './repos/deadLetterRepository.memory.js'
import type { IDescriptionRepository } from './repos/descriptionRepository.js'
import { InMemoryDescriptionRepository } from './repos/descriptionRepository.memory.js'
import type { IExitHintDebounceRepository } from './repos/exitHintDebounceRepository.js'
import { MemoryExitHintDebounceRepository } from './repos/exitHintDebounceRepository.memory.js'
import type { IExitRepository } from './repos/exitRepository.js'
import type { IInventoryRepository } from './repos/inventoryRepository.js'
import { MemoryInventoryRepository } from './repos/inventoryRepository.memory.js'
import type { ILayerRepository } from './repos/layerRepository.js'
import { MemoryLayerRepository } from './repos/layerRepository.memory.js'
import type { ILocationClockRepository } from './repos/locationClockRepository.js'
import { MemoryLocationClockRepository } from './repos/locationClockRepository.memory.js'
import type { ILocationRepository } from './repos/locationRepository.js'
import { InMemoryLocationRepository } from './repos/locationRepository.memory.js'
import type { ILoreRepository } from './repos/loreRepository.js'
import { MemoryLoreRepository } from './repos/loreRepository.memory.js'
import type { IPlayerDocRepository } from './repos/PlayerDocRepository.js'
import { MemoryPlayerDocRepository } from './repos/PlayerDocRepository.memory.js'
import type { IPlayerRepository } from './repos/playerRepository.js'
import { InMemoryPlayerRepository } from './repos/playerRepository.memory.js'
import type { IProcessedEventRepository } from './repos/processedEventRepository.js'
import { MemoryProcessedEventRepository } from './repos/processedEventRepository.memory.js'
import type { IRealmRepository } from './repos/realmRepository.js'
import { InMemoryRealmRepository } from './repos/realmRepository.memory.js'
import type { ITemporalLedgerRepository } from './repos/temporalLedgerRepository.js'
import { TemporalLedgerRepositoryMemory } from './repos/temporalLedgerRepository.memory.js'
import type { IWorldClockRepository } from './repos/worldClockRepository.js'
import { WorldClockRepositoryMemory } from './repos/worldClockRepository.memory.js'
import type { IWorldEventRepository } from './repos/worldEventRepository.js'
import { MemoryWorldEventRepository } from './repos/worldEventRepository.memory.js'

/**
 * In-memory persistence bindings for local dev.
 *
 * Note: common bindings (telemetry, handlers, clock, prompts) are registered by the runtime selector.
 */
export function bindMemoryPersistence(container: Container): void {
    // Backing location repository implements both ILocationRepository + IExitRepository.
    container.bind(InMemoryLocationRepository).toSelf().inSingletonScope()
    container.bind<ILocationRepository>(TOKENS.LocationRepository).toService(InMemoryLocationRepository)
    container.bind<IExitRepository>(TOKENS.ExitRepository).toService(InMemoryLocationRepository)

    container.bind<IRealmRepository>(TOKENS.RealmRepository).to(InMemoryRealmRepository).inSingletonScope()
    container.bind<IDescriptionRepository>(TOKENS.DescriptionRepository).to(InMemoryDescriptionRepository).inSingletonScope()
    container.bind<IInventoryRepository>(TOKENS.InventoryRepository).to(MemoryInventoryRepository).inSingletonScope()
    container.bind<ILayerRepository>(TOKENS.LayerRepository).to(MemoryLayerRepository).inSingletonScope()
    container.bind<IWorldEventRepository>(TOKENS.WorldEventRepository).to(MemoryWorldEventRepository).inSingletonScope()

    container.bind<IPlayerRepository>(TOKENS.PlayerRepository).to(InMemoryPlayerRepository).inSingletonScope()
    container.bind<IPlayerDocRepository>(TOKENS.PlayerDocRepository).to(MemoryPlayerDocRepository).inSingletonScope()

    container.bind<IExitHintDebounceRepository>(TOKENS.ExitHintDebounceRepository).to(MemoryExitHintDebounceRepository).inSingletonScope()

    container.bind<ITemporalLedgerRepository>(TOKENS.TemporalLedgerRepository).to(TemporalLedgerRepositoryMemory).inSingletonScope()
    container.bind<IWorldClockRepository>(TOKENS.WorldClockRepository).to(WorldClockRepositoryMemory).inSingletonScope()
    container.bind<ILocationClockRepository>(TOKENS.LocationClockRepository).to(MemoryLocationClockRepository).inSingletonScope()
    container.bind<ILoreRepository>(TOKENS.LoreRepository).to(MemoryLoreRepository).inSingletonScope()

    container
        .bind<IDeadLetterRepository>(TOKENS.DeadLetterRepository)
        .toDynamicValue(() => new MemoryDeadLetterRepository())
        .inSingletonScope()

    container
        .bind<IProcessedEventRepository>(TOKENS.ProcessedEventRepository)
        .toDynamicValue(() => new MemoryProcessedEventRepository(WORLD_EVENT_PROCESSED_EVENTS_TTL_SECONDS))
        .inSingletonScope()
}
