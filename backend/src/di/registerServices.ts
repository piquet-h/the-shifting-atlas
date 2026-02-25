import type { InvocationContext } from '@azure/functions'
import { DefaultAzureCredential } from '@azure/identity'
import { ServiceBusClient } from '@azure/service-bus'
import { PromptTemplateRepository, type IClock, type IPromptTemplateRepository } from '@piquet-h/shared'
import type { WorldEventEnvelope } from '@piquet-h/shared/events'
import type { Container } from 'inversify'

import { getPromptTemplateCacheConfig } from '../config/promptTemplateCacheConfig.js'
import { QueueProcessExitGenerationHintHandler } from '../handlers/queueProcessExitGenerationHint.js'
import { QueueSyncLocationAnchorsHandler } from '../handlers/queueSyncLocationAnchors.js'
import {
    InMemoryExitGenerationHintPublisher,
    ServiceBusExitGenerationHintPublisher,
    type IExitGenerationHintPublisher
} from '../queues/exitGenerationHintPublisher.js'
import {
    InMemoryLocationAnchorSyncPublisher,
    ServiceBusLocationAnchorSyncPublisher,
    type ILocationAnchorSyncPublisher
} from '../queues/locationAnchorSyncPublisher.js'
import { AIDescriptionService, type IAIDescriptionService } from '../services/AIDescriptionService.js'
import { AreaGenerationOrchestrator } from '../services/AreaGenerationOrchestrator.js'
import {
    AzureOpenAIClient,
    NullAzureOpenAIClient,
    type AzureOpenAIClientConfig,
    type IAzureOpenAIClient
} from '../services/azureOpenAIClient.js'
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
import { QueueProcessWorldEventHandler } from '../worldEvents/queueProcessWorldEvent.js'
import {
    InMemoryWorldEventPublisher,
    ServiceBusWorldEventPublisher,
    type IWorldEventPublisher
} from '../worldEvents/worldEventPublisher.js'
import { TOKENS } from './tokens.js'

export function registerCoreServices(container: Container): void {
    const createInMemoryQueueInvocationContext = (invocationId: string, functionName: string): InvocationContext => {
        const extraInputs = new Map<string, unknown>()
        extraInputs.set('container', container)

        return {
            invocationId,
            functionName,
            log: () => {
                // no-op for local in-memory autodrain
            },
            warn: () => {
                // no-op for local in-memory autodrain
            },
            error: () => {
                // no-op for local in-memory autodrain
            },
            extraInputs: {
                get: (key: string) => extraInputs.get(key),
                set: (key: string, value: unknown) => {
                    extraInputs.set(key, value)
                }
            }
        } as unknown as InvocationContext
    }

    const autoDrainRaw = (process.env.MEMORY_QUEUE_AUTODRAIN || '').toLowerCase()
    const autoDrainFromEnv = autoDrainRaw === '1' || autoDrainRaw === 'true'
    const autoDrainDisabledFromEnv = autoDrainRaw === '0' || autoDrainRaw === 'false'
    const defaultAutoDrain = process.env.NODE_ENV !== 'test'
    const autoDrainEnabled = autoDrainDisabledFromEnv ? false : autoDrainFromEnv || defaultAutoDrain

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

            if (!autoDrainEnabled) {
                return new InMemoryWorldEventPublisher()
            }

            return new InMemoryWorldEventPublisher({
                autoDrain: true,
                processEvent: async (event) => {
                    const handler = container.get(QueueProcessWorldEventHandler)
                    const context = createInMemoryQueueInvocationContext(
                        `memory-autodrain-world-events-${event.eventId}`,
                        'memory-autodrain-world-events'
                    )

                    await handler.handle(event, context)
                }
            })
        })
        .inSingletonScope()

    // Exit Generation Hint Publisher: Service Bus in production, in-memory in local/test.
    container
        .bind<IExitGenerationHintPublisher>(TOKENS.ExitGenerationHintPublisher)
        .toDynamicValue(() => {
            const namespace = process.env.ServiceBusAtlas__fullyQualifiedNamespace
            const connectionString = process.env.ServiceBusAtlas
            if (namespace || connectionString) {
                const client = namespace
                    ? new ServiceBusClient(namespace, new DefaultAzureCredential())
                    : new ServiceBusClient(connectionString!)
                return new ServiceBusExitGenerationHintPublisher(client)
            }

            if (!autoDrainEnabled) {
                return new InMemoryExitGenerationHintPublisher()
            }

            return new InMemoryExitGenerationHintPublisher({
                autoDrain: true,
                processMessage: async (message: WorldEventEnvelope) => {
                    const handler = container.get(QueueProcessExitGenerationHintHandler)
                    const context = createInMemoryQueueInvocationContext(
                        `memory-autodrain-exit-hints-${message.eventId}`,
                        'memory-autodrain-exit-hints'
                    )

                    await handler.handle(message, context)
                }
            })
        })
        .inSingletonScope()

    // Location Anchor Sync Publisher: Service Bus in production, in-memory in local/test.
    container
        .bind<ILocationAnchorSyncPublisher>(TOKENS.LocationAnchorSyncPublisher)
        .toDynamicValue(() => {
            const namespace = process.env.ServiceBusAtlas__fullyQualifiedNamespace
            const connectionString = process.env.ServiceBusAtlas
            if (namespace || connectionString) {
                const client = namespace
                    ? new ServiceBusClient(namespace, new DefaultAzureCredential())
                    : new ServiceBusClient(connectionString!)
                return new ServiceBusLocationAnchorSyncPublisher(client)
            }

            if (!autoDrainEnabled) {
                return new InMemoryLocationAnchorSyncPublisher()
            }

            return new InMemoryLocationAnchorSyncPublisher({
                autoDrain: true,
                processMessage: async (message) => {
                    const handler = container.get(QueueSyncLocationAnchorsHandler)
                    const context = createInMemoryQueueInvocationContext(
                        `memory-autodrain-location-sync-${message.correlationId}`,
                        'memory-autodrain-location-sync'
                    )

                    await handler.handle(message, context)
                }
            })
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
