import { app } from '@azure/functions'
import { bootstrapPlayerHandler } from '../handlers/bootstrap-player.js'

/**
 * Player Bootstrap (migrated from legacy SWA managed API)
 * Route: GET /api/player/bootstrap
 * Behavior: Idempotently returns an existing guest player GUID or creates a new one.
 * Migration Notes: This logic previously lived in `frontend/api/src/functions/playerBootstrap.ts` and is now
 * the authoritative backend implementation. The SWA managed API has been deprecated.
 */
app.http('playerBootstrap', {
    route: 'player/bootstrap',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: bootstrapPlayerHandler
})
