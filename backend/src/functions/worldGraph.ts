import { app } from '@azure/functions'
import { getWorldGraphHandler } from '../handlers/worldGraph.js'

/**
 * HTTP endpoint to get the full world location graph.
 * GET /api/world/graph
 * Returns { nodes: WorldGraphNode[], edges: WorldGraphEdge[] }
 */
app.http('HttpWorldGraph', {
    route: 'world/graph',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: getWorldGraphHandler
})
