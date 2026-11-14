import type { Location } from '@piquet-h/shared'
import mosswellMacroAtlas from '../data/mosswellMacroAtlas.json' with { type: 'json' }
import longReachMacroAtlas from '../data/theLongReachMacroAtlas.json' with { type: 'json' }

interface ContinuityRouteLike {
    id?: string
    localAnchors?: string[]
}

interface MacroAreaNodeLike {
    id?: string
    nodeClass?: string
    localAnchors?: string[]
}

interface MacroAtlasLike {
    settlement?: {
        placement?: {
            macroAreaRef?: string
            waterContext?: {
                primary?: string
            }
        }
    }
    macroGraph?: {
        nodes?: MacroAreaNodeLike[]
        continuityRoutes?: ContinuityRouteLike[]
    }
}

const DEFAULT_MOSSWELL_LOCAL_AREA = 'mw-area-fjord-sound-head'

function normalizeName(value: string): string {
    return value.trim().toLowerCase()
}

function addUnique(tags: string[], tag: string | undefined): void {
    if (!tag) return
    if (!tags.includes(tag)) tags.push(tag)
}

function buildRouteAnchorMap(routes: ContinuityRouteLike[] | undefined): Map<string, string[]> {
    const byAnchor = new Map<string, string[]>()
    for (const route of routes || []) {
        if (!route.id) continue
        for (const anchor of route.localAnchors || []) {
            const key = normalizeName(anchor)
            const current = byAnchor.get(key) || []
            if (!current.includes(route.id)) current.push(route.id)
            byAnchor.set(key, current)
        }
    }
    return byAnchor
}

function buildLocalAreaAnchorMap(nodes: MacroAreaNodeLike[] | undefined): Map<string, string> {
    const byAnchor = new Map<string, string>()
    for (const node of nodes || []) {
        if (!node.id || node.nodeClass !== 'area') continue
        for (const anchor of node.localAnchors || []) {
            byAnchor.set(normalizeName(anchor), node.id)
        }
    }
    return byAnchor
}

/**
 * Applies deterministic two-tier macro-atlas tags to local seed locations.
 *
 * Goals:
 * - Stamp both local walkable settlement sub-areas (`mw-area-*`) and landmass basin (`lr-area-*`) lineage.
 * - Keep local nodes aligned to Mosswell's fjord/sound placement and route continuity.
 */
export function applyMacroAtlasBindings(locations: Location[]): Location[] {
    const mosswellAtlas = mosswellMacroAtlas as MacroAtlasLike
    const longReachAtlas = longReachMacroAtlas as MacroAtlasLike

    const macroAreaRef = mosswellAtlas.settlement?.placement?.macroAreaRef
    const primaryWaterContext = mosswellAtlas.settlement?.placement?.waterContext?.primary

    const localAreaAnchors = buildLocalAreaAnchorMap(mosswellAtlas.macroGraph?.nodes)
    const mosswellRouteAnchors = buildRouteAnchorMap(mosswellAtlas.macroGraph?.continuityRoutes)
    const longReachRouteAnchors = buildRouteAnchorMap(longReachAtlas.macroGraph?.continuityRoutes)

    // Pre-index structure -> local sub-area so interior rooms inherit their exterior structure's sub-zone
    // even if a future interior room is added without editing mosswellMacroAtlas.json.
    const structureAreaByTag = new Map<string, string>()
    for (const loc of locations) {
        const structTag = (loc.tags || []).find((tag) => tag.startsWith('structure:'))
        const directSubArea = localAreaAnchors.get(normalizeName(loc.name))
        if (structTag && directSubArea && !structureAreaByTag.has(structTag)) {
            structureAreaByTag.set(structTag, directSubArea)
        }
    }

    return locations.map((location) => {
        const nextTags = [...(location.tags || [])]
        const normalizedName = normalizeName(location.name)
        const inMosswellSettlement = nextTags.includes('settlement:mosswell')

        if (inMosswellSettlement) {
            const structTag = nextTags.find((tag) => tag.startsWith('structure:'))
            const localSubArea =
                localAreaAnchors.get(normalizedName) ??
                (structTag ? structureAreaByTag.get(structTag) : undefined) ??
                DEFAULT_MOSSWELL_LOCAL_AREA
            addUnique(nextTags, `macro:area:${localSubArea}`)
            addUnique(nextTags, macroAreaRef ? `macro:area:${macroAreaRef}` : undefined)
            addUnique(nextTags, primaryWaterContext ? `macro:water:${primaryWaterContext}` : undefined)
        }

        // Route continuity inheritance: local anchor names listed by atlas continuity routes
        // get explicit macro route tags, enabling future deterministic expansion behavior.
        for (const routeId of mosswellRouteAnchors.get(normalizedName) || []) {
            addUnique(nextTags, `macro:route:${routeId}`)
        }
        for (const routeId of longReachRouteAnchors.get(normalizedName) || []) {
            addUnique(nextTags, `macro:route:${routeId}`)
        }

        return {
            ...location,
            tags: nextTags
        }
    })
}
