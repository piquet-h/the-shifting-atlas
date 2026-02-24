import { app } from '@azure/functions'
import { generateAreaHandler } from '../handlers/generateArea.js'

/**
 * HTTP endpoint to trigger context-driven, budgeted area generation.
 * POST /api/world/generate-area
 */
app.http('HttpGenerateArea', {
    route: 'world/generate-area',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: generateAreaHandler
})
