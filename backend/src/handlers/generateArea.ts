/**
 * Generate Area Handler
 *
 * HTTP POST /api/world/generate-area
 *
 * Triggers the area generation orchestrator to produce a bounded, coherent
 * chunk of new topology starting from (or near) a given anchor location.
 *
 * Request body (JSON):
 * {
 *   anchorLocationId?: string   // omit to use world starter location
 *   mode: 'urban'|'wilderness'|'auto'
 *   budgetLocations: number     // 1–20 (clamped to MAX_BUDGET_LOCATIONS)
 *   realmHints?: string[]       // optional narrative realm hints
 *   idempotencyKey?: string     // optional; stable key prevents duplicate expansion
 * }
 *
 * Response (200):
 * { success: true, data: { enqueuedCount, anchorLocationId, terrain, idempotencyKey, clamped } }
 */

import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { errorResponse, internalErrorResponse, okResponse } from './utils/responseBuilder.js'
import { isValidGuid } from './utils/validation.js'
import {
    AreaGenerationOrchestrator,
    LocationNotFoundError,
    MAX_BUDGET_LOCATIONS,
    type AreaGenerationMode
} from '../services/AreaGenerationOrchestrator.js'

const VALID_MODES: readonly AreaGenerationMode[] = ['urban', 'wilderness', 'auto']

function isAreaGenerationMode(value: unknown): value is AreaGenerationMode {
    return typeof value === 'string' && (VALID_MODES as string[]).includes(value)
}

@injectable()
export class GenerateAreaHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject(AreaGenerationOrchestrator) private orchestrator: AreaGenerationOrchestrator
    ) {
        super(telemetry)
    }

    protected async execute(req: HttpRequest): Promise<HttpResponseInit> {
        // Parse body
        let body: Record<string, unknown>
        try {
            const text = await req.text()
            body = text ? (JSON.parse(text) as Record<string, unknown>) : {}
        } catch {
            return errorResponse(400, 'InvalidJson', 'Request body must be valid JSON', {
                correlationId: this.correlationId
            })
        }

        // Validate anchorLocationId (optional)
        const anchorLocationId =
            typeof body.anchorLocationId === 'string' && body.anchorLocationId.trim() !== '' ? body.anchorLocationId.trim() : undefined

        if (anchorLocationId !== undefined && !isValidGuid(anchorLocationId)) {
            return errorResponse(400, 'InvalidLocationId', 'anchorLocationId must be a valid GUID when provided', {
                correlationId: this.correlationId
            })
        }

        // Validate mode
        if (!isAreaGenerationMode(body.mode)) {
            return errorResponse(400, 'ValidationError', `mode must be one of: ${VALID_MODES.join(', ')}`, {
                correlationId: this.correlationId
            })
        }

        // Validate budgetLocations
        const rawBudget = body.budgetLocations
        if (typeof rawBudget !== 'number' || !Number.isInteger(rawBudget) || rawBudget < 1) {
            return errorResponse(400, 'ValidationError', 'budgetLocations must be a positive integer', {
                correlationId: this.correlationId
            })
        }

        // Validate realmHints (optional)
        const realmHints =
            Array.isArray(body.realmHints) && body.realmHints.every((h) => typeof h === 'string')
                ? (body.realmHints as string[])
                : undefined

        // Validate idempotencyKey (optional)
        const idempotencyKey =
            typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() !== '' ? body.idempotencyKey.trim() : undefined

        try {
            const result = await this.orchestrator.orchestrate(
                {
                    anchorLocationId,
                    mode: body.mode,
                    budgetLocations: rawBudget,
                    realmHints,
                    idempotencyKey
                },
                this.correlationId
            )

            return okResponse(
                {
                    enqueuedCount: result.enqueuedCount,
                    anchorLocationId: result.anchorLocationId,
                    terrain: result.terrain,
                    idempotencyKey: result.idempotencyKey,
                    clamped: result.clamped,
                    maxBudget: MAX_BUDGET_LOCATIONS
                },
                { correlationId: this.correlationId }
            )
        } catch (error) {
            if (error instanceof LocationNotFoundError) {
                return errorResponse(404, 'LocationNotFound', error.message, {
                    correlationId: this.correlationId
                })
            }
            return internalErrorResponse(error, { correlationId: this.correlationId })
        }
    }
}

export async function generateAreaHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(GenerateAreaHandler)
    return handler.handle(req, context)
}
