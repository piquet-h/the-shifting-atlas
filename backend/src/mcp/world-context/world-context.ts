import { app } from '@azure/functions'
import { health } from '../../handlers/mcp/world-context/world-context.js'

app.mcpTool('WorldContext-health', {
    toolName: 'health',
    description: 'Health check tool for the World Context MCP surface.',
    toolProperties: [],
    handler: health
})
