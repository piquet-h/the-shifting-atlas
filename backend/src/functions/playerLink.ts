import { app } from '@azure/functions'
import { linkPlayerHandler } from '../handlers/playerLink.js'

app.http('PlayerLink', { route: 'player/link', methods: ['POST'], authLevel: 'anonymous', handler: linkPlayerHandler })
