import { app } from '@azure/functions'
import { ping } from '../handlers/ping.js'

app.http('Ping', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: ping
})
