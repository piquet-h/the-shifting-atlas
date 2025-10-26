import { app } from '@azure/functions'
import { getExitsHandler } from '../handlers/getExits.handler.js'

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
