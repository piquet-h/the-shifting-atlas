import { app } from '@azure/functions'
import { getPlayerHandler } from './playerGet.handler.js'

app.http('PlayerGet', {
    route: 'player/get',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getPlayerHandler
})
