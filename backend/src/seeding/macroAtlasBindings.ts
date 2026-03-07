import type { Location } from '@piquet-h/shared'
import mosswellMacroAtlas from '../data/mosswellMacroAtlas.json' with { type: 'json' }
import longReachMacroAtlas from '../data/theLongReachMacroAtlas.json' with { type: 'json' }

interface ContinuityRouteLike {
    id?: string
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
        continuityRoutes?: ContinuityRouteLike[]
    }
}

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

/**
 * Applies deterministic macro-atlas tags to local seed locations.
 *
 * Goals:
 * - Reduce recurring hand-authoring by deriving macro context from atlas files.
 * - Keep local nodes aligned to Mosswell's fjord/sound placement and route continuity.
 */
export function applyMacroAtlasBindings(locations: Location[]): Location[] {
    const mosswellAtlas = mosswellMacroAtlas as MacroAtlasLike
    const longReachAtlas = longReachMacroAtlas as MacroAtlasLike

    const macroAreaRef = mosswellAtlas.settlement?.placement?.macroAreaRef
    const primaryWaterContext = mosswellAtlas.settlement?.placement?.waterContext?.primary

    const mosswellRouteAnchors = buildRouteAnchorMap(mosswellAtlas.macroGraph?.continuityRoutes)
    const longReachRouteAnchors = buildRouteAnchorMap(longReachAtlas.macroGraph?.continuityRoutes)

    return locations.map((location) => {
        const nextTags = [...(location.tags || [])]
        const normalizedName = normalizeName(location.name)
        const inMosswellSettlement = nextTags.includes('settlement:mosswell')

        // Settlement-level context inheritance: all Mosswell local nodes inherit the
        // fjord/sound-head area + water context tags.
        if (inMosswellSettlement) {
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
