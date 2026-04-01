import {
    getOppositeDirection,
    getTerrainGuidance,
    type Direction,
    type ExitAvailabilityMetadata,
    type ForbiddenExitEntry,
    type TerrainType
} from '@piquet-h/shared'
// TODO(#984) ADR-010 revisit triggers T1/T2: if multi-settlement cross-area traversal queries
// are needed at runtime, or if AI generation must mint new macro areas without a deploy,
// this module must be replaced with a Gremlin-backed alternative. See ADR-010 and issue #984.
import mosswellMacroAtlas from '../data/mosswellMacroAtlas.json' with { type: 'json' }
import theLongReachMacroAtlas from '../data/theLongReachMacroAtlas.json' with { type: 'json' }
import { inferStructuralArchetype, type PendingExitMetadata } from './frontierContext.js'

interface DirectionalTrendProfile {
    anchorNode: string
    trends: Partial<Record<Direction, string>>
}

interface ContinuityRoute {
    /** Atlas route reference key (semantic ID, not a runtime GUID). */
    id: string
    name: string
    frontierPolicy?: {
        preserveRouteLineage?: boolean
        preferredFutureNodePrefix?: string
        avoidGenericOpenPlainFallback?: boolean
    }
}

/**
 * Authoring readiness state for a macro atlas area destination.
 *
 * Indicates how complete the destination area is for runtime handoff.
 * This is the canonical vocabulary shared by atlas data, validation tooling,
 * and runtime consumers.
 *
 * - `ready`:    Destination is authored and eligible for runtime area handoff.
 * - `partial`:  Destination has a skeleton but needs further authoring before
 *               full handoff. Runtime may enter but should degrade gracefully.
 * - `blocked`:  Destination is intentionally not ready; handoff must not occur.
 * - `deferred`: Destination authoring is deliberately deferred to a later pass.
 */
export type AreaReadinessState = 'ready' | 'partial' | 'blocked' | 'deferred'

/**
 * Transition metadata on a macro atlas edge.
 *
 * Carried by edges that represent an area handoff point — where repeated
 * frontier travel may cross from one macro area into a neighbouring one.
 * Runtime consumers use this to decide whether to stay in current-area
 * continuation mode or commit to the new area.
 *
 * This shape is intentionally stable so overlay/reporting tooling and
 * runtime handlers share the same vocabulary without coupling to internal
 * implementation details.
 */
export interface TransitionMetadata {
    /**
     * Cardinal or ordinal direction label for this outbound transition.
     * Matches a valid {@link Direction} value.
     */
    direction: string
    /**
     * Short human-readable description of the crossing condition.
     * Describes what geographic or authoring threshold is crossed.
     */
    threshold: string
    /**
     * Semantic reference key of the destination macro area node.
     * May reference a node in a different atlas file (cross-file transition).
     * Must NOT be a runtime GUID.
     */
    destinationAreaRef: string
    /**
     * Authoring readiness state of the destination area at the time this
     * edge was authored. Runtime must not commit to an area handoff if
     * the value is `'blocked'` or `'deferred'`.
     */
    destinationReadiness: AreaReadinessState
    /**
     * Optional semantic reference to the first segment the runtime should
     * use inside the destination area upon entry.
     */
    entrySegmentRef?: string
    /**
     * Whether a route handoff must be evaluated at this transition point.
     * If true, `handoffRouteRef` should be provided for the runtime to
     * resolve the continuation route.
     */
    requiresRouteHandoff?: boolean
    /**
     * Atlas route reference key for the continuation route in the destination.
     * Required when `requiresRouteHandoff` is true.
     */
    handoffRouteRef?: string
}

interface MacroNode {
    /** Atlas node reference key (semantic ID, not a runtime location GUID). */
    id: string
    name: string
    nodeClass?: string
    /**
     * Explicit authoring readiness state for this area as a transition destination.
     * Used by runtime and tooling to determine handoff eligibility.
     */
    authoringReadiness?: AreaReadinessState
    /**
     * Semantic reference to the recommended entry segment within this area.
     * Points to the first macro node the runtime should use when entering
     * this area from an outbound transition edge.
     */
    entrySegmentRef?: string
}

interface MacroEdge {
    /** Source atlas node reference key. */
    from: string
    /** Destination atlas node reference key. */
    to: string
    relation?: string
    traversal?: string
    barrierRefs?: string[]
    lineage?: string
    /**
     * Transition metadata for edges that represent an area handoff point.
     * Present only on edges where `relation` is `'macro-transition'`.
     */
    transition?: TransitionMetadata
}

interface MacroAtlasLike {
    macroGraph?: {
        nodes?: MacroNode[]
        edges?: MacroEdge[]
        directionalTrendProfiles?: DirectionalTrendProfile[]
        continuityRoutes?: ContinuityRoute[]
    }
}

/**
 * A resolved outbound macro-transition edge for a given source area and direction.
 *
 * Returned by {@link resolveAreaTransitionEdge} for runtime consumers that need
 * to determine whether to commit to a new macro area rather than remaining in
 * current-area continuation mode.
 */
export interface MacroTransitionEdge {
    /** Semantic reference of the source atlas node. */
    fromNodeId: string
    /** Traversal classification of the edge (e.g. `'open'`, `'constrained'`, `'blocked'`). */
    traversal?: string
    /** Barrier node references on the edge, if any. */
    barrierRefs?: string[]
    /** Transition metadata for this area handoff point. */
    transition: TransitionMetadata
}

export interface MacroGenerationContext {
    expansionDirection: Direction
    /** Atlas area reference key carried in tags like `macro:area:<ref>`. */
    areaRef?: string
    /** Atlas route reference keys carried in tags like `macro:route:<ref>`. */
    routeRefs: string[]
    waterContext?: string
    directionTerrainTrend?: string
    routeContinuityHint?: string
    preferredFutureNodePrefix?: string
    barrierSemantics: string[]
}

export interface AtlasConstrainedExitAvailability {
    pending?: Partial<Record<Direction, string>>
    forbidden?: Partial<Record<Direction, ForbiddenExitEntry>>
}

export interface AtlasAwareFutureLocationPlan {
    terrain: TerrainType
    name: string
    description: string
    tags: string[]
    exitAvailability?: ExitAvailabilityMetadata
    /**
     * Structured frontier context for each pending exit direction.
     *
     * Keys correspond to directions that appear in `exitAvailability.pending`.
     * Carries deterministic atlas-derived metadata so downstream consumers
     * (narration, map visualisation, batch generation) can consume structured
     * context rather than parsing the human-readable reason strings.
     *
     * Absent when no pending exits are available.
     */
    pendingExitContext?: Partial<Record<Direction, PendingExitMetadata>>
    macroContext: MacroGenerationContext
}

// Re-export frontier context types so callers only need one import.
export type { FrontierStructuralArchetype, PendingExitMetadata } from './frontierContext.js'

/**
 * Tag prefix stamped onto generated interior stubs by {@link planAtlasAwareFutureLocation}.
 * Consumers (e.g. WorldGraph) use this to derive the structural class of a materialized
 * interior frontier node without re-inferring the original expansion direction.
 */
const INTERIOR_GENERATED_TAG = 'interior:generated'

/**
 * Tag prefix stamped onto generated vertical stubs by {@link planAtlasAwareFutureLocation}.
 */
const VERTICAL_GENERATED_TAG = 'vertical:generated'

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

function extractFrontierDepth(tags: string[] | undefined): number {
    const raw = extractFirstTag(tags, 'frontier:depth:')
    if (!raw) return 0

    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function toRomanNumeral(value: number): string {
    const numerals: Array<[number, string]> = [
        [10, 'X'],
        [9, 'IX'],
        [5, 'V'],
        [4, 'IV'],
        [1, 'I']
    ]
    let remainder = value
    let result = ''

    for (const [amount, glyph] of numerals) {
        while (remainder >= amount) {
            result += glyph
            remainder -= amount
        }
    }

    return result || 'I'
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

export function scoreExpansionDirection(context: MacroGenerationContext): number {
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

export function suggestFutureNodeName(terrain: TerrainType, context: MacroGenerationContext, frontierDepth: number = 1): string {
    let baseName: string

    // Interior and vertical directions take precedence over all terrain-based naming.
    // These names are intentionally aligned with the synthetic pending node names used by
    // the WorldGraph handler so that the transition from pending to materialized is seamless.
    const archetype = inferStructuralArchetype(context.expansionDirection)
    if (archetype === 'interior') {
        baseName = context.expansionDirection === 'in' ? 'Unexplored Interior' : 'Unexplored Exterior Approach'
    } else if (archetype === 'vertical') {
        baseName = context.expansionDirection === 'up' ? 'Unexplored Upper Level' : 'Unexplored Lower Level'
    } else if (context.preferredFutureNodePrefix) {
        baseName = `${context.preferredFutureNodePrefix} ${directionLabel(context.expansionDirection)}`
    } else if (context.directionTerrainTrend?.includes('valley')) {
        baseName = `Valley Reach ${directionLabel(context.expansionDirection)}`
    } else if (context.directionTerrainTrend?.includes('shelf')) {
        baseName = `Shelf Reach ${directionLabel(context.expansionDirection)}`
    } else if (context.waterContext === 'fjord-sound-head') {
        baseName = `Soundside ${directionLabel(context.expansionDirection)}`
    } else {
        baseName = `Unexplored ${titleCaseTerrain(terrain)}`
    }

    return frontierDepth > 1 ? `${baseName} ${toRomanNumeral(frontierDepth)}` : baseName
}

function buildFutureLocationDescription(
    name: string,
    terrain: TerrainType,
    context: MacroGenerationContext,
    frontierDepth: number
): string {
    // Interior and vertical expansions require structurally distinct prose —
    // the overland "terrain continues beyond landmarks" framing is semantically wrong
    // for a doorway into a building or a stairway to another floor.
    const archetype = inferStructuralArchetype(context.expansionDirection)

    if (archetype === 'interior') {
        const parts: string[] = [`${name} waits beyond the threshold, its interior yet to be explored.`]
        if (context.barrierSemantics.length > 0) {
            parts.push(`Nearby constraints include ${context.barrierSemantics.join(' and ')}.`)
        }
        return parts.join(' ')
    }

    if (archetype === 'vertical') {
        const elevationWord = context.expansionDirection === 'up' ? 'above' : 'below'
        const transitionWord = context.expansionDirection === 'up' ? 'ascends' : 'descends'
        const parts: string[] = [`${name} ${elevationWord}, where a passage ${transitionWord} into unmapped territory.`]
        if (context.barrierSemantics.length > 0) {
            parts.push(`Nearby constraints include ${context.barrierSemantics.join(' and ')}.`)
        }
        return parts.join(' ')
    }

    const parts: string[] = [
        `${name} lies ${context.expansionDirection}, where ${titleCaseTerrain(terrain).toLowerCase()} terrain continues beyond the last confirmed landmarks.`
    ]

    if (context.directionTerrainTrend) {
        parts.push(context.directionTerrainTrend.charAt(0).toUpperCase() + context.directionTerrainTrend.slice(1) + '.')
    }

    if (context.waterContext === 'fjord-sound-head') {
        parts.push('The nearby sound still shapes the air and the line of travel.')
    }

    if (context.barrierSemantics.length > 0) {
        parts.push(`Nearby constraints include ${context.barrierSemantics.join(' and ')}.`)
    }

    if (frontierDepth > 1) {
        parts.push('This stretch feels farther from Mosswell and less settled underfoot.')
    }

    return parts.join(' ')
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

export function scoreAtlasAwareReconnectionCandidate(
    targetContext: MacroGenerationContext,
    baseTerrain: TerrainType,
    candidateTerrain: TerrainType,
    candidateTags: string[] | undefined
): number {
    const candidateContext = resolveMacroGenerationContext(candidateTags, targetContext.expansionDirection)
    const expectedTerrain = selectAtlasAwareTerrain(baseTerrain, targetContext)
    let score = 0

    const sharedRoutes = targetContext.routeRefs.filter((routeRef) => candidateContext.routeRefs.includes(routeRef)).length
    score += sharedRoutes * 200

    if (targetContext.areaRef && candidateContext.areaRef === targetContext.areaRef) {
        score += 120
    }

    if (targetContext.preferredFutureNodePrefix && candidateContext.preferredFutureNodePrefix === targetContext.preferredFutureNodePrefix) {
        score += 80
    }

    if (targetContext.waterContext && candidateContext.waterContext === targetContext.waterContext) {
        score += 60
    }

    const sharedBarriers = targetContext.barrierSemantics.filter((barrier) => candidateContext.barrierSemantics.includes(barrier)).length
    score += sharedBarriers * 30

    if (candidateTerrain === expectedTerrain) {
        score += 40
    }

    return score
}

export function buildAtlasConstrainedExitAvailability(
    terrain: TerrainType,
    context: MacroGenerationContext,
    backDirection: Direction,
    tags?: string[]
): AtlasConstrainedExitAvailability {
    const guidance = getTerrainGuidance(terrain)
    const candidateDirections =
        guidance.defaultDirections && guidance.defaultDirections.length > 0
            ? guidance.defaultDirections
            : (['north', 'south', 'east', 'west'] as Direction[])

    const pendingDirections = candidateDirections.filter((direction) => direction !== backDirection)
    const forbidden: Partial<Record<Direction, ForbiddenExitEntry>> = {}

    const lowerTrend = context.directionTerrainTrend?.toLowerCase() || ''
    const barrierText = context.barrierSemantics.join(' ').toLowerCase()

    if (
        context.waterContext === 'fjord-sound-head' &&
        terrain === 'narrow-corridor' &&
        context.expansionDirection === 'west' &&
        pendingDirections.includes('west') &&
        (lowerTrend.includes('fiord') || lowerTrend.includes('cliff') || barrierText.includes('fiord') || barrierText.includes('cliff'))
    ) {
        forbidden.west = {
            reason: 'blocked by fiord walls and cliff-limited ledges',
            motif: 'cliff',
            reveal: 'onTryMove'
        }
    }

    const pending = pendingDirections.reduce<Partial<Record<Direction, string>>>((acc, direction) => {
        if (forbidden[direction]) {
            return acc
        }

        const directionContext = tags ? resolveMacroGenerationContext(tags, direction) : { ...context, expansionDirection: direction }
        acc[direction] = buildAtlasAwarePendingDescription(terrain, directionContext)
        return acc
    }, {})

    return {
        pending: Object.keys(pending).length > 0 ? pending : undefined,
        forbidden: Object.keys(forbidden).length > 0 ? forbidden : undefined
    }
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

/**
 * Build structured {@link PendingExitMetadata} from an already-resolved
 * {@link MacroGenerationContext}.
 *
 * This is the canonical way to obtain inspectable frontier context for a
 * pending exit direction.  It does not generate narrative prose; use
 * {@link buildAtlasAwarePendingDescription} for that.
 *
 * @param context - Resolved macro context for the expansion direction.
 */
export function buildAtlasAwarePendingMetadata(context: MacroGenerationContext): PendingExitMetadata {
    return {
        structuralArchetype: inferStructuralArchetype(context.expansionDirection, context.waterContext),
        macroAreaRef: context.areaRef,
        routeLineage: context.routeRefs.length > 0 ? context.routeRefs : undefined,
        terrainTrend: context.directionTerrainTrend,
        waterSemantics: context.waterContext,
        barrierSemantics: context.barrierSemantics.length > 0 ? context.barrierSemantics : undefined
    }
}

/**
 * Resolve the outbound {@link MacroTransitionEdge} for a given source area node and direction.
 *
 * Scans all loaded atlases for a `macro-transition` edge whose `from` matches
 * `areaRef` and whose `transition.direction` matches `direction`.
 *
 * Returns `undefined` when no authored transition edge exists — callers should
 * treat this as "remain in current-area continuation mode" rather than assuming
 * a handoff is possible.
 *
 * Runtime handlers use this to decide whether repeated frontier travel can
 * enter a new macro area versus staying in the current one.  See also
 * {@link TransitionMetadata.destinationReadiness} — runtime must not commit
 * to a handoff when the value is `'blocked'` or `'deferred'`.
 *
 * @param areaRef   - Semantic atlas area reference key (e.g. from a `macro:area:` tag).
 * @param direction - Expansion direction to look up.
 */
export function resolveAreaTransitionEdge(areaRef: string | undefined, direction: Direction): MacroTransitionEdge | undefined {
    if (!areaRef) return undefined

    for (const atlas of ALL_ATLASES) {
        const edges = atlas.macroGraph?.edges ?? []
        for (const edge of edges) {
            if (edge.from === areaRef && edge.relation === 'macro-transition' && edge.transition?.direction === direction) {
                return {
                    fromNodeId: edge.from,
                    traversal: edge.traversal,
                    barrierRefs: edge.barrierRefs,
                    transition: edge.transition
                }
            }
        }
    }

    return undefined
}

export function getMacroPropagationTags(tags: string[] | undefined, realmKey?: string): string[] {
    const propagated = (tags || []).filter(
        (tag) =>
            tag.startsWith('settlement:') ||
            tag.startsWith('macro:area:') ||
            tag.startsWith('macro:route:') ||
            tag.startsWith('macro:water:') ||
            tag.startsWith('frontier:depth:')
    )

    if (realmKey) {
        propagated.push(realmKey)
    }

    return unique(propagated)
}

export function planAtlasAwareFutureLocation(
    baseTerrain: TerrainType,
    expansionDirection: Direction,
    sourceTags: string[] | undefined,
    realmKey?: string
): AtlasAwareFutureLocationPlan {
    const propagatedTags = getMacroPropagationTags(sourceTags, realmKey)
    const nextFrontierDepth = Math.max(extractFrontierDepth(propagatedTags) + 1, 1)
    const tags = unique([...propagatedTags.filter((tag) => !tag.startsWith('frontier:depth:')), `frontier:depth:${nextFrontierDepth}`])

    // Stamp a structural archetype tag onto interior and vertical stubs.
    // This allows downstream consumers (WorldGraph, narration) to identify
    // the structural class of a materialized node from its tags alone,
    // without re-inferring the original expansion direction.
    const expansionArchetype = inferStructuralArchetype(expansionDirection)
    if (expansionArchetype === 'interior') {
        tags.push(INTERIOR_GENERATED_TAG)
    } else if (expansionArchetype === 'vertical') {
        tags.push(VERTICAL_GENERATED_TAG)
    }

    const macroContext = resolveMacroGenerationContext(tags, expansionDirection)
    const selectedTerrain = selectAtlasAwareTerrain(baseTerrain, macroContext)
    const name = suggestFutureNodeName(selectedTerrain, macroContext, nextFrontierDepth)
    const description = buildFutureLocationDescription(name, selectedTerrain, macroContext, nextFrontierDepth)
    const backDirection = getOppositeDirection(expansionDirection)
    const availability = buildAtlasConstrainedExitAvailability(selectedTerrain, macroContext, backDirection, tags)

    // Build structured pending exit context alongside the legacy string reasons.
    // Keys correspond to directions in availability.pending.
    // Use Object.entries to iterate as [string, string] pairs and cast each key
    // individually — Object.keys() returns string[], but every key in availability.pending
    // is a Direction because buildAtlasConstrainedExitAvailability only adds Direction keys.
    const pendingExitContext: Partial<Record<Direction, PendingExitMetadata>> = {}
    if (availability.pending) {
        for (const [dir] of Object.entries(availability.pending)) {
            const direction = dir as Direction
            const dirContext = resolveMacroGenerationContext(tags, direction)
            pendingExitContext[direction] = buildAtlasAwarePendingMetadata(dirContext)
        }
    }

    return {
        terrain: selectedTerrain,
        name,
        description,
        tags,
        exitAvailability: availability.pending || availability.forbidden ? availability : undefined,
        pendingExitContext: Object.keys(pendingExitContext).length > 0 ? pendingExitContext : undefined,
        macroContext
    }
}
