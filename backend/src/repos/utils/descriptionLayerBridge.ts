import type { DescriptionLayer as SharedLayer, LayerType as SharedLayerType } from '@piquet-h/shared/types/layerRepository'
import type { DescriptionLayer as LegacyDescriptionLayer } from '../descriptionRepository.js'

export function mapLegacyTypeToSharedLayerType(legacyType: LegacyDescriptionLayer['type']): SharedLayerType {
    if (legacyType === 'structural_event') return 'dynamic'
    if (legacyType === 'weather') return 'weather'
    return 'ambient'
}

export function extractLocationIdFromScope(scopeId?: string, fallbackLocationId?: string): string {
    if (typeof fallbackLocationId === 'string' && fallbackLocationId.length > 0) {
        return fallbackLocationId
    }
    if (typeof scopeId === 'string' && scopeId.startsWith('loc:')) {
        return scopeId.slice('loc:'.length)
    }
    return scopeId || 'unknown'
}

export function toSharedLayerDocument(layer: LegacyDescriptionLayer): SharedLayer & Record<string, unknown> {
    const scopeId = `loc:${layer.locationId}`
    const layerType = mapLegacyTypeToSharedLayerType(layer.type)
    const metadata: Record<string, unknown> = {
        ...(layer.attributes ?? {}),
        legacyLayerType: layer.type
    }
    if (layer.source !== undefined) metadata.source = layer.source
    if (layer.expiresAt !== undefined) metadata.expiresAt = layer.expiresAt
    if (layer.archived !== undefined) metadata.archived = layer.archived
    if (layer.integrityHash !== undefined) metadata.integrityHash = layer.integrityHash

    return {
        id: layer.id,
        scopeId,
        layerType,
        value: layer.content,
        effectiveFromTick: 0,
        effectiveToTick: null,
        authoredAt: layer.createdAt,
        metadata,
        locationId: layer.locationId,
        content: layer.content,
        ...(layer.attributes !== undefined ? { attributes: { ...layer.attributes } } : {})
    }
}

function isLegacyLayerType(value: unknown): value is LegacyDescriptionLayer['type'] {
    return (
        value === 'structural_event' || value === 'ambient' || value === 'weather' || value === 'enhancement' || value === 'personalization'
    )
}

export function fromStoredLayerDocument(raw: Record<string, unknown>): LegacyDescriptionLayer {
    const metadata = raw.metadata && typeof raw.metadata === 'object' ? (raw.metadata as Record<string, unknown>) : {}
    const rawAttributes = raw.attributes && typeof raw.attributes === 'object' ? (raw.attributes as Record<string, unknown>) : undefined

    const legacyTypeRaw = metadata.legacyLayerType
    let mappedType: LegacyDescriptionLayer['type'] = 'ambient'
    if (isLegacyLayerType(legacyTypeRaw)) {
        mappedType = legacyTypeRaw
    } else if (raw.layerType === 'dynamic') {
        mappedType = 'structural_event'
    } else if (raw.layerType === 'weather') {
        mappedType = 'weather'
    }

    const cleanAttributes: Record<string, string | number | boolean> = {}
    for (const [key, val] of Object.entries(rawAttributes ?? {})) {
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
            cleanAttributes[key] = val
        }
    }
    for (const [key, val] of Object.entries(metadata)) {
        if (!['legacyLayerType', 'source', 'expiresAt', 'archived', 'integrityHash'].includes(key)) {
            if (cleanAttributes[key] === undefined && (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean')) {
                cleanAttributes[key] = val
            }
        }
    }

    const content = typeof raw.value === 'string' ? raw.value : typeof raw.content === 'string' ? raw.content : ''
    const createdAt =
        typeof raw.authoredAt === 'string' ? raw.authoredAt : typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString()
    const integrityHash =
        typeof metadata.integrityHash === 'string'
            ? metadata.integrityHash
            : typeof raw.integrityHash === 'string'
              ? raw.integrityHash
              : undefined
    const archived = Boolean(metadata.archived ?? raw.archived ?? false)

    return {
        id: String(raw.id),
        locationId: extractLocationIdFromScope(
            typeof raw.scopeId === 'string' ? raw.scopeId : undefined,
            typeof raw.locationId === 'string' ? raw.locationId : undefined
        ),
        type: mappedType,
        content,
        createdAt,
        ...(typeof metadata.expiresAt === 'string' ? { expiresAt: metadata.expiresAt } : {}),
        ...(typeof metadata.source === 'string' ? { source: metadata.source } : {}),
        ...(archived ? { archived: true } : {}),
        ...(Object.keys(cleanAttributes).length > 0 ? { attributes: cleanAttributes } : {}),
        ...(integrityHash ? { integrityHash } : {})
    }
}
