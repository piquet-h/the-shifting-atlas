import { app, HttpRequest, HttpResponseInit } from '@azure/functions'
import { err, getPlayerHeadingStore, normalizeDirection, ok, STARTER_LOCATION_ID } from '@piquet-h/shared'
import { getLocationRepository } from '../repos/index.js'
import { CORRELATION_HEADER, extractCorrelationId, extractPlayerGuid, trackGameEventStrict } from '../telemetry.js'

const repoPromise = getLocationRepository()
const headingStore = getPlayerHeadingStore()

app.http('PlayerMove', {
    route: 'player/move',
    methods: ['POST', 'GET'],
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
        const started = Date.now()
        const correlationId = extractCorrelationId(req.headers)
        const playerGuid = extractPlayerGuid(req.headers)
        const fromId = req.query.get('from') || STARTER_LOCATION_ID
        const rawDir = req.query.get('dir') || ''

        const lastHeading = playerGuid ? headingStore.getLastHeading(playerGuid) : undefined
        const normalizationResult = normalizeDirection(rawDir, lastHeading)

        if (normalizationResult.status === 'ambiguous') {
            trackGameEventStrict(
                'Navigation.Input.Ambiguous',
                { from: fromId, input: rawDir, reason: 'no-heading' },
                { playerGuid, correlationId }
            )
            return {
                status: 400,
                headers: { [CORRELATION_HEADER]: correlationId },
                jsonBody: err('AmbiguousDirection', normalizationResult.clarification || 'Ambiguous direction', correlationId)
            }
        }

        if (normalizationResult.status === 'unknown' || !normalizationResult.canonical) {
            const latencyMs = Date.now() - started
            trackGameEventStrict(
                'Location.Move',
                { from: fromId, direction: rawDir, status: 400, reason: 'invalid-direction', latencyMs },
                { playerGuid, correlationId }
            )
            return {
                status: 400,
                headers: { [CORRELATION_HEADER]: correlationId },
                jsonBody: err('InvalidDirection', normalizationResult.clarification || 'Invalid or missing direction', correlationId)
            }
        }

        const dir = normalizationResult.canonical

        const repo = await repoPromise
        const from = await repo.get(fromId)
        if (!from) {
            const latencyMs = Date.now() - started
            trackGameEventStrict(
                'Location.Move',
                { from: fromId, direction: dir, status: 404, reason: 'from-missing', latencyMs },
                { playerGuid, correlationId }
            )
            return {
                status: 404,
                headers: { [CORRELATION_HEADER]: correlationId },
                jsonBody: err('FromNotFound', 'Current location not found', correlationId)
            }
        }
        const exit = from.exits?.find((e) => e.direction === dir)
        if (!exit || !exit.to) {
            const latencyMs = Date.now() - started
            trackGameEventStrict(
                'Location.Move',
                { from: fromId, direction: dir, status: 400, reason: 'no-exit', latencyMs },
                { playerGuid, correlationId }
            )
            return {
                status: 400,
                headers: { [CORRELATION_HEADER]: correlationId },
                jsonBody: err('NoExit', 'No such exit', correlationId)
            }
        }
        const result = await repo.move(fromId, dir)
        if (result.status === 'error') {
            const reason = result.reason
            const statusMap: Record<string, number> = { ['from-missing']: 404, ['no-exit']: 400, ['target-missing']: 500 }
            const latencyMs = Date.now() - started
            trackGameEventStrict(
                'Location.Move',
                { from: fromId, direction: dir, status: statusMap[reason] || 500, reason, latencyMs },
                { playerGuid, correlationId }
            )
            return {
                status: statusMap[reason] || 500,
                headers: { [CORRELATION_HEADER]: correlationId },
                jsonBody: err('MoveFailed', reason, correlationId)
            }
        }

        if (playerGuid) {
            headingStore.setLastHeading(playerGuid, dir)
        }

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
        return {
            status: 200,
            headers: { [CORRELATION_HEADER]: correlationId },
            jsonBody: ok(result.location, correlationId)
        }
    }
})
