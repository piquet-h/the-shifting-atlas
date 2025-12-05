import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import {
    enrichErrorAttributes,
    enrichMovementAttributes,
    getExitGenerationHintStore,
    getPlayerHeadingStore,
    hashPlayerIdForTelemetry,
    normalizeDirection,
    STARTER_LOCATION_ID
} from '@piquet-h/shared'
import type { IPlayerRepository } from '@piquet-h/shared/types/playerRepository'
import { inject, injectable } from 'inversify'
import { checkRateLimit } from '../middleware/rateLimitMiddleware.js'
import { rateLimiters } from '../middleware/rateLimiter.js'
import type { ILocationRepository } from '../repos/locationRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { buildMoveResponse } from './moveResponse.js'

export interface MoveValidationError {
    type: 'ambiguous' | 'invalid-direction' | 'from-missing' | 'no-exit' | 'move-failed' | 'generate'
    statusCode: number
    clarification?: string
    reason?: string
    generationHint?: { originLocationId: string; direction: string }
}

export interface MoveResult {
    success: boolean
    location?: { id: string; name: string; description: string; exits?: { direction: string }[] }
    error?: MoveValidationError
    latencyMs: number
}

@injectable()
export class MoveHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('ILocationRepository') private locationRepo: ILocationRepository,
        @inject('IPlayerRepository') private playerRepo: IPlayerRepository
    ) {
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

        // Parse direction from request body or query params
        let parsedBody: Record<string, unknown> = {}
        const contentType = req.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
            try {
                parsedBody = (await req.json()) as Record<string, unknown>
            } catch {
                // Swallow JSON parse errors; leave parsedBody empty for graceful fallback.
            }
        }

        // Body property names (dir | direction) for backward compatibility
        let rawDir = req.query.get('dir') || req.query.get('direction') || ''
        if (!rawDir && parsedBody) {
            const dirVal = (parsedBody['dir'] || parsedBody['direction']) as string | undefined
            if (typeof dirVal === 'string') rawDir = dirVal
        }

        // Test environment fallback: some integration tests construct HttpRequest mocks with a .body property
        if (!rawDir && Object.keys(parsedBody).length === 0 && (req as unknown as { body?: unknown }).body) {
            try {
                const legacyBody = (req as unknown as { body?: unknown }).body
                if (typeof legacyBody === 'string') {
                    const parsed = JSON.parse(legacyBody) as Record<string, unknown>
                    const dirVal = (parsed['dir'] || parsed['direction']) as string | undefined
                    if (typeof dirVal === 'string') rawDir = dirVal
                    // Preserve fromLocationId for backward compatibility
                    parsedBody = parsed
                } else if (legacyBody && typeof legacyBody === 'object') {
                    const dirVal = (legacyBody as Record<string, unknown>)['dir'] || (legacyBody as Record<string, unknown>)['direction']
                    if (typeof dirVal === 'string') rawDir = dirVal
                    parsedBody = legacyBody as Record<string, unknown>
                }
            } catch {
                /* ignore legacy body parse errors */
            }
        }

        // Security: Determine origin location (authoritative)
        // For authenticated moves: Read from player's database record (prevents client spoofing)
        // For anonymous/test moves: Accept fromLocationId from request (backward compatibility)
        let fromId: string
        if (this.playerGuid) {
            const player = await this.playerRepo.get(this.playerGuid)
            if (player?.currentLocationId) {
                // Use player's actual location from database (authoritative)
                fromId = player.currentLocationId
            } else {
                // Player exists but has no location - this shouldn't happen after bootstrap
                // Fall back to request-provided location or starter
                const bodyFrom = (parsedBody['fromLocationId'] || parsedBody['from']) as string | undefined
                fromId = req.query.get('from') || bodyFrom || STARTER_LOCATION_ID
            }
        } else {
            // No player GUID (anonymous/test mode) - use request-provided location
            const bodyFrom = (parsedBody['fromLocationId'] || parsedBody['from']) as string | undefined
            fromId = req.query.get('from') || bodyFrom || STARTER_LOCATION_ID
        }

        const headingStore = getPlayerHeadingStore()
        const lastHeading = this.playerGuid ? headingStore.getLastHeading(this.playerGuid) : undefined
        const normalizationResult = normalizeDirection(rawDir, lastHeading)

        // Ambiguous relative direction
        if (normalizationResult.status === 'ambiguous') {
            this.track('Navigation.Input.Ambiguous', { fromLocationId: fromId, input: rawDir, reason: 'no-heading' })
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
            const props = {
                from: fromId,
                direction: rawDir,
                status: 400,
                reason: 'invalid-direction',
                latencyMs: Date.now() - started
            }
            enrichMovementAttributes(props, {
                playerId: this.playerGuid,
                fromLocationId: fromId,
                exitDirection: rawDir
            })
            enrichErrorAttributes(props, { errorCode: 'invalid-direction' })
            this.track('Navigation.Move.Blocked', props)
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
        const from = await this.locationRepo.get(fromId)
        if (!from) {
            const props = {
                from: fromId,
                direction: dir,
                status: 404,
                reason: 'from-missing',
                latencyMs: Date.now() - started
            }
            enrichMovementAttributes(props, {
                playerId: this.playerGuid,
                fromLocationId: fromId,
                exitDirection: dir
            })
            enrichErrorAttributes(props, { errorCode: 'from-missing' })
            this.track('Navigation.Move.Blocked', props)
            return {
                success: false,
                error: { type: 'from-missing', statusCode: 404, reason: 'from-missing' },
                latencyMs: Date.now() - started
            }
        }

        // Verify exit
        const exit = from.exits?.find((e) => e.direction === dir)
        if (!exit || !exit.to) {
            // Valid canonical direction but no exit - emit generation hint
            const hintStore = getExitGenerationHintStore()
            const playerId = this.playerGuid || 'anonymous'
            const hintResult = hintStore.checkAndRecord(playerId, fromId, dir)

            // Emit telemetry event with hashed identifiers (privacy)
            if (hintResult.shouldEmit) {
                const telemetryProps = {
                    dir,
                    originHashed: hashPlayerIdForTelemetry(fromId),
                    playerHashed: hashPlayerIdForTelemetry(playerId),
                    timestamp: hintResult.hint.timestamp,
                    debounceHit: hintResult.debounceHit
                }
                this.track('Navigation.Exit.GenerationRequested', telemetryProps)
            }

            // Return generate status with hint payload
            const latencyMs = Date.now() - started
            return {
                success: false,
                error: {
                    type: 'generate',
                    statusCode: 400,
                    reason: 'no-exit',
                    clarification: `No exit ${dir} from here yet. Your interest has been noted.`,
                    generationHint: {
                        originLocationId: fromId,
                        direction: dir
                    }
                },
                latencyMs
            }
        }

        // Execute move
        const result = await this.locationRepo.move(fromId, dir)
        if (result.status === 'error') {
            const reason = result.reason
            const statusMap: Record<string, number> = { 'from-missing': 404, 'no-exit': 400, 'target-missing': 500 }
            const props = {
                from: fromId,
                direction: dir,
                status: statusMap[reason] || 500,
                reason,
                latencyMs: Date.now() - started
            }
            enrichMovementAttributes(props, {
                playerId: this.playerGuid,
                fromLocationId: fromId,
                exitDirection: dir
            })
            enrichErrorAttributes(props, { errorCode: reason })
            this.track('Navigation.Move.Blocked', props)
            return {
                success: false,
                error: { type: 'move-failed', statusCode: statusMap[reason] || 500, reason },
                latencyMs: Date.now() - started
            }
        }

        // Update heading
        if (this.playerGuid) headingStore.setLastHeading(this.playerGuid, dir)

        // Update player location in persistent storage
        if (this.playerGuid) {
            try {
                const player = await this.playerRepo.get(this.playerGuid)
                if (!player) {
                    // Player document missing - CRITICAL ERROR, fail the move
                    this.track('Player.Update', {
                        playerId: this.playerGuid,
                        success: false,
                        reason: 'player-not-found',
                        toLocationId: result.location.id
                    })
                    return {
                        success: false,
                        error: { type: 'move-failed', statusCode: 500, reason: 'player-not-found' },
                        latencyMs: Date.now() - started
                    }
                }
                player.currentLocationId = result.location.id
                await this.playerRepo.update(player)
                // Emit success telemetry for persistence
                this.track('Player.Update', {
                    playerId: this.playerGuid,
                    success: true,
                    toLocationId: result.location.id,
                    latencyMs: Date.now() - started
                })
            } catch (error) {
                // Update failed - FAIL THE MOVE
                this.track('Player.Update', {
                    playerId: this.playerGuid,
                    success: false,
                    reason: 'update-failed',
                    toLocationId: result.location.id,
                    error: error instanceof Error ? error.message : String(error)
                })
                return {
                    success: false,
                    error: { type: 'move-failed', statusCode: 500, reason: 'persistence-failed' },
                    latencyMs: Date.now() - started
                }
            }
        }

        const latencyMs = Date.now() - started
        const props = {
            from: fromId,
            to: result.location.id,
            direction: dir,
            status: 200,
            rawInput: rawDir !== dir.toLowerCase() ? rawDir : undefined,
            latencyMs
        }
        enrichMovementAttributes(props, {
            playerId: this.playerGuid,
            fromLocationId: fromId,
            toLocationId: result.location.id,
            exitDirection: dir
        })
        this.track('Navigation.Move.Success', props)

        return { success: true, location: result.location, latencyMs }
    }
}
