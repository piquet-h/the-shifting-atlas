import { getTerrainGuidance, type Direction, type TerrainType } from '@piquet-h/shared'
import mosswellMacroAtlas from '../data/mosswellMacroAtlas.json' with { type: 'json' }
import theLongReachMacroAtlas from '../data/theLongReachMacroAtlas.json' with { type: 'json' }

interface DirectionalTrendProfile {
    anchorNode: string
    trends: Partial<Record<Direction, string>>
}

interface ContinuityRoute {
    id: string
    name: string
    frontierPolicy?: {
        preserveRouteLineage?: boolean
        preferredFutureNodePrefix?: string
        avoidGenericOpenPlainFallback?: boolean
    }
}

interface MacroNode {
    id: string
    name: string
    nodeClass?: string
}

interface MacroEdge {
    from: string
    to: string
    barrierRefs?: string[]
}

interface MacroAtlasLike {
    macroGraph?: {
        nodes?: MacroNode[]
        edges?: MacroEdge[]
        directionalTrendProfiles?: DirectionalTrendProfile[]
        continuityRoutes?: ContinuityRoute[]
    }
}

export interface MacroGenerationContext {
    expansionDirection: Direction
    areaRef?: string
    routeRefs: string[]
    waterContext?: string
    directionTerrainTrend?: string
    routeContinuityHint?: string
    preferredFutureNodePrefix?: string
    barrierSemantics: string[]
}

const ALL_ATLASES = [mosswellMacroAtlas as MacroAtlasLike, theLongReachMacroAtlas as MacroAtlasLike]

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values))
}

function extractFirstTag(tags: string[] | undefined, prefix: string): string | undefined {
    return tags?.find((tag) => tag.startsWith(prefix))?.slice(prefix.length)
}

function extractAllTags(tags: string[] | undefined, prefix: string): string[] {
    return (tags || []).filter((tag) => tag.startsWith(prefix)).map((tag) => tag.slice(prefix.length))
}

function findDirectionalTrend(areaRef: string | undefined, direction: Direction): string | undefined {
    if (!areaRef) return undefined

    for (const atlas of ALL_ATLASES) {
        const match = atlas.macroGraph?.directionalTrendProfiles?.find((profile) => profile.anchorNode === areaRef)
        if (match?.trends?.[direction]) {
            return match.trends[direction]
        }
    }

    return undefined
}

function findRoutes(routeRefs: string[]): ContinuityRoute[] {
    if (routeRefs.length === 0) return []

    const routes: ContinuityRoute[] = []
    for (const atlas of ALL_ATLASES) {
        for (const route of atlas.macroGraph?.continuityRoutes || []) {
            if (routeRefs.includes(route.id)) {
                routes.push(route)
            }
        }
    }

    return routes
}

function buildRouteContinuityHint(routes: ContinuityRoute[]): string | undefined {
    if (routes.length === 0) return undefined

    return routes
        .map((route) => {
            const parts = [`Preserve ${route.name} lineage.`]
            if (route.frontierPolicy?.preferredFutureNodePrefix) {
                parts.push(`Prefer future naming that continues ${route.frontierPolicy.preferredFutureNodePrefix}.`)
            }
            if (route.frontierPolicy?.avoidGenericOpenPlainFallback) {
                parts.push('Avoid generic open-plain fallback when route continuity should persist.')
            }
            return parts.join(' ')
        })
        .join(' ')
}

function getPreferredFutureNodePrefix(routes: ContinuityRoute[]): string | undefined {
    return routes.find((route) => route.frontierPolicy?.preferredFutureNodePrefix)?.frontierPolicy?.preferredFutureNodePrefix
}

function buildBarrierSemantics(areaRef: string | undefined): string[] {
    if (!areaRef) return []

    const barrierIds = unique(
        ALL_ATLASES.flatMap((atlas) =>
            (atlas.macroGraph?.edges || [])
                .filter((edge) => edge.from === areaRef || edge.to === areaRef)
                .flatMap((edge) => edge.barrierRefs || [])
        )
    )

    if (barrierIds.length === 0) return []

    const barrierNamesById = new Map(
        ALL_ATLASES.flatMap((atlas) =>
            (atlas.macroGraph?.nodes || []).filter((node) => node.nodeClass === 'barrier').map((node) => [node.id, node.name] as const)
        )
    )

    return barrierIds.map((id) => barrierNamesById.get(id) || id)
}

export function resolveMacroGenerationContext(tags: string[] | undefined, expansionDirection: Direction): MacroGenerationContext {
    const areaRef = extractFirstTag(tags, 'macro:area:')
    const routeRefs = extractAllTags(tags, 'macro:route:')
    const waterContext = extractFirstTag(tags, 'macro:water:')
    const routes = findRoutes(routeRefs)
    const directionTerrainTrend = findDirectionalTrend(areaRef, expansionDirection)
    const routeContinuityHint = buildRouteContinuityHint(routes)
    const preferredFutureNodePrefix = getPreferredFutureNodePrefix(routes)
    const barrierSemantics = buildBarrierSemantics(areaRef)

    return {
        expansionDirection,
        areaRef,
        routeRefs,
        waterContext,
        directionTerrainTrend,
        routeContinuityHint,
        preferredFutureNodePrefix,
        barrierSemantics
    }
}

function titleCaseTerrain(terrain: TerrainType): string {
    return terrain
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

function directionLabel(direction: Direction): string {
    const labels: Record<Direction, string> = {
        north: 'Northward Reach',
        south: 'Southward Reach',
        east: 'Eastward Reach',
        west: 'Westward Reach',
        northeast: 'Northeast Reach',
        northwest: 'Northwest Reach',
        southeast: 'Southeast Reach',
        southwest: 'Southwest Reach',
        up: 'Upper Reach',
        down: 'Lower Reach',
        in: 'Inner Reach',
        out: 'Outer Reach'
    }

    return labels[direction]
}

function scoreExpansionDirection(context: MacroGenerationContext): number {
    const trend = context.directionTerrainTrend?.toLowerCase() || ''
    let score = 0

    if (context.preferredFutureNodePrefix && /(route|continuity|road|valley)/.test(trend)) {
        score += 100
    }

    if (/(route|continuity|road|valley)/.test(trend)) {
        score += 50
    }

    if (trend.length > 0) {
        score += 20
    }

    if (/(hill|escarpment|cliff|shelf|waterfront|delta|marsh)/.test(trend)) {
        score += 15
    }

    return score
}

export function selectAtlasAwareExpansionDirections(
    baseTerrain: TerrainType,
    arrivalDirection: Direction,
    batchSize: number,
    tags: string[] | undefined
): Direction[] {
    const guidance = getTerrainGuidance(baseTerrain)
    const candidateDirections =
        guidance.defaultDirections && guidance.defaultDirections.length > 0
            ? guidance.defaultDirections
            : (['north', 'south', 'east', 'west'] as Direction[])

    const available = candidateDirections.filter((direction) => direction !== arrivalDirection)

    if (!tags || tags.length === 0) {
        return available.slice(0, Math.min(batchSize, available.length))
    }

    const ranked = available
        .map((direction, index) => ({
            direction,
            index,
            score: scoreExpansionDirection(resolveMacroGenerationContext(tags, direction))
        }))
        .sort((a, b) => (a.score !== b.score ? b.score - a.score : a.index - b.index))

    return ranked.slice(0, Math.min(batchSize, ranked.length)).map((entry) => entry.direction)
}

export function suggestFutureNodeName(terrain: TerrainType, context: MacroGenerationContext): string {
    if (context.preferredFutureNodePrefix) {
        return `${context.preferredFutureNodePrefix} ${directionLabel(context.expansionDirection)}`
    }

    if (context.directionTerrainTrend?.includes('valley')) {
        return `Valley Reach ${directionLabel(context.expansionDirection)}`
    }

    if (context.directionTerrainTrend?.includes('shelf')) {
        return `Shelf Reach ${directionLabel(context.expansionDirection)}`
    }

    if (context.waterContext === 'fjord-sound-head') {
        return `Soundside ${directionLabel(context.expansionDirection)}`
    }

    return `Unexplored ${titleCaseTerrain(terrain)}`
}

export function selectAtlasAwareTerrain(baseTerrain: TerrainType, context: MacroGenerationContext): TerrainType {
    const trend = context.directionTerrainTrend?.toLowerCase() || ''
    const barriers = context.barrierSemantics.join(' ').toLowerCase()

    // Preserve explicit route continuity when the atlas says this should remain a traversable
    // valley/road-style continuation.
    if (context.preferredFutureNodePrefix && trend.includes('valley')) {
        return 'open-plain'
    }

    // Fjord/sound western pressure should not flatten into broad plains. Bias toward tighter,
    // ledge-like traversal where cliff/deep-water barriers frame the expansion.
    if (
        context.waterContext === 'fjord-sound-head' &&
        context.expansionDirection === 'west' &&
        (barriers.includes('cliff') || barriers.includes('fiord'))
    ) {
        return 'narrow-corridor'
    }

    // Wet / marsh / channel pressure maps best to riverbank with the current terrain vocabulary.
    if (barriers.includes('marsh') || trend.includes('river') || trend.includes('delta')) {
        return 'riverbank'
    }

    // Rising country and foothill/upland trends map to hilltop until richer terrain classes exist.
    if (trend.includes('foothill') || trend.includes('upland') || trend.includes('hill') || trend.includes('ridge')) {
        return 'hilltop'
    }

    return baseTerrain
}

export function buildAtlasAwarePendingDescription(terrain: TerrainType, context: MacroGenerationContext): string {
    const parts: string[] = []

    if (context.preferredFutureNodePrefix) {
        parts.push(`${context.preferredFutureNodePrefix} continues ${context.expansionDirection}, keeping its route identity.`)
    } else {
        parts.push(`${titleCaseTerrain(terrain)} terrain continues ${context.expansionDirection}.`)
    }

    if (context.directionTerrainTrend) {
        parts.push(context.directionTerrainTrend.charAt(0).toUpperCase() + context.directionTerrainTrend.slice(1) + '.')
    }

    if (context.waterContext === 'fjord-sound-head') {
        parts.push('The fjord/sound remains a nearby constraint on the shape of travel.')
    }

    if (context.barrierSemantics.length > 0) {
        parts.push(`Nearby barriers include ${context.barrierSemantics.join(' and ')}.`)
    }

    return parts.join(' ')
}

export function getMacroPropagationTags(tags: string[] | undefined, realmKey?: string): string[] {
    const propagated = (tags || []).filter(
        (tag) =>
            tag.startsWith('settlement:') ||
            tag.startsWith('macro:area:') ||
            tag.startsWith('macro:route:') ||
            tag.startsWith('macro:water:')
    )

    if (realmKey) {
        propagated.push(realmKey)
    }

    return unique(propagated)
}
