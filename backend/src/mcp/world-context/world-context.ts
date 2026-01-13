import { app } from '@azure/functions'
import {
    getAtmosphere,
    getLocationContext,
    getPlayerContext,
    getRecentEvents,
    getSpatialContext,
    health
} from '../../handlers/mcp/world-context/world-context.js'

app.mcpTool('WorldContext-health', {
    toolName: 'health',
    description: 'Health check tool for the World Context MCP surface.',
    toolProperties: [],
    handler: health
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
    handler: getLocationContext
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
    handler: getPlayerContext
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
    handler: getAtmosphere
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
    handler: getSpatialContext
})

app.mcpTool('WorldContext-getRecentEvents', {
    toolName: 'get-recent-events',
    description:
        'Get recent events at a location within a time window. Returns timeline sorted chronologically (newest first). Useful for narrative context about recent activity.',
    toolProperties: [
        {
            propertyName: 'locationId',
            propertyType: 'string',
            description: "Optional. Location ID. Defaults to the server's public starter location.",
            isRequired: false
        },
        {
            propertyName: 'timeWindowHours',
            propertyType: 'number',
            description: 'Optional. Time window in hours for event retrieval. Default: 24 hours.',
            isRequired: false
        }
    ],
    handler: getRecentEvents
})
