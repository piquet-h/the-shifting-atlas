import { app } from '@azure/functions'
import { getLocationLookHandler } from '../handlers/locationLook.js'

// LOOK command: Returns location description + exits summary cache (regenerates if missing)
app.http('LocationLook', {
    route: 'location/{locationId}',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getLocationLookHandler
})
