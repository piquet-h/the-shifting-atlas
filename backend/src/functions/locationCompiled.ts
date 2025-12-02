import { app } from '@azure/functions'
import { getLocationCompiledHandler } from '../handlers/locationCompiled.js'

// GET /api/locations/{locationId}/compiled - Returns compiled description with layers
app.http('LocationCompiled', {
    route: 'locations/{locationId}/compiled',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getLocationCompiledHandler
})
