import { app } from '@azure/functions'
import { getLocationLookHandler } from '../handlers/locationLook.js'

// GET /api/location (no param) - Returns starter location via LocationLookHandler fallback
app.http('LocationGet', { route: 'location', methods: ['GET'], authLevel: 'anonymous', handler: getLocationLookHandler })
