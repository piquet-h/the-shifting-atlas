import { app } from '@azure/functions'
import { backendHealth } from '../handlers/health.handler.js'
import { backendPing } from '../handlers/ping-simple.js'

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
