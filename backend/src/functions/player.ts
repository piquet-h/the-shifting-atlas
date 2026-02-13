import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { bootstrapPlayerHandler } from '../handlers/bootstrapPlayer.js'

// Thin alias endpoint to provide a canonical /api/player entry point for session GUID retrieval.
export async function playerHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    return bootstrapPlayerHandler(req, context)
}

app.http('Player', {
    route: 'player',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: playerHandler
})
