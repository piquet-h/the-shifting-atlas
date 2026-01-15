import { app } from '@azure/functions'
import { getCanonicalFact, searchLore } from '../../handlers/mcp/lore-memory/lore-memory.js'
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
    handler: wrapMcpToolHandler({
        toolName: 'get-canonical-fact',
        handler: getCanonicalFact,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
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
    handler: wrapMcpToolHandler({
        toolName: 'search-lore',
        handler: searchLore,
        allowedClientAppIds: parseCsvEnv('MCP_ALLOWED_CLIENT_APP_IDS')
    })
})
