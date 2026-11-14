import { STARTER_LOCATION_ID, type PlayerDoc } from '@piquet-h/shared'
import type { PlayerRecord } from '@piquet-h/shared/types/playerRepository'

const COSMOS_SYSTEM_KEYS = new Set(['_rid', '_self', '_etag', '_attachments', '_ts'])

export function stripCosmosSystemFields<T extends object>(raw: T): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(raw)) {
        if (!COSMOS_SYSTEM_KEYS.has(key)) {
            out[key] = value
        }
    }
    return out
}

/**
 * Projects a stored player document into the gameplay/AI-safe `PlayerDoc` shape.
 * Explicitly omits auth/PII fields (`externalId`, `guest`) and Cosmos system fields.
 */
export function projectPlayerDoc(raw: Record<string, unknown>): PlayerDoc {
    const createdUtc = typeof raw.createdUtc === 'string' ? raw.createdUtc : new Date().toISOString()
    const updatedUtc = typeof raw.updatedUtc === 'string' ? raw.updatedUtc : createdUtc
    const currentLocationId =
        typeof raw.currentLocationId === 'string' && raw.currentLocationId.length > 0 ? raw.currentLocationId : STARTER_LOCATION_ID

    const doc: PlayerDoc = {
        id: String(raw.id),
        createdUtc,
        updatedUtc,
        currentLocationId
    }

    if (raw.attributes !== undefined && raw.attributes !== null && typeof raw.attributes === 'object') {
        doc.attributes = { ...(raw.attributes as Record<string, number | string | boolean>) }
    }
    if (typeof raw.inventoryVersion === 'number') {
        doc.inventoryVersion = raw.inventoryVersion
    }
    if (typeof raw.clockTick === 'number') {
        doc.clockTick = raw.clockTick
    }
    if (typeof raw.lastAction === 'string') {
        doc.lastAction = raw.lastAction
    }
    if (typeof raw.lastDrift === 'string') {
        doc.lastDrift = raw.lastDrift
    }

    return doc
}

/**
 * Projects a stored player document into the identity/session `PlayerRecord` shape.
 */
export function projectPlayerRecord(raw: Record<string, unknown>): PlayerRecord {
    const externalId = typeof raw.externalId === 'string' ? raw.externalId : undefined
    const guest = typeof raw.guest === 'boolean' ? raw.guest : !externalId
    const record: PlayerRecord = {
        id: String(raw.id),
        createdUtc: typeof raw.createdUtc === 'string' ? raw.createdUtc : new Date().toISOString(),
        guest
    }

    if (typeof raw.updatedUtc === 'string') {
        record.updatedUtc = raw.updatedUtc
    }
    if (externalId !== undefined) {
        record.externalId = externalId
    }
    if (typeof raw.name === 'string') {
        record.name = raw.name
    }
    if (typeof raw.currentLocationId === 'string') {
        record.currentLocationId = raw.currentLocationId
    }

    return record
}
