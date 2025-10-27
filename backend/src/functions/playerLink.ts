import { app } from '@azure/functions'
import { linkPlayerHandler } from '../handlers/player-link.js'

app.http('playerLink', { route: 'player/link', methods: ['POST'], authLevel: 'anonymous', handler: linkPlayerHandler })
