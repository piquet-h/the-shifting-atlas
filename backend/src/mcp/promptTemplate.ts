import {getTemplate, listTemplates} from '@atlas/shared'
import {app, HttpRequest, HttpResponseInit} from '@azure/functions'

/*
 * MCP Server: prompt-template (Phase 0 Stub)
 * Route: /mcp/prompt-template
 *  - list:   /mcp/prompt-template?op=list
 *  - get:    /mcp/prompt-template?op=get&name=<templateName>
 */

export async function promptTemplateHandler(req: HttpRequest): Promise<HttpResponseInit> {
    const op = req.query.get('op') || 'list'
    if (op === 'list') {
        return json(200, {templates: listTemplates()})
    }
    if (op === 'get') {
        const name = req.query.get('name') || ''
        const tpl = name ? getTemplate(name) : undefined
        if (!tpl) return json(404, {error: 'Template not found', name})
        return json(200, {template: tpl})
    }
    return json(400, {error: 'Unsupported op'})
}

function json(status: number, body: unknown): HttpResponseInit {
    return {status, jsonBody: body, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}}
}

app.http('McpPromptTemplate', {
    route: 'mcp/prompt-template',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: promptTemplateHandler
})
