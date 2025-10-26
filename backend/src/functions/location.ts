import { app } from '@azure/functions'
import { getLocationHandler } from '../handlers/location.handler.js'

app.http('LocationGet', { route: 'location', methods: ['GET'], authLevel: 'anonymous', handler: getLocationHandler })
