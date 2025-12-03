import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import {
    enrichErrorAttributes,
    enrichMovementAttributes,
    getExitGenerationHintStore,
    getPlayerHeadingStore,
    hashPlayerIdForTelemetry,
    isDirection,
    normalizeDirection,
    STARTER_LOCATION_ID
} from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { checkRateLimit } from '../middleware/rateLimitMiddleware.js'
import { rateLimiters } from '../middleware/rateLimiter.js'
import type { ILocationRepository } from '../repos/locationRepository.js'
import type { IPlayerRepository } from '@piquet-h/shared/types/playerRepository'
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
        // Prefer explicit from location provided via query param or JSON body; fallback to starter.
        // NOTE: Frontend sends { direction, fromLocationId } in JSON body. Previous implementation
        // ignored body.fromLocationId and always used STARTER_LOCATION_ID which caused subsequent
        // moves to evaluate against the starter room rather than the player's current location.
        // Additionally, Azure Functions v4 does not expose request.body directly; it must be read
        // via request.json()/request.text(). The prior code attempted req.body access, leading to
        // direction always being treated as empty and returning 400.
        let parsedBody: Record<string, unknown> = {}
        const contentType = req.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
            try {
                // request.json() is the canonical way to read the body in @azure/functions v4.
                parsedBody = (await req.json()) as Record<string, unknown>
            } catch {
                // Swallow JSON parse errors; leave parsedBody empty for graceful fallback.
            }
        }

        // Body property names (dir | direction) for backward compatibility with earlier clients.
        // Accept query param override first to allow bookmarking/testing via query string.
        let rawDir = req.query.get('dir') || req.query.get('direction') || ''
        if (!rawDir && parsedBody) {
            const dirVal = (parsedBody['dir'] || parsedBody['direction']) as string | undefined
            if (typeof dirVal === 'string') rawDir = dirVal
        }

        // Test environment fallback: some integration tests construct HttpRequest mocks with a .body property
        // (stringified JSON) but omit the content-type header. Support that shape to avoid forcing all tests to add
        // headers while keeping production path strictly header-driven.
        if (!rawDir && Object.keys(parsedBody).length === 0 && (req as unknown as { body?: unknown }).body) {
            try {
                const legacyBody = (req as unknown as { body?: unknown }).body
                if (typeof legacyBody === 'string') {
                    const parsed = JSON.parse(legacyBody) as Record<string, unknown>
                    const dirVal = (parsed['dir'] || parsed['direction']) as string | undefined
                    if (typeof dirVal === 'string') rawDir = dirVal
                    // Merge into parsedBody for fromLocationId fallback below
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

        const bodyFrom = (parsedBody['fromLocationId'] || parsedBody['from']) as string | undefined
        const fromId = req.query.get('from') || bodyFrom || STARTER_LOCATION_ID

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
            // Check if direction is valid canonical direction for exit generation hint
            if (isDirection(dir)) {
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

            // Not a canonical direction - return standard no-exit error
            const props = {
                from: fromId,
                direction: dir,
                status: 400,
                reason: 'no-exit',
                latencyMs: Date.now() - started
            }
            enrichMovementAttributes(props, {
                playerId: this.playerGuid,
                fromLocationId: fromId,
                exitDirection: dir
            })
            enrichErrorAttributes(props, { errorCode: 'no-exit' })
            this.track('Navigation.Move.Blocked', props)
            return {
                success: false,
                error: { type: 'no-exit', statusCode: 400, reason: 'no-exit' },
                latencyMs: Date.now() - started
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
                if (player) {
                    player.currentLocationId = result.location.id
                    await this.playerRepo.update(player)
                } else {
                    // Player document missing - log warning but allow move to complete
                    this.track('Player.Update', {
                        playerId: this.playerGuid,
                        success: false,
                        reason: 'player-not-found',
                        toLocationId: result.location.id
                    })
                }
            } catch (error) {
                // Update failed - log error but allow move to complete (stateless still works)
                this.track('Player.Update', {
                    playerId: this.playerGuid,
                    success: false,
                    reason: 'update-failed',
                    toLocationId: result.location.id,
                    error: error instanceof Error ? error.message : String(error)
                })
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
