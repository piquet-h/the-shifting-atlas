import { app } from '@azure/functions'
import { getPlayerHandler } from '../handlers/playerGet.js'

app.http('PlayerGet', {
    route: 'player/{playerId}',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getPlayerHandler
})
