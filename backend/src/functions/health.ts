import { app } from '@azure/functions'
import { backendHealth, backendPing } from './health.handler.js'

app.http('BackendHealth', {
    route: 'backend/health',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: backendHealth
})

app.http('BackendPing', {
    route: 'backend/ping',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: backendPing
})
