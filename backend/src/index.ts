import { app, PreInvocationContext } from '@azure/functions'
import appInsights from 'applicationinsights'
import { Container } from 'inversify'
import { setupContainer } from './inversify.config.js'

const container = new Container()

app.hook.appStart(() => {
    appInsights.setup().start()

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

    setupContainer(container)

    const endTime = Date.now()
    const duration = endTime - startTime
    appInsights.defaultClient.trackMetric({ name: 'ContainerSetupDuration', value: duration })
})

app.hook.preInvocation((context: PreInvocationContext) => {
    context.invocationContext.extraInputs.set('container', container)
})
