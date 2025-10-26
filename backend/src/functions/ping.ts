import { app } from '@azure/functions'
import { ping } from './ping.handler.js'

app.http('ping', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: ping
})
