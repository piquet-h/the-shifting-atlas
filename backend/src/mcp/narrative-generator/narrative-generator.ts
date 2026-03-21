import { app } from '@azure/functions'
import { generateAmbience, health, narrateAction, narrateDiscovery } from '../../handlers/mcp/narrative-generator/narrative-generator.js'

app.mcpTool('NarrativeGenerator-health', {
    toolName: 'health',
    description: 'Health check tool for the Narrative Generator MCP surface.',
    toolProperties: [],
    handler: health
})

app.mcpTool('NarrativeGenerator-generateAmbience', {
    toolName: 'generate-ambience',
    description:
        'Generate short ambient narrative text from lightweight context inputs (location, time of day, weather, mood). Foundation mode uses deterministic templates.',
    toolProperties: [
        {
            propertyName: 'locationName',
            propertyType: 'string',
            description: 'Optional. Human-readable location name.',
            isRequired: false
        },
        {
            propertyName: 'timeOfDay',
            propertyType: 'string',
            description: 'Optional. Time-of-day cue such as dawn, dusk, midnight.',
            isRequired: false
        },
        {
            propertyName: 'weather',
            propertyType: 'string',
            description: 'Optional. Weather cue such as fog, drizzle, clear sky.',
            isRequired: false
        },
        {
            propertyName: 'mood',
            propertyType: 'string',
            description: 'Optional. Scene mood cue such as tense, calm, ominous.',
            isRequired: false
        },
        {
            propertyName: 'preferAi',
            propertyType: 'boolean',
            description:
                'Optional. When true (default), attempts AI ambience first with bounded-claim guardrails, then falls back to template mode.',
            isRequired: false
        }
    ],
    handler: generateAmbience
})

app.mcpTool('NarrativeGenerator-narrateAction', {
    toolName: 'narrate-action',
    description:
        'Generate short action narration text for a player action (verb + target + outcome). Read-only; no canonical world changes. Uses deterministic templates with optional AI enrichment.',
    toolProperties: [
        {
            propertyName: 'actionVerb',
            propertyType: 'string',
            description: 'Optional. What the player did, e.g. "examines", "picks up", "kicks".',
            isRequired: false
        },
        {
            propertyName: 'targetName',
            propertyType: 'string',
            description: 'Optional. What was acted upon, e.g. "the rusted torch", "a stone door".',
            isRequired: false
        },
        {
            propertyName: 'locationName',
            propertyType: 'string',
            description: 'Optional. Human-readable location name where the action occurred.',
            isRequired: false
        },
        {
            propertyName: 'outcome',
            propertyType: 'string',
            description: 'Optional. Brief outcome description, e.g. "nothing happens", "the door creaks".',
            isRequired: false
        },
        {
            propertyName: 'preferAi',
            propertyType: 'boolean',
            description:
                'Optional. When true (default), attempts AI narration first with bounded-claim guardrails, then falls back to template mode.',
            isRequired: false
        }
    ],
    handler: narrateAction
})

app.mcpTool('NarrativeGenerator-narrateDiscovery', {
    toolName: 'narrate-discovery',
    description:
        'Generate short discovery narration text when a player finds something new (location, item, passage, detail). Read-only; no canonical world changes. Uses deterministic templates with optional AI enrichment.',
    toolProperties: [
        {
            propertyName: 'discoveryKind',
            propertyType: 'string',
            description: 'Optional. Category of what was discovered, e.g. "location", "item", "passage", "detail".',
            isRequired: false
        },
        {
            propertyName: 'subjectName',
            propertyType: 'string',
            description: 'Optional. Name or description of the discovered thing, e.g. "a narrow crack in the wall".',
            isRequired: false
        },
        {
            propertyName: 'locationName',
            propertyType: 'string',
            description: 'Optional. Human-readable location name where the discovery was made.',
            isRequired: false
        },
        {
            propertyName: 'preferAi',
            propertyType: 'boolean',
            description:
                'Optional. When true (default), attempts AI narration first with bounded-claim guardrails, then falls back to template mode.',
            isRequired: false
        }
    ],
    handler: narrateDiscovery
})
