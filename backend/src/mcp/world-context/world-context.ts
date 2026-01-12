import { app } from '@azure/functions'
import { getAtmosphere, getLocationContext, getPlayerContext, health } from '../../handlers/mcp/world-context/world-context.js'

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
