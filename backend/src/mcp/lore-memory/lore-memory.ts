import { app } from '@azure/functions'
import { getCanonicalFact, searchLore } from '../../handlers/mcp/lore-memory/lore-memory.js'

app.mcpTool('Lore-getCanonicalFact', {
    toolName: 'get-canonical-fact',
    description:
        'Get the latest non-archived version of a canonical lore fact by its business identifier (factId). ' +
        'Returns the highest version number among active (non-archived) versions. ' +
        'Returns null when not found or when all versions are archived.',
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
    description:
        'Search canonical lore facts and return ranked snippets. ' +
        'Returns LoreSearchResult[] with {factId, type, score, snippet, version?} shape. ' +
        'Currently returns empty array until semantic search is implemented. ' +
        'For full structured fact JSON, use get-canonical-fact tool.',
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
            description: 'Optional. Max number of results (default: 5, max: 20)',
            isRequired: false
        }
    ],
    handler: searchLore
})
