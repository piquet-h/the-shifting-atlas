import { app } from '@azure/functions'
import { createPlayerHandler } from './playerCreate.handler.js'

app.http('PlayerCreate', {
    route: 'player/create',
    methods: ['POST', 'GET'], // allow GET for simplicity during MVP
    authLevel: 'anonymous',
    handler: createPlayerHandler
})
