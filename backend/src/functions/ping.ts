import { app } from '@azure/functions'
import { ping } from '../handlers/ping.js'

app.http('ping', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: ping
})
