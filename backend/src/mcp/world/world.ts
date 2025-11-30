import { app } from '@azure/functions'
import { getLocation, listExits } from '../../handlers/mcp/world/world.js'

app.mcpTool('World-getLocation', {
    toolName: 'get-location',
    description:
        "Get the state of the game world at the given location. If locationId is omitted the handler returns the server's public starter location",
    toolProperties: [
        {
            propertyName: 'locationId',
            propertyType: 'string',
            description: "Optional. The ID of the location to query. If omitted the handler returns the server's public starter location.",
            isRequired: false
        }
    ],
    handler: getLocation
})

app.mcpTool('World-listExits', {
    toolName: 'list-exits',
    description: "List the exits at the given location. If locationId is omitted the handler returns the server's public starter location.",
    toolProperties: [
        {
            propertyName: 'locationId',
            propertyType: 'string',
            description:
                "Optional. The ID of the location whose exits to list. If omitted the handler returns the server's public starter location.",
            isRequired: false
        }
    ],
    handler: listExits
})
