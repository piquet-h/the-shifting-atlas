import { app } from '@azure/functions'
import { queueProcessWorldEvent } from '../handlers/queueProcessWorldEvent.js'

app.serviceBusQueue('QueueProcessWorldEvent', {
    connection: 'ServiceBusAtlas',
    queueName: 'world-events',
    handler: queueProcessWorldEvent
})
