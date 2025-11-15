// reflect-metadata MUST be imported first for InversifyJS decorator metadata to work
import 'reflect-metadata'
// Telemetry MUST be initialized second (Application Insights auto-collection before any user code)
import { app, PreInvocationContext } from '@azure/functions'
// Lightweight declaration to satisfy type checker if Node types resolution is delayed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const process: any
// Import order matters: initialize App Insights before any user code for auto-collection.
import appInsights from 'applicationinsights'
import { Container } from 'inversify'
import type { IGremlinClient } from './gremlin/gremlinClient.js'
import { setupContainer } from './inversify.config.js'
import type { ITelemetryClient } from './telemetry/ITelemetryClient.js'

const container = new Container()

// Ensure container setup completes before any function invocation.
// Previously this hook was synchronous and did not await the async setupContainer call,
// causing a race where handler/repository bindings might be missing on first invocation
// (e.g. Functions.player alias to bootstrap) leading to FunctionInvocationException.
app.hook.appStart(async () => {
    // Determine persistence mode early to conditionally initialize Application Insights
    const persistenceMode = (process.env.PERSISTENCE_MODE || 'memory').toLowerCase()
    const isCosmosMode = persistenceMode === 'cosmos'

    // Initialize Application Insights only in cosmos mode (production/staging)
    // In memory mode (local dev), skip initialization to avoid overhead and network calls
    if (isCosmosMode) {
        appInsights.setup().start()

        // Sampling configuration (issue #315): environment-driven percentage.
        // Accept either whole number (e.g. 15) or ratio (e.g. 0.15) via several possible variable names.
        const samplingEnv = process.env.APPINSIGHTS_SAMPLING_PERCENTAGE

        // Environment-based default: 100% for dev/test, 15% for production
        const nodeEnv = (process.env.NODE_ENV || 'production').toLowerCase()
        const isDevelopment = nodeEnv === 'development' || nodeEnv === 'test'
        const defaultSampling = isDevelopment ? 100 : 15

        let samplingPercentage = defaultSampling
        let configAdjusted = false
        let adjustmentReason = ''

        if (samplingEnv) {
            const raw = parseFloat(samplingEnv)
            if (Number.isNaN(raw)) {
                // Non-numeric value triggers fallback
                configAdjusted = true
                adjustmentReason = 'non-numeric value'
            } else {
                // If value looks like a ratio (<=1), convert to percent
                let normalized = raw
                if (raw > 0 && raw <= 1) {
                    normalized = raw * 100
                }
                // Clamp to valid range [0..100]
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

            // Emit warning event if configuration was adjusted
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
            // ignore sampling configuration errors
        }

        // add telemetry processor to drop bot/probe requests
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
                        // Ignore telemetry processor errors
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
        // Log and emit metric so cold start failures are diagnosable
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
    } else {
        console.log(`[startup] Container setup completed in ${duration}ms`)
    }

    // Register graceful shutdown hooks AFTER container setup so bindings exist.
    // Azure Functions may recycle processes; we attempt best-effort flush/close on signals.
    const registerShutdown = () => {
        const performShutdown = async (signal: string) => {
            try {
                const telemetry = container.get<ITelemetryClient>('ITelemetryClient')
                telemetry.flush({ isAppCrashing: signal === 'SIGINT' || signal === 'SIGTERM' })
            } catch {
                // swallow – telemetry optional
            }
            try {
                const gremlin = container.get<IGremlinClient>('GremlinClient')
                await gremlin.close()
            } catch {
                // swallow – gremlin may not be bound (memory mode)
            }
        }
        for (const sig of ['SIGINT', 'SIGTERM']) {
            process.once(sig, () => {
                // Fire and forget; Functions host will terminate shortly.
                void performShutdown(sig)
            })
        }
        // beforeExit gives a final opportunity to flush telemetry.
        process.once('beforeExit', () => {
            try {
                const telemetry = container.get<ITelemetryClient>('ITelemetryClient')
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
