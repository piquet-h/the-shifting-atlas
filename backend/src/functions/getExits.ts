import { app } from '@azure/functions'
import { getExitsHandler } from '../handlers/get-exits.js'

/**
 * HTTP endpoint to get all exits from a location.
 * GET /api/location/exits?locationId=<id>
 */
app.http('HttpGetExits', {
    route: 'location/exits',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getExitsHandler
})
