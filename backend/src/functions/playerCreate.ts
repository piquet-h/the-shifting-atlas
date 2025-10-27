import { app } from '@azure/functions'
import { createPlayerHandler } from '../handlers/player-create.js'

app.http('PlayerCreate', {
    route: 'player/create',
    methods: ['POST', 'GET'], // allow GET for simplicity during MVP
    authLevel: 'anonymous',
    handler: createPlayerHandler
})
