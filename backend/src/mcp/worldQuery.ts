import { app } from '@azure/functions'
import { worldQueryHandler } from '../handlers/mcp/worldQuery.js'

app.mcpTool('World-getLocation', {
    toolName: 'Get location',
    description:
        "Get the state of the game world at the given location. If `locationId` is omitted the handler returns the server's public starter location (stateless fallback). The handler does not resolve session/player context.",
    toolProperties: [
        {
            propertyName: 'locationId',
            propertyType: 'string',
            description:
                "Optional. The ID of the location to query. If omitted the handler returns the server's public starter location (stateless fallback). Do not rely on server-side session/player resolution.",
            isRequired: false
        }
    ],
    handler: worldQueryHandler
})
