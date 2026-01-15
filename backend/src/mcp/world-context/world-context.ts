import { app } from '@azure/functions'
import {
    getAtmosphere,
    getLocationContext,
    getPlayerContext,
    getRecentEvents,
    getSpatialContext,
    health
} from '../../handlers/mcp/world-context/world-context.js'
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

app.mcpTool('WorldContext-health', {
    toolName: 'health',
    description: 'Health check tool for the World Context MCP surface.',
    toolProperties: [],
    handler: wrapMcpToolHandler({
        toolName: 'health',
        handler: health,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
})

app.mcpTool('WorldContext-getLocationContext', {
    toolName: 'get-location-context',
    description:
        "Assemble lightweight location context for agent prompts: location + exits + realms + ambient summary. If locationId is omitted the handler returns the server's public starter location.",
    toolProperties: [
        {
            propertyName: 'locationId',
            propertyType: 'string',
            description: "Optional. Location ID. Defaults to the server's public starter location.",
            isRequired: false
        },
        {
            propertyName: 'tick',
            propertyType: 'number',
            description: 'Optional. World clock tick used to resolve temporal layers. Defaults to current world tick.',
            isRequired: false
        }
    ],
    handler: wrapMcpToolHandler({
        toolName: 'get-location-context',
        handler: getLocationContext,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
})

app.mcpTool('WorldContext-getPlayerContext', {
    toolName: 'get-player-context',
    description:
        'Assemble player context for agent prompts: player document + current location (best-effort) + inventory + recent actions (player-scoped events).',
    toolProperties: [
        {
            propertyName: 'playerId',
            propertyType: 'string',
            description: 'Required. Player ID (GUID).',
            isRequired: true
        },
        {
            propertyName: 'tick',
            propertyType: 'number',
            description: 'Optional. World clock tick used for temporal resolution. Defaults to current world tick.',
            isRequired: false
        }
    ],
    handler: wrapMcpToolHandler({
        toolName: 'get-player-context',
        handler: getPlayerContext,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
})

app.mcpTool('WorldContext-getAtmosphere', {
    toolName: 'get-atmosphere',
    description: 'Get atmosphere context at a location: time-of-day label + weather/lighting/ambient layers (with defaults if missing).',
    toolProperties: [
        {
            propertyName: 'locationId',
            propertyType: 'string',
            description: "Optional. Location ID. Defaults to the server's public starter location.",
            isRequired: false
        },
        {
            propertyName: 'tick',
            propertyType: 'number',
            description: 'Optional. World clock tick used to resolve temporal layers. Defaults to current world tick.',
            isRequired: false
        }
    ],
    handler: wrapMcpToolHandler({
        toolName: 'get-atmosphere',
        handler: getAtmosphere,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
})

app.mcpTool('WorldContext-getSpatialContext', {
    toolName: 'get-spatial-context',
    description:
        'Get spatial graph context: N-hop neighbors from the location graph. Returns neighboring locations up to a configurable depth (default: 2 hops, max: 5 hops).',
    toolProperties: [
        {
            propertyName: 'locationId',
            propertyType: 'string',
            description: "Optional. Location ID. Defaults to the server's public starter location.",
            isRequired: false
        },
        {
            propertyName: 'depth',
            propertyType: 'number',
            description: 'Optional. Graph traversal depth in hops (1-5). Default: 2. Values >5 will be clamped to 5.',
            isRequired: false
        }
    ],
    handler: wrapMcpToolHandler({
        toolName: 'get-spatial-context',
        handler: getSpatialContext,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
})

app.mcpTool('WorldContext-getRecentEvents', {
    toolName: 'get-recent-events',
    description:
        'Get recent events for a location or player scope. Returns event summaries sorted chronologically (newest first). Useful for narrative context about recent activity.',
    toolProperties: [
        {
            propertyName: 'scope',
            propertyType: 'string',
            description: 'Required. Scope type: "location" or "player".',
            isRequired: true
        },
        {
            propertyName: 'scopeId',
            propertyType: 'string',
            description: 'Required. Scope ID (location ID or player ID).',
            isRequired: true
        },
        {
            propertyName: 'limit',
            propertyType: 'number',
            description: 'Optional. Maximum number of events to return. Default: 20, max: 100.',
            isRequired: false
        }
    ],
    handler: wrapMcpToolHandler({
        toolName: 'get-recent-events',
        handler: getRecentEvents,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
})
