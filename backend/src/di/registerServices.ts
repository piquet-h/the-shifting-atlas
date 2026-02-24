import { PromptTemplateRepository, type IClock, type IPromptTemplateRepository } from '@piquet-h/shared'
import { ServiceBusClient } from '@azure/service-bus'
import { DefaultAzureCredential } from '@azure/identity'
import type { Container } from 'inversify'

import { getPromptTemplateCacheConfig } from '../config/promptTemplateCacheConfig.js'
import {
    AzureOpenAIClient,
    NullAzureOpenAIClient,
    type AzureOpenAIClientConfig,
    type IAzureOpenAIClient
} from '../services/azureOpenAIClient.js'
import { AIDescriptionService, type IAIDescriptionService } from '../services/AIDescriptionService.js'
import { AreaGenerationOrchestrator } from '../services/AreaGenerationOrchestrator.js'
import { DescriptionComposer } from '../services/descriptionComposer.js'
import { HeroProseGenerator } from '../services/heroProseGenerator.js'
import { LocationClockManager } from '../services/LocationClockManager.js'
import { PlayerClockService } from '../services/PlayerClockService.js'
import { RealmService } from '../services/RealmService.js'
import { ReconcileEngine } from '../services/ReconcileEngine.js'
import { TemporalProximityService, type ITemporalProximityService } from '../services/temporalProximityService.js'
import type { IWorldClockService } from '../services/types.js'
import { WorldClockService } from '../services/WorldClockService.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import {
    InMemoryWorldEventPublisher,
    ServiceBusWorldEventPublisher,
    type IWorldEventPublisher
} from '../worldEvents/worldEventPublisher.js'
import { TOKENS } from './tokens.js'

export function registerCoreServices(container: Container): void {
    // TelemetryService wraps ITelemetryClient with enrichment logic.
    // Consistency policy: class-based injection only (no string token binding).
    container.bind<TelemetryService>(TelemetryService).toSelf().inSingletonScope()

    // Domain services (singleton - stateless orchestrators / shared caches)
    container.bind(DescriptionComposer).toSelf().inSingletonScope()
    container.bind(RealmService).toSelf().inSingletonScope()
    container.bind(HeroProseGenerator).toSelf().inSingletonScope()
    container.bind(AreaGenerationOrchestrator).toSelf().inSingletonScope()

    // AI Description Service (depends on AzureOpenAIClient and LayerRepository)
    container.bind<IAIDescriptionService>(TOKENS.AIDescriptionService).to(AIDescriptionService).inSingletonScope()

    // World Event Publisher: use Service Bus when configured, in-memory otherwise
    container
        .bind<IWorldEventPublisher>(TOKENS.WorldEventPublisher)
        .toDynamicValue(() => {
            const namespace = process.env.ServiceBusAtlas__fullyQualifiedNamespace
            const connectionString = process.env.ServiceBusAtlas
            if (namespace || connectionString) {
                const client = namespace
                    ? new ServiceBusClient(namespace, new DefaultAzureCredential())
                    : new ServiceBusClient(connectionString!)
                return new ServiceBusWorldEventPublisher(client)
            }
            return new InMemoryWorldEventPublisher()
        })
        .inSingletonScope()

    // Bind by class, not by token.
    // Tests (and some call sites) resolve this manager directly, and binding it via token
    // introduces a circular optional dependency with WorldClockService.
    container.bind(LocationClockManager).toSelf().inSingletonScope()
    container.bind(PlayerClockService).toSelf().inSingletonScope()

    container.bind<IWorldClockService>(TOKENS.WorldClockService).to(WorldClockService).inSingletonScope()
    container.bind(WorldClockService).toSelf().inSingletonScope()

    container.bind(ReconcileEngine).toSelf().inSingletonScope()

    // Temporal proximity service (graph BFS over exit edges)
    container.bind<ITemporalProximityService>(TOKENS.TemporalProximityService).to(TemporalProximityService).inSingletonScope()
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

export function registerAzureOpenAI(container: Container): void {
    // Configure Azure OpenAI client from environment variables
    // Uses Managed Identity (DefaultAzureCredential) for authentication
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || ''
    const model = process.env.AZURE_OPENAI_MODEL || 'gpt-4'
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || undefined

    const config: AzureOpenAIClientConfig = {
        endpoint,
        model,
        apiVersion
    }

    container.bind<AzureOpenAIClientConfig>(TOKENS.AzureOpenAIConfig).toConstantValue(config)

    // In tests/local dev we often don't have an Azure OpenAI endpoint configured.
    // Bind a no-op client so DI remains stable and the feature gracefully no-ops.
    if (!endpoint) {
        container.bind<IAzureOpenAIClient>(TOKENS.AzureOpenAIClient).to(NullAzureOpenAIClient).inSingletonScope()
        return
    }

    container
        .bind<IAzureOpenAIClient>(TOKENS.AzureOpenAIClient)
        .toDynamicValue(() => new AzureOpenAIClient(config))
        .inSingletonScope()
}
