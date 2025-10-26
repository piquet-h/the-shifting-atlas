import { app } from '@azure/functions'
import { linkPlayerHandler } from '../handlers/playerLink.handler.js'

app.http('playerLink', { route: 'player/link', methods: ['POST'], authLevel: 'anonymous', handler: linkPlayerHandler })
