import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { formatError } from '../http/errorEnvelope.js'
import { getTemplate, listTemplates } from '../prompts/index.js'
import { extractCorrelationId } from '../telemetry/TelemetryService.js'

/*
 * MCP Server: prompt-template (Phase 0 Stub)
 * Route: /mcp/prompt-template
 *  - list:   /mcp/prompt-template?op=list
 *  - get:    /mcp/prompt-template?op=get&name=<templateName>
 */

export async function promptTemplateHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const correlationId = extractCorrelationId(req.headers)
    const op = req.query.get('op') || 'list'
    if (op === 'list') {
        return json(200, { templates: listTemplates() }, correlationId)
    }
    if (op === 'get') {
        const name = req.query.get('name') || ''
        const tpl = name ? getTemplate(name) : undefined
        if (!tpl) return jsonError(404, 'NotFound', 'Template not found', correlationId)
        return json(200, { template: tpl }, correlationId)
    }
    return jsonError(400, 'UnsupportedOperation', 'Unsupported op', correlationId)
}

function json(status: number, body: unknown, correlationId?: string): HttpResponseInit {
    return {
        status,
        jsonBody: { success: true, data: body, correlationId },
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    }
}

function jsonError(status: number, code: string, message: string, correlationId?: string): HttpResponseInit {
    return {
        status,
        jsonBody: formatError(code, message, correlationId),
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    }
}

app.http('McpPromptTemplate', {
    route: 'mcp/prompt-template',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: promptTemplateHandler
})
