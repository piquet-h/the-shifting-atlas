import { app } from '@azure/functions'
import { linkRoomsHandler } from '../handlers/linkRooms.js'

/**
 * HTTP endpoint to link two rooms with an EXIT edge.
 * POST /api/location/link-rooms
 */
app.http('HttpLinkRooms', {
    route: 'location/link-rooms',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: linkRoomsHandler
})
