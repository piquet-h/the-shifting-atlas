import { app } from '@azure/functions'
import { queueProcessWorldEvent } from '../worldEvents/queueProcessWorldEvent.js'

app.serviceBusQueue('serviceBusProcessWorldEvent', {
    connection: 'ServiceBusAtlas',
    queueName: 'world-events',
    handler: queueProcessWorldEvent
})
