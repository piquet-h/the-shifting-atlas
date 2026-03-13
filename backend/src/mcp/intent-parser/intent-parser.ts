import { app } from '@azure/functions'
import { parseCommand } from '../../handlers/mcp/intent-parser/intent-parser.js'

app.mcpTool('IntentParser-parseCommand', {
    toolName: 'parse-command',
    description:
        'Parse a raw player command string into a structured ParsedCommand with ordered Intent[] array. ' +
        'Uses heuristic regex/keyword extraction (PI-0 — no AI). ' +
        'Returns intents with confidence scores and any flagged ambiguities. ' +
        'Maximum input length: 500 characters.',
    toolProperties: [
        {
            propertyName: 'text',
            propertyType: 'string',
            description: 'Required. The raw player command text to parse (max 500 chars).',
            isRequired: true
        },
        {
            propertyName: 'playerId',
            propertyType: 'string',
            description: 'Optional. Player ID for telemetry correlation.',
            isRequired: false
        },
        {
            propertyName: 'locationId',
            propertyType: 'string',
            description: 'Optional. Current location ID for contextual telemetry.',
            isRequired: false
        }
    ],
    handler: parseCommand
})
