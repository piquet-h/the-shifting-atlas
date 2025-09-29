import {
    CORRELATION_HEADER,
    err,
    extractCorrelationId,
    extractPlayerGuid,
    getLocationRepository,
    getPlayerHeadingStore,
    isDirection,
    normalizeDirection,
    ok,
    STARTER_LOCATION_ID,
    trackGameEventStrict
} from '@atlas/shared'
import {app, HttpRequest, HttpResponseInit} from '@azure/functions'

const repo = getLocationRepository()
const headingStore = getPlayerHeadingStore()

app.http('PlayerMove', {
    route: 'player/move',
    methods: ['POST', 'GET'],
    authLevel: 'anonymous',
    handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
        const correlationId = extractCorrelationId(req.headers)
        const playerGuid = extractPlayerGuid(req.headers)
        const fromId = req.query.get('from') || STARTER_LOCATION_ID
        const rawDir = req.query.get('dir') || ''
        
        // Get player's last heading for relative direction resolution
        const lastHeading = playerGuid ? headingStore.getLastHeading(playerGuid) : undefined
        
        // Normalize direction input (handles both canonical and relative directions)
        const normalizationResult = normalizeDirection(rawDir, lastHeading)
        
        if (normalizationResult.status === 'ambiguous') {
            // Track ambiguous input for telemetry
            trackGameEventStrict(
                'Navigation.Input.Ambiguous',
                {from: fromId, input: rawDir, reason: 'no-heading'},
                {playerGuid, correlationId}
            )
            return {
                status: 400,
                headers: {[CORRELATION_HEADER]: correlationId},
                jsonBody: err('AmbiguousDirection', normalizationResult.clarification || 'Ambiguous direction', correlationId)
            }
        }
        
        if (normalizationResult.status === 'unknown' || !normalizationResult.canonical) {
            trackGameEventStrict(
                'Location.Move',
                {from: fromId, direction: rawDir, status: 400, reason: 'invalid-direction'},
                {playerGuid, correlationId}
            )
            return {
                status: 400,
                headers: {[CORRELATION_HEADER]: correlationId},
                jsonBody: err('InvalidDirection', normalizationResult.clarification || 'Invalid or missing direction', correlationId)
            }
        }
        
        // Use the normalized canonical direction
        const dir = normalizationResult.canonical
        
        const from = await repo.get(fromId)
        if (!from) {
            trackGameEventStrict(
                'Location.Move',
                {from: fromId, direction: dir, status: 404, reason: 'from-missing'},
                {playerGuid, correlationId}
            )
            return {
                status: 404,
                headers: {[CORRELATION_HEADER]: correlationId},
                jsonBody: err('FromNotFound', 'Current location not found', correlationId)
            }
        }
        const exit = from.exits?.find((e) => e.direction === dir)
        if (!exit || !exit.to) {
            trackGameEventStrict(
                'Location.Move',
                {from: fromId, direction: dir, status: 400, reason: 'no-exit'},
                {playerGuid, correlationId}
            )
            return {
                status: 400,
                headers: {[CORRELATION_HEADER]: correlationId},
                jsonBody: err('NoExit', 'No such exit', correlationId)
            }
        }
        const result = await repo.move(fromId, dir)
        if (result.status === 'error') {
            const reason = result.reason
            const statusMap: Record<string, number> = {['from-missing']: 404, ['no-exit']: 400, ['target-missing']: 500}
            trackGameEventStrict(
                'Location.Move',
                {from: fromId, direction: dir, status: statusMap[reason] || 500, reason},
                {playerGuid, correlationId}
            )
            return {
                status: statusMap[reason] || 500,
                headers: {[CORRELATION_HEADER]: correlationId},
                jsonBody: err('MoveFailed', reason, correlationId)
            }
        }
        
        // Update player's heading on successful move
        if (playerGuid) {
            headingStore.setLastHeading(playerGuid, dir)
        }
        
        trackGameEventStrict(
            'Location.Move',
            {from: fromId, to: result.location.id, direction: dir, status: 200, rawInput: rawDir !== dir.toLowerCase() ? rawDir : undefined},
            {playerGuid, correlationId}
        )
        return {
            status: 200,
            headers: {[CORRELATION_HEADER]: correlationId},
            jsonBody: ok(result.location, correlationId)
        }
    }
})
