import { app } from '@azure/functions'
import { getCanonicalFact, searchLore } from '../../handlers/mcp/lore-memory/lore-memory.js'

app.mcpTool('Lore-getCanonicalFact', {
    toolName: 'get-canonical-fact',
    description: 'Get a canonical lore fact by its business identifier (factId). Returns null when not found.',
    toolProperties: [
        {
            propertyName: 'factId',
            propertyType: 'string',
            description: 'Required. Unique business identifier, e.g., faction_shadow_council',
            isRequired: true
        }
    ],
    handler: getCanonicalFact
})

app.mcpTool('Lore-searchLore', {
    toolName: 'search-lore',
    description: 'Search canonical lore facts. Currently returns empty array until semantic search is implemented.',
    toolProperties: [
        {
            propertyName: 'query',
            propertyType: 'string',
            description: 'Required. Natural language query text',
            isRequired: true
        },
        {
            propertyName: 'k',
            propertyType: 'number',
            description: 'Optional. Max number of results (default: 5)',
            isRequired: false
        }
    ],
    handler: searchLore
})
