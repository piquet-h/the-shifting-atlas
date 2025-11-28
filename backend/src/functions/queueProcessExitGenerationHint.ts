import { app } from '@azure/functions'
import { queueProcessExitGenerationHint } from '../handlers/queueProcessExitGenerationHint.js'

app.serviceBusQueue('QueueProcessExitGenerationHint', {
    connection: 'ServiceBusAtlas',
    queueName: 'exit-generation-hints',
    handler: queueProcessExitGenerationHint
})
