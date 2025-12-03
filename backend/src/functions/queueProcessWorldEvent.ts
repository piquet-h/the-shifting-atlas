import { app } from '@azure/functions'
import { queueProcessWorldEvent } from '../worldEvents/queueProcessWorldEvent.js'

app.serviceBusQueue('queueProcessWorldEvent', {
    connection: 'ServiceBusAtlas',
    queueName: 'world-events',
    handler: queueProcessWorldEvent
})
