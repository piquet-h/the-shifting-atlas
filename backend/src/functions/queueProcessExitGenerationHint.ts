import { app } from '@azure/functions'
import { queueProcessExitGenerationHint } from '../handlers/queueProcessExitGenerationHint.js'

app.serviceBusQueue('serviceBusProcessExitGenerationHint', {
    connection: 'ServiceBusAtlas',
    queueName: 'exit-generation-hints',
    handler: queueProcessExitGenerationHint
})
