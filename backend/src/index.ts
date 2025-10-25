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
            client.addTelemetryProcessor((envelope: any) => {
                try {
                    const baseData = envelope && envelope.data && envelope.data.baseData
                    const url = ((baseData && (baseData.url || baseData.name)) || '').toLowerCase()
                    for (const p of patterns) {
                        if (url.includes(p)) return false
                    }
                } catch (e) {}
                return true
            })
        }
    } catch (e: unknown) {
        console.error('Failed to add telemetry processor', e)
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
