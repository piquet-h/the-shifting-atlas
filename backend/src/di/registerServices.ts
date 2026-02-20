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
import { DescriptionComposer } from '../services/descriptionComposer.js'
import { HeroProseGenerator } from '../services/heroProseGenerator.js'
import { LocationClockManager } from '../services/LocationClockManager.js'
import { PlayerClockService } from '../services/PlayerClockService.js'
import { RealmService } from '../services/RealmService.js'
import { ReconcileEngine } from '../services/ReconcileEngine.js'
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

    // AI Description Service (depends on AzureOpenAIClient and LayerRepository)
    container.bind<IAIDescriptionService>(TOKENS.AIDescriptionService).to(AIDescriptionService).inSingletonScope()

    // World Event Publisher: use Service Bus when configured, in-memory otherwise
    registerWorldEventPublisher(container)

    // Bind by class, not by token.
    // Tests (and some call sites) resolve this manager directly, and binding it via token
    // introduces a circular optional dependency with WorldClockService.
    container.bind(LocationClockManager).toSelf().inSingletonScope()
    container.bind(PlayerClockService).toSelf().inSingletonScope()

    container.bind<IWorldClockService>(TOKENS.WorldClockService).to(WorldClockService).inSingletonScope()
    container.bind(WorldClockService).toSelf().inSingletonScope()

    container.bind(ReconcileEngine).toSelf().inSingletonScope()
}

/**
 * Register the appropriate world event publisher based on available configuration.
 *
 * Selection logic:
 * 1. ServiceBusAtlas__fullyQualifiedNamespace set → Managed Identity (recommended for production)
 * 2. ServiceBusAtlas set → connection string (legacy / local emulator)
 * 3. Neither set → InMemoryWorldEventPublisher (unit tests / local dev without Service Bus)
 */
function registerWorldEventPublisher(container: Container): void {
    const fullyQualifiedNamespace = process.env.ServiceBusAtlas__fullyQualifiedNamespace
    const connectionString = process.env.ServiceBusAtlas

    if (fullyQualifiedNamespace || connectionString) {
        const client = fullyQualifiedNamespace
            ? new ServiceBusClient(fullyQualifiedNamespace, new DefaultAzureCredential())
            : new ServiceBusClient(connectionString!)

        container.bind<ServiceBusClient>(TOKENS.ServiceBusClient).toConstantValue(client)
        container.bind<IWorldEventPublisher>(TOKENS.WorldEventPublisher).to(ServiceBusWorldEventPublisher).inSingletonScope()
    } else {
        container.bind<IWorldEventPublisher>(TOKENS.WorldEventPublisher).to(InMemoryWorldEventPublisher).inSingletonScope()
    }
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
