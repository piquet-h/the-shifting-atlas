import { app } from '@azure/functions'
import { gremlinHealth } from '../handlers/gremlinHealth.js'

app.http('HttpGremlinHealth', {
    route: 'backend/health/gremlin',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: gremlinHealth
})
