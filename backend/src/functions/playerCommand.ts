import { app } from '@azure/functions'
import { handleResolvePlayerCommand } from '../handlers/resolvePlayerCommand.js'

app.http('ResolvePlayerCommand', {
    route: 'player/command',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: handleResolvePlayerCommand
})
