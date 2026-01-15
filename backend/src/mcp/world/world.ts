import { app } from '@azure/functions'
import { getLocation, listExits } from '../../handlers/mcp/world/world.js'
import { wrapMcpToolHandler } from '../auth/mcpAuth.js'

function parseCsvEnv(name: string): string[] | undefined {
    const raw = process.env[name]
    if (!raw) return undefined
    const parts = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
    return parts.length > 0 ? parts : undefined
}

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
    handler: wrapMcpToolHandler({
        toolName: 'get-location',
        handler: getLocation,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
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
    handler: wrapMcpToolHandler({
        toolName: 'list-exits',
        handler: listExits,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
})
