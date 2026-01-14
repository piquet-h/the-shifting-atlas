// Import first to enable InversifyJS decorator metadata
import { app, PreInvocationContext } from '@azure/functions'
import appInsights from 'applicationinsights'
import { Container } from 'inversify'
import 'reflect-metadata'
import { TOKENS } from './di/tokens.js'
import type { IGremlinClient } from './gremlin/gremlinClient.js'
import { setupContainer } from './inversify.config.js'
import type { ITelemetryClient } from './telemetry/ITelemetryClient.js'
// Minimal declaration for early type access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any

const container = new Container()

// Ensure container setup completes before any invocation
app.hook.appStart(async () => {
    // Initialize telemetry only in cosmos mode
    const persistenceMode = (process.env.PERSISTENCE_MODE || 'memory').toLowerCase()
    const isCosmosMode = persistenceMode === 'cosmos'

    if (isCosmosMode) {
        appInsights.setup().start()

        // Sampling: read percentage or ratio from env
        const samplingEnv = process.env.APPINSIGHTS_SAMPLING_PERCENTAGE

        // Defaults: 100% dev/test, 15% prod
        const nodeEnv = (process.env.NODE_ENV || 'production').toLowerCase()
        const isDevelopment = nodeEnv === 'development' || nodeEnv === 'test'
        const defaultSampling = isDevelopment ? 100 : 15

        let samplingPercentage = defaultSampling
        let configAdjusted = false
        let adjustmentReason = ''

        if (samplingEnv) {
            const raw = parseFloat(samplingEnv)
            if (Number.isNaN(raw)) {
                configAdjusted = true
                adjustmentReason = 'non-numeric value'
            } else {
                let normalized = raw
                if (raw > 0 && raw <= 1) {
                    normalized = raw * 100
                }
                const clamped = Math.min(100, Math.max(0, normalized))
                if (clamped !== normalized) {
                    configAdjusted = true
                    adjustmentReason = 'out-of-range value clamped'
                }
                samplingPercentage = clamped
            }
        }

        try {
            appInsights.defaultClient.config.samplingPercentage = samplingPercentage

            if (configAdjusted) {
                appInsights.defaultClient.trackEvent({
                    name: 'Telemetry.Sampling.ConfigAdjusted',
                    properties: {
                        requestedValue: samplingEnv,
                        appliedPercentage: samplingPercentage,
                        reason: adjustmentReason,
                        defaultSampling,
                        nodeEnv
                    }
                })
            }
        } catch {
            // ignore
        }

        // Drop bot/probe requests
        try {
            const client = appInsights.defaultClient
            if (client && typeof client.addTelemetryProcessor === 'function') {
                const patterns = ['.env', '.php', '/.git/', 'phpinfo', '/test.php', '/config/', '/_profiler']
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client.addTelemetryProcessor((envelope: any) => {
                    try {
                        const baseData = envelope && envelope.data && envelope.data.baseData
                        const url = ((baseData && (baseData.url || baseData.name)) || '').toLowerCase()
                        for (const p of patterns) {
                            if (url.includes(p)) return false
                        }
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    } catch (_error) {
                        // ignore
                    }
                    return true
                })
            }
        } catch (error: unknown) {
            console.error('Failed to add telemetry processor', error)
        }
    } else {
        console.log('[startup] Memory mode detected - skipping Application Insights initialization')
    }

    const startTime = Date.now()

    try {
        await setupContainer(container)
    } catch (error) {
        console.error('Container setup failed', error)
        if (isCosmosMode) {
            try {
                appInsights.defaultClient.trackException({ exception: error as Error })
            } catch {
                // swallow
            }
        }
    }

    const endTime = Date.now()
    const duration = endTime - startTime

    if (isCosmosMode) {
        appInsights.defaultClient.trackMetric({ name: 'ContainerSetupDuration', value: duration })

        try {
            const telemetryClient = container.get<ITelemetryClient>(TOKENS.TelemetryClient)
            const { getFeatureFlagSnapshot, getValidationWarnings } = await import('./config/featureFlags.js')
            const flagSnapshot = getFeatureFlagSnapshot()

            telemetryClient.trackEvent({
                name: 'FeatureFlag.Loaded',
                properties: flagSnapshot
            })

            const warnings = getValidationWarnings()
            for (const warning of warnings) {
                telemetryClient.trackEvent({
                    name: 'FeatureFlag.ValidationWarning',
                    properties: {
                        flagName: warning.flagName,
                        rawValue: warning.rawValue,
                        defaultValue: warning.defaultValue.toString()
                    }
                })
            }
        } catch (error) {
            console.warn('[startup] Failed to log feature flags', error)
        }
    } else {
        console.log(`[startup] Container setup completed in ${duration}ms`)

        try {
            const { getFeatureFlagSnapshot } = await import('./config/featureFlags.js')
            const flagSnapshot = getFeatureFlagSnapshot()
            console.log('[startup] Feature flags:', flagSnapshot)
        } catch (error) {
            console.warn('[startup] Failed to log feature flags', error)
        }
    }

    // Register graceful shutdown hooks
    const registerShutdown = () => {
        const performShutdown = async (signal: string) => {
            try {
                const telemetry = container.get<ITelemetryClient>(TOKENS.TelemetryClient)
                telemetry.flush({ isAppCrashing: signal === 'SIGINT' || signal === 'SIGTERM' })
            } catch {
                // swallow
            }
            try {
                const gremlin = container.get<IGremlinClient>(TOKENS.GremlinClient)
                await gremlin.close()
            } catch {
                // swallow
            }
        }
        for (const sig of ['SIGINT', 'SIGTERM']) {
            process.once(sig, () => {
                void performShutdown(sig)
            })
        }
        process.once('beforeExit', () => {
            try {
                const telemetry = container.get<ITelemetryClient>(TOKENS.TelemetryClient)
                telemetry.flush()
            } catch {
                // ignore
            }
        })
    }
    registerShutdown()
})

app.hook.preInvocation((context: PreInvocationContext) => {
    context.invocationContext.extraInputs.set('container', container)
})

app.setup({
    enableHttpStream: true
})
