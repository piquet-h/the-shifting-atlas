// Tracing MUST be initialized first
import { app, PreInvocationContext } from '@azure/functions'
// OpenTelemetry instrumentation removed – consolidated on Application Insights only.
// Import order matters: initialize App Insights before any user code for auto-collection.
import appInsights from 'applicationinsights'
import { Container } from 'inversify'
import { setupContainer } from './inversify.config.js'

const container = new Container()

// Ensure container setup completes before any function invocation.
// Previously this hook was synchronous and did not await the async setupContainer call,
// causing a race where handler/repository bindings might be missing on first invocation
// (e.g. Functions.player alias to bootstrap) leading to FunctionInvocationException.
app.hook.appStart(async () => {
    // Initialize Application Insights auto collection (requests, dependencies, exceptions, performance)
    appInsights.setup().start()

    // Sampling configuration (issue #315): environment-driven percentage.
    // Accept either whole number (e.g. 15) or ratio (e.g. 0.15) via several possible variable names.
    const samplingEnv =
        process.env.APPINSIGHTS_SAMPLING_PERCENTAGE ||
        process.env.APPINSIGHTS_SAMPLING_PERCENT ||
        process.env.APP_INSIGHTS_SAMPLING_PERCENT ||
        process.env.APP_INSIGHTS_SAMPLING_RATIO
    let samplingPercentage = 15 // default proposed 15% (0.15)
    if (samplingEnv) {
        let raw = parseFloat(samplingEnv)
        if (!Number.isNaN(raw)) {
            // If value looks like a ratio (<=1), convert to percent
            if (raw > 0 && raw <= 1) raw = raw * 100
            samplingPercentage = Math.min(100, Math.max(0, raw))
        }
    }
    try {
        appInsights.defaultClient.config.samplingPercentage = samplingPercentage
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

    const startTime = Date.now()

    try {
        await setupContainer(container)
    } catch (error) {
        // Log and emit metric so cold start failures are diagnosable

        console.error('Container setup failed', error)
        try {
            appInsights.defaultClient.trackException({ exception: error as Error })
        } catch {
            // swallow
        }
    }

    const endTime = Date.now()
    const duration = endTime - startTime
    appInsights.defaultClient.trackMetric({ name: 'ContainerSetupDuration', value: duration })
})

app.hook.preInvocation((context: PreInvocationContext) => {
    context.invocationContext.extraInputs.set('container', container)
})
