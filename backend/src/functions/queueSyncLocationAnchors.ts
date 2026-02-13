import { app } from '@azure/functions'
import { queueSyncLocationAnchors } from '../handlers/queueSyncLocationAnchors.js'

app.serviceBusQueue('serviceBusSyncLocationAnchors', {
    connection: 'ServiceBusAtlas',
    queueName: 'location-anchor-sync',
    handler: queueSyncLocationAnchors
})
