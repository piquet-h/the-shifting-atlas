import { app } from '@azure/functions'
import { queueProcessWorldEvent } from '../handlers/queueProcessWorldEvent.js'

app.serviceBusQueue('QueueProcessWorldEvent', {
    connection: 'SERVICEBUS_CONNECTION',
    queueName: 'world-events',
    handler: queueProcessWorldEvent
})
