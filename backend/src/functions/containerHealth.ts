import { app } from '@azure/functions'
import { containerHealth } from '../handlers/containerHealth.js'

app.http('BackendContainerHealth', {
    route: 'backend/health/container',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: containerHealth
})
