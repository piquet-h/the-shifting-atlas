import type { HttpRequest } from '@azure/functions'
import { getPlayerHeadingStore, normalizeDirection, STARTER_LOCATION_ID } from '@piquet-h/shared'
import { getLocationRepository } from '../repos/index.js'
import { extractCorrelationId, extractPlayerGuid, trackGameEventStrict } from '../telemetry.js'

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

export async function performMove(req: HttpRequest): Promise<MoveResult> {
    const started = Date.now()
    const correlationId = extractCorrelationId(req.headers)
    const playerGuid = extractPlayerGuid(req.headers)
    const fromId = req.query.get('from') || STARTER_LOCATION_ID
    const rawDir = req.query.get('dir') || ''

    const headingStore = getPlayerHeadingStore()
    const lastHeading = playerGuid ? headingStore.getLastHeading(playerGuid) : undefined
    const normalizationResult = normalizeDirection(rawDir, lastHeading)

    // Ambiguous relative direction
    if (normalizationResult.status === 'ambiguous') {
        trackGameEventStrict(
            'Navigation.Input.Ambiguous',
            { from: fromId, input: rawDir, reason: 'no-heading' },
            { playerGuid, correlationId }
        )
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
        trackGameEventStrict(
            'Location.Move',
            { from: fromId, direction: rawDir, status: 400, reason: 'invalid-direction', latencyMs: Date.now() - started },
            { playerGuid, correlationId }
        )
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
    const repo = await getLocationRepository()
    const from = await repo.get(fromId)
    if (!from) {
        trackGameEventStrict(
            'Location.Move',
            { from: fromId, direction: dir, status: 404, reason: 'from-missing', latencyMs: Date.now() - started },
            { playerGuid, correlationId }
        )
        return {
            success: false,
            error: { type: 'from-missing', statusCode: 404, reason: 'from-missing' },
            latencyMs: Date.now() - started
        }
    }

    // Verify exit
    const exit = from.exits?.find((e) => e.direction === dir)
    if (!exit || !exit.to) {
        trackGameEventStrict(
            'Location.Move',
            { from: fromId, direction: dir, status: 400, reason: 'no-exit', latencyMs: Date.now() - started },
            { playerGuid, correlationId }
        )
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
        trackGameEventStrict(
            'Location.Move',
            {
                from: fromId,
                direction: dir,
                status: statusMap[reason] || 500,
                reason,
                latencyMs: Date.now() - started
            },
            { playerGuid, correlationId }
        )
        return {
            success: false,
            error: { type: 'move-failed', statusCode: statusMap[reason] || 500, reason },
            latencyMs: Date.now() - started
        }
    }

    // Update heading
    if (playerGuid) headingStore.setLastHeading(playerGuid, dir)

    const latencyMs = Date.now() - started
    trackGameEventStrict(
        'Location.Move',
        {
            from: fromId,
            to: result.location.id,
            direction: dir,
            status: 200,
            rawInput: rawDir !== dir.toLowerCase() ? rawDir : undefined,
            latencyMs
        },
        { playerGuid, correlationId }
    )

    return { success: true, location: result.location, latencyMs }
}
