import { PromptTemplateRepository, type IClock, type IPromptTemplateRepository } from '@piquet-h/shared'
import type { Container } from 'inversify'

import { getPromptTemplateCacheConfig } from '../config/promptTemplateCacheConfig.js'
import { DescriptionComposer } from '../services/descriptionComposer.js'
import { LocationClockManager } from '../services/LocationClockManager.js'
import { PlayerClockService } from '../services/PlayerClockService.js'
import { RealmService } from '../services/RealmService.js'
import { ReconcileEngine } from '../services/ReconcileEngine.js'
import type { IWorldClockService } from '../services/types.js'
import { WorldClockService } from '../services/WorldClockService.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { TOKENS } from './tokens.js'

export function registerCoreServices(container: Container): void {
    // TelemetryService wraps ITelemetryClient with enrichment logic.
    // Consistency policy: class-based injection only (no string token binding).
    container.bind<TelemetryService>(TelemetryService).toSelf().inSingletonScope()

    // Domain services (singleton - stateless orchestrators / shared caches)
    container.bind(DescriptionComposer).toSelf().inSingletonScope()
    container.bind(RealmService).toSelf().inSingletonScope()

    // Bind by class, not by token.
    // Tests (and some call sites) resolve this manager directly, and binding it via token
    // introduces a circular optional dependency with WorldClockService.
    container.bind(LocationClockManager).toSelf().inSingletonScope()
    container.bind(PlayerClockService).toSelf().inSingletonScope()

    container.bind<IWorldClockService>(TOKENS.WorldClockService).to(WorldClockService).inSingletonScope()
    container.bind(WorldClockService).toSelf().inSingletonScope()

    container.bind(ReconcileEngine).toSelf().inSingletonScope()
}

export function registerClock(container: Container, createClock: () => IClock): void {
    container
        .bind<IClock>(TOKENS.Clock)
        .toDynamicValue(() => createClock())
        .inSingletonScope()
}

export function registerPromptTemplateRepository(container: Container): void {
    const promptCache = getPromptTemplateCacheConfig()

    container
        .bind<IPromptTemplateRepository>(TOKENS.PromptTemplateRepository)
        .toDynamicValue(() => new PromptTemplateRepository({ ttlMs: promptCache.ttlMs }))
        .inSingletonScope()
}
