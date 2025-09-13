import functionsPkg from '@azure/functions'
const { app } = functionsPkg
import healthHandler from './HealthCheck/index.js'
import httpPlayerActionsHandler from './HttpPlayerActions/index.js'

app.http('WebsiteHealthCheck', {
    route: 'website/health',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        return await healthHandler(context, request)
    }
})

app.http('WebsiteHttpPlayerActions', {
    route: 'website/player/actions',
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        return await httpPlayerActionsHandler(context, request)
    }
})

export default app
