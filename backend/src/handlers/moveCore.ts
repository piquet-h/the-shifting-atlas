import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { getPlayerHeadingStore, normalizeDirection, STARTER_LOCATION_ID } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { checkRateLimit } from '../middleware/rateLimitMiddleware.js'
import { rateLimiters } from '../middleware/rateLimiter.js'
import type { ILocationRepository } from '../repos/locationRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { buildMoveResponse } from './moveResponse.js'

export interface MoveValidationError {
    type: 'ambiguous' | 'invalid-direction' | 'from-missing' | 'no-exit' | 'move-failed'
    statusCode: number
    clarification?: string
    reason?: string
}

export interface MoveResult {
    success: boolean
    location?: { id: string; name: string; description: string; exits?: { direction: string }[] }
    error?: MoveValidationError
    latencyMs: number
}

@injectable()
export class MoveHandler extends BaseHandler {
    constructor(@inject('ITelemetryClient') telemetry: ITelemetryClient) {
        super(telemetry)
    }

    /**
     * Standard execute method that performs the move and returns HTTP response
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected async execute(req: HttpRequest, _context: InvocationContext): Promise<HttpResponseInit> {
        // Check rate limit
        const rateLimitResponse = checkRateLimit(req, rateLimiters.movement, 'player/move')
        if (rateLimitResponse) {
            return rateLimitResponse
        }

        const moveResult = await this.performMove(req)
        return buildMoveResponse(moveResult, this.correlationId)
    }

    /**
     * Core move logic - public for backward compatibility with tests
     * Returns MoveResult for tests, while execute() handles HTTP response building
     */
    async performMove(req: HttpRequest): Promise<MoveResult> {
        const started = Date.now()
        const fromId = req.query.get('from') || STARTER_LOCATION_ID
        const rawDir = req.query.get('dir') || ''

        const headingStore = getPlayerHeadingStore()
        const lastHeading = this.playerGuid ? headingStore.getLastHeading(this.playerGuid) : undefined
        const normalizationResult = normalizeDirection(rawDir, lastHeading)

        // Ambiguous relative direction
        if (normalizationResult.status === 'ambiguous') {
            this.track('Navigation.Input.Ambiguous', { from: fromId, input: rawDir, reason: 'no-heading' })
            return {
                success: false,
                error: {
                    type: 'ambiguous',
                    statusCode: 400,
                    clarification: normalizationResult.clarification || 'Ambiguous direction'
                },
                latencyMs: Date.now() - started
            }
        }

        // Invalid / unknown direction
        if (normalizationResult.status === 'unknown' || !normalizationResult.canonical) {
            this.track('Navigation.Move.Blocked', {
                from: fromId,
                direction: rawDir,
                status: 400,
                reason: 'invalid-direction',
                latencyMs: Date.now() - started
            })
            return {
                success: false,
                error: {
                    type: 'invalid-direction',
                    statusCode: 400,
                    clarification: normalizationResult.clarification || 'Invalid or missing direction'
                },
                latencyMs: Date.now() - started
            }
        }

        const dir = normalizationResult.canonical

        // Fetch starting location
        const repo = this.getRepository<ILocationRepository>('ILocationRepository')

        const from = await repo.get(fromId)
        if (!from) {
            this.track('Navigation.Move.Blocked', {
                from: fromId,
                direction: dir,
                status: 404,
                reason: 'from-missing',
                latencyMs: Date.now() - started
            })
            return {
                success: false,
                error: { type: 'from-missing', statusCode: 404, reason: 'from-missing' },
                latencyMs: Date.now() - started
            }
        }

        // Verify exit
        const exit = from.exits?.find((e) => e.direction === dir)
        if (!exit || !exit.to) {
            this.track('Navigation.Move.Blocked', {
                from: fromId,
                direction: dir,
                status: 400,
                reason: 'no-exit',
                latencyMs: Date.now() - started
            })
            return {
                success: false,
                error: { type: 'no-exit', statusCode: 400, reason: 'no-exit' },
                latencyMs: Date.now() - started
            }
        }

        // Execute move
        const result = await repo.move(fromId, dir)
        if (result.status === 'error') {
            const reason = result.reason
            const statusMap: Record<string, number> = { 'from-missing': 404, 'no-exit': 400, 'target-missing': 500 }
            this.track('Navigation.Move.Blocked', {
                from: fromId,
                direction: dir,
                status: statusMap[reason] || 500,
                reason,
                latencyMs: Date.now() - started
            })
            return {
                success: false,
                error: { type: 'move-failed', statusCode: statusMap[reason] || 500, reason },
                latencyMs: Date.now() - started
            }
        }

        // Update heading
        if (this.playerGuid) headingStore.setLastHeading(this.playerGuid, dir)

        const latencyMs = Date.now() - started
        this.track('Navigation.Move.Success', {
            from: fromId,
            to: result.location.id,
            direction: dir,
            status: 200,
            rawInput: rawDir !== dir.toLowerCase() ? rawDir : undefined,
            latencyMs
        })

        return { success: true, location: result.location, latencyMs }
    }
}
