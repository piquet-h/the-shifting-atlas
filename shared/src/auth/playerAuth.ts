import { IPlayerRepository } from '../repos/playerRepository.js'

export interface ClientPrincipal {
    userId: string
    userDetails?: string
    identityProvider?: string
    roles?: string[]
}

export interface EnsurePlayerResult {
    playerGuid: string
    created: boolean
    source: 'header' | 'swa-auth' | 'generated'
    principal?: ClientPrincipal
    externalId?: string
}

const PRINCIPAL_HEADER = 'x-ms-client-principal'
const PLAYER_GUID_HEADER = 'x-player-guid'

export function parseClientPrincipal(headers: { get(name: string): string | null | undefined } | undefined): ClientPrincipal | undefined {
    try {
        const raw = headers?.get(PRINCIPAL_HEADER)
        if (!raw) return undefined
        let json: string
        const gbContainer = globalThis as unknown as {
            Buffer?: { from: (d: string, enc: string) => { toString: (e: string) => string } }
        }
        const gb: unknown = gbContainer.Buffer
        if (gb) {
            json = (gb as { from: (d: string, enc: string) => { toString: (e: string) => string } }).from(raw, 'base64').toString('utf8')
        } else if (typeof (globalThis as { atob?: (s: string) => string }).atob === 'function') {
            const b64 = (globalThis as { atob: (s: string) => string }).atob(raw)
            json = decodeURIComponent(escape(b64))
        } else {
            return undefined
        }
        const obj = JSON.parse(json)
        if (!obj?.userId) return undefined
        return {
            userId: String(obj.userId),
            userDetails: obj.userDetails ? String(obj.userDetails) : undefined,
            identityProvider: obj.identityProvider ? String(obj.identityProvider) : undefined,
            roles: Array.isArray(obj.userRoles) ? obj.userRoles.map((r: unknown) => String(r)) : undefined
        }
    } catch {
        return undefined
    }
}

export function buildExternalId(principal: ClientPrincipal): string {
    const provider = (principal.identityProvider || 'unknown').toLowerCase()
    return `${provider}:${principal.userId.toLowerCase()}`
}

export async function ensurePlayerForRequest(
    headers: { get(name: string): string | null | undefined } | undefined,
    repo: IPlayerRepository
): Promise<EnsurePlayerResult> {
    // 1. Explicit player GUID header (guest continuity)
    const existingGuid = headers?.get(PLAYER_GUID_HEADER) || undefined
    if (existingGuid) {
        const { record } = await repo.getOrCreate(existingGuid)
        return { playerGuid: record.id, created: false, source: 'header' }
    }
    // 2. SWA Auth principal
    const principal = parseClientPrincipal(headers)
    if (principal) {
        const externalId = buildExternalId(principal)
        const found = await repo.findByExternalId(externalId)
        if (found) return { playerGuid: found.id, created: false, source: 'swa-auth', principal, externalId }
        // create & link
        const { record } = await repo.getOrCreate()
        const linkResult = await repo.linkExternalId(record.id, externalId)
        // If conflict occurs during auto-link (rare race condition), fall back to guest
        if (linkResult.conflict) {
            // Log this scenario but proceed with guest player
            const { record: guestRecord } = await repo.getOrCreate()
            return { playerGuid: guestRecord.id, created: true, source: 'generated' }
        }
        return { playerGuid: record.id, created: true, source: 'swa-auth', principal, externalId }
    }
    // 3. Anonymous fallback guest
    const { record, created } = await repo.getOrCreate()
    return { playerGuid: record.id, created, source: 'generated' }
}

export { PLAYER_GUID_HEADER, PRINCIPAL_HEADER as SWA_PRINCIPAL_HEADER }
