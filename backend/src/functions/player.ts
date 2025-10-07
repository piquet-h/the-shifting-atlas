import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { playerBootstrap } from './bootstrapPlayer.js'

// Thin alias endpoint to provide a canonical /api/player entry point for session GUID retrieval.
export async function playerHandler(req: HttpRequest): Promise<HttpResponseInit> {
    return playerBootstrap(req)
}

app.http('player', {
    route: 'player',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: playerHandler
})
