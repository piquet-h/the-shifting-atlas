import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { playerBootstrap } from './playerBootstrap.js'

// Thin alias endpoint to provide a canonical /api/player entry point for session GUID retrieval.
export async function playerHandler(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
    // Delegate to bootstrap logic (idempotent behavior). Client may optionally send x-player-guid header.
    return playerBootstrap(req)
}

app.http('player', {
    route: 'player',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: playerHandler
})
