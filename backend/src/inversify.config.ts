/**
 * Runtime Inversify Container Configuration
 *
 * This module selects Cosmos vs Memory persistence based on `PERSISTENCE_MODE`.
 *
 * Rules:
 * - In Azure-hosted environments, ONLY cosmos mode is allowed (fail fast).
 * - Locally, memory mode is allowed ONLY with explicit opt-in: `ALLOW_LOCAL_MEMORY_CONTAINER=1`.
 *
 * Tests should use test/helpers/testInversify.config.ts instead.
 */
import { SystemClock } from '@piquet-h/shared'
import { Container } from 'inversify'
import 'reflect-metadata'
import { EXIT_HINT_DEBOUNCE_MS } from './config/exitHintDebounceConfig.js'
import { registerHandlers } from './di/registerHandlers.js'
import { registerAzureOpenAI, registerClock, registerCoreServices, registerPromptTemplateRepository } from './di/registerServices.js'
import { registerWorldEventHandlers } from './di/registerWorldEventHandlers.js'
import { TOKENS } from './di/tokens.js'
import { bindCosmosPersistence } from './inversify.cosmos.config.js'
import { bindMemoryPersistence } from './inversify.memory.config.js'
import type { IPersistenceConfig } from './persistenceConfig.js'
import { loadPersistenceConfigAsync } from './persistenceConfig.js'
import type { ITelemetryClient } from './telemetry/ITelemetryClient.js'
import { NullTelemetryClient } from './telemetry/NullTelemetryClient.js'

function isAzureHostedEnvironment(): boolean {
    return Boolean(process.env.WEBSITE_INSTANCE_ID) || Boolean(process.env.WEBSITE_SITE_NAME) || Boolean(process.env.WEBSITE_RESOURCE_GROUP)
}

function isLocalMemoryOptInEnabled(): boolean {
    const raw = (process.env.ALLOW_LOCAL_MEMORY_CONTAINER || '').trim().toLowerCase()
    return raw === '1' || raw === 'true' || raw === 'yes'
}

function assertMemoryModeAllowed(config: IPersistenceConfig): void {
    if (config.mode === 'cosmos') {
        return
    }

    if (isAzureHostedEnvironment()) {
        throw new Error(
            'Memory persistence mode is not supported in Azure-hosted environments. ' +
                'Set PERSISTENCE_MODE=cosmos and provide COSMOS_GREMLIN_* and COSMOS_SQL_* variables.'
        )
    }

    if (!isLocalMemoryOptInEnabled()) {
        throw new Error(
            'Memory persistence mode requires explicit local opt-in. ' +
                'Set ALLOW_LOCAL_MEMORY_CONTAINER=1 (or use backend/local.settings.memory.json).'
        )
    }
}

export const setupContainer = async (container: Container) => {
    const config = await loadPersistenceConfigAsync()
    container.bind<IPersistenceConfig>(TOKENS.PersistenceConfig).toConstantValue(config)

    const isTestMode = process.env.NODE_ENV === 'test'

    // Register ITelemetryClient based on environment
    // CRITICAL: Never load real Application Insights in test mode (causes hanging)
    if (isTestMode) {
        container.bind<ITelemetryClient>(TOKENS.TelemetryClient).to(NullTelemetryClient).inSingletonScope()
    } else if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
        // Production with App Insights: real Application Insights (already initialized in index.ts)
        const appInsightsModule = await import('applicationinsights')
        const appInsights = appInsightsModule.default
        container.bind<ITelemetryClient>(TOKENS.TelemetryClient).toConstantValue(appInsights.defaultClient)
    } else {
        container.bind<ITelemetryClient>(TOKENS.TelemetryClient).to(NullTelemetryClient).inSingletonScope()
    }

    // Shared registrations (used by both cosmos and memory containers)
    registerCoreServices(container)
    registerAzureOpenAI(container)
    registerHandlers(container)
    registerWorldEventHandlers(container)

    // === Clock (Time Abstraction) ===
    registerClock(container, () => new SystemClock())

    // === Prompt Template Repository (file-based, no Cosmos dependency) ===
    registerPromptTemplateRepository(container)

    // Shared config tokens
    container.bind<number>(TOKENS.ExitHintDebounceWindowMs).toConstantValue(EXIT_HINT_DEBOUNCE_MS)

    if (config.mode === 'cosmos') {
        bindCosmosPersistence(container, config)
        return container
    }

    assertMemoryModeAllowed(config)
    bindMemoryPersistence(container)
    return container
}
