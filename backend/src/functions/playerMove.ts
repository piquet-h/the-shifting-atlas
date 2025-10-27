import { app } from '@azure/functions'
import { handlePlayerMove } from '../handlers/player-move.js'

app.http('PlayerMove', {
    route: 'player/move',
    methods: ['POST', 'GET'],
    authLevel: 'anonymous',
    handler: handlePlayerMove
})
