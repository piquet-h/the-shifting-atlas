import {app, HttpRequest, HttpResponseInit, InvocationContext} from '@azure/functions'
import {trackEvent} from '../shared/telemetry.js'
import crypto from 'crypto'

/** In-memory player registry (MVP / PR1). Replaced by Cosmos in later PR. */
const players = new Map<string, PlayerRecord>()

interface PlayerRecord {
    id: string
    createdUtc: string
    guest: boolean
}

interface BootstrapResponseBody {
    playerGuid: string
    created: boolean
}

// Header used by client to suggest an existing GUID (idempotent bootstrap)
const HEADER_PLAYER_GUID = 'x-player-guid'

export async function playerBootstrap(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const existing = request.headers.get(HEADER_PLAYER_GUID) || undefined

    let created = false
    let guid = existing

    if (guid && !players.has(guid)) {
        // Treat unknown provided guid as new (avoid 404 complexity in MVP)
        created = true
        players.set(guid, makePlayer(guid))
    } else if (!guid) {
        guid = crypto.randomUUID()
        created = true
        players.set(guid, makePlayer(guid))
    }

    if (created) {
        trackEvent('Onboarding.GuestGuidCreated', {phase: 'bootstrap'})
    }

    const body: BootstrapResponseBody = {playerGuid: guid!, created}
    context.log('playerBootstrap', body)
    return {
        status: 200,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store'
        },
        jsonBody: body
    }
}

function makePlayer(id: string): PlayerRecord {
    return {id, createdUtc: new Date().toISOString(), guest: true}
}

app.http('playerBootstrap', {
    route: 'player/bootstrap',
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: playerBootstrap
})

// Export internal map for tests (not part of public API)
export const __players = players
