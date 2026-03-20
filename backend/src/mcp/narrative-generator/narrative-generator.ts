import { app } from '@azure/functions'
import { generateAmbience, health } from '../../handlers/mcp/narrative-generator/narrative-generator.js'

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
