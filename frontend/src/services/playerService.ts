/**
 * Player bootstrap service
 * Handles player GUID allocation, persistence, and telemetry.
 */
import type { PlayerBootstrapResponse } from '@piquet-h/shared'
import { buildHeaders, buildPlayerUrl, isValidGuid } from '../utils/apiClient'
import { unwrapEnvelope } from '../utils/envelope'
import { readFromStorage, writeToStorage } from '../utils/localStorage'
import { trackGameEventClient } from './telemetry'

const STORAGE_KEY = 'tsa.playerGuid'

/**
 * Bootstrap result with player GUID and creation status
 */
export interface BootstrapResult {
    playerGuid: string
    created: boolean
}

/**
 * Read player GUID from localStorage
 * @returns Valid GUID or null
 */
export function getStoredPlayerGuid(): string | null {
    return readFromStorage(STORAGE_KEY, isValidGuid)
}

/**
 * Write player GUID to localStorage
 * @param guid Player GUID to persist
 */
export function storePlayerGuid(guid: string): void {
    writeToStorage(STORAGE_KEY, guid)
}

/**
 * Bootstrap player session via API
 * - If existingGuid provided and valid, confirms it with backend
 * - Otherwise allocates a new player GUID
 * - Emits telemetry events
 *
 * @param existingGuid Optional GUID to verify
 * @returns Bootstrap result with playerGuid and created flag
 * @throws Error if bootstrap fails
 */
export async function bootstrapPlayer(existingGuid?: string | null): Promise<BootstrapResult> {
    trackGameEventClient('Onboarding.GuestGuid.Started')

    const url = existingGuid ? buildPlayerUrl(existingGuid) : '/api/player'
    const headers = buildHeaders()

    const res = await fetch(url, {
        method: 'GET',
        headers
    })

    if (!res.ok) {
        throw new Error(`Bootstrap failed: ${res.status}`)
    }

    const json = await res.json()
    const unwrapped = unwrapEnvelope<PlayerBootstrapResponse>(json)

    if (!unwrapped.success || !unwrapped.data) {
        throw new Error('Invalid response format from bootstrap')
    }

    const { playerGuid, created } = unwrapped.data

    // Persist new or confirmed GUID
    if (playerGuid !== existingGuid) {
        storePlayerGuid(playerGuid)
    }

    // Track creation event
    if (created) {
        trackGameEventClient('Onboarding.GuestGuid.Created', { playerGuid })
    }

    return { playerGuid, created }
}
