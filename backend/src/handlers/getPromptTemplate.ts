/**
 * GetPromptTemplate Handler
 *
 * HTTP handler for retrieving prompt templates by id, version, or hash.
 * Supports ETag-based caching with 304 Not Modified responses.
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { IPromptTemplateRepository } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, okResponse } from './utils/responseBuilder.js'

@injectable()
export class GetPromptTemplateHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('IPromptTemplateRepository') private promptRepo: IPromptTemplateRepository
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Extract template id from path parameter
        const id = req.params.id
        if (!id) {
            this.recordNormalizedError('PromptTemplate.Get', 'MissingTemplateId', 'Template id required in path', 400)
            return errorResponse(400, 'MissingTemplateId', 'Template id required in path', {
                correlationId: this.correlationId
            })
        }

        // Get query parameters
        const version = req.query.get('version') || undefined
        const hash = req.query.get('hash') || undefined

        // Check for conflicting parameters
        if (version && hash) {
            this.recordNormalizedError(
                'PromptTemplate.Get',
                'ConflictingParameters',
                'Cannot specify both version and hash parameters',
                400
            )
            return errorResponse(400, 'ConflictingParameters', 'Cannot specify both version and hash parameters', {
                correlationId: this.correlationId
            })
        }

        // Retrieve template
        const template = await this.promptRepo.get({ id, version, hash })

        if (!template) {
            this.track('PromptTemplate.Get', { templateId: id, version, hash, status: 404 })
            return errorResponse(404, 'NotFound', `Template '${id}' not found`, {
                correlationId: this.correlationId
            })
        }

        // Check If-None-Match header for ETag support
        const ifNoneMatch = req.headers.get('if-none-match')
        if (ifNoneMatch && ifNoneMatch === template.hash) {
            // Content hasn't changed, return 304 Not Modified
            this.track('PromptTemplate.Get', {
                templateId: id,
                version: template.version,
                hash: template.hash,
                status: 304,
                cached: true
            })
            return {
                status: 304,
                headers: {
                    ETag: template.hash,
                    'x-correlation-id': this.correlationId
                }
            }
        }

        // Return template with ETag
        this.track('PromptTemplate.Get', {
            templateId: id,
            version: template.version,
            hash: template.hash,
            status: 200
        })

        return okResponse(template, {
            correlationId: this.correlationId,
            additionalHeaders: {
                ETag: template.hash,
                'Cache-Control': 'public, max-age=300' // 5 minutes
            }
        })
    }
}

export async function getPromptTemplateHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(GetPromptTemplateHandler)
    return handler.handle(req, context)
}
