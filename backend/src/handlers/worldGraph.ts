/**
 * World Graph Handler
 *
 * Returns the full world location graph: all location nodes and traversable exit edges.
 * Used by the frontend WorldMap component (Cytoscape visualisation).
 *
 * Response shape:
 *   { nodes: WorldGraphNode[], edges: WorldGraphEdge[] }
 */
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import type { Direction, ForbiddenExitEntry, ForbiddenExitMotif, ForbiddenExitReveal } from '@piquet-h/shared'
import { normalizeForbiddenEntry } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable, optional } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'
import type { IPersistenceConfig } from '../persistenceConfig.js'
import type { ILocationRepository } from '../repos/locationRepository.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import type { FrontierStructuralArchetype, PendingExitMetadata } from '../services/frontierContext.js'
import { buildAtlasAwarePendingMetadata, resolveMacroGenerationContext } from '../services/macroGenerationContext.js'
import { BaseHandler } from './base/BaseHandler.js'
import { internalErrorResponse, okResponse } from './utils/responseBuilder.js'

export interface WorldGraphNode {
    id: string
    name: string
    tags?: string[]
    /**
     * Structural classification for frontier nodes.
     *
     * Present on:
     * - All synthetic pending nodes (tagged `pending:synthetic`) — inferred from direction.
     * - Materialized stubs generated from interior or vertical exits (tagged
     *   `interior:generated` or `vertical:generated` by {@link planAtlasAwareFutureLocation}).
     *
     * Absent on fully authored real location nodes.
     */
    structuralClass?: FrontierStructuralArchetype
}

export interface WorldGraphEdge {
    fromId: string
    toId: string
    direction: string
    travelDurationMs?: number
    /** When true, this edge represents a pending (not-yet-materialized) exit intent. */
    pending?: boolean
    /** When true, this exit is currently locked. Movement through it returns a soft denial. Future UI can show a lock icon. */
    locked?: boolean
    /**
     * Structured frontier context for pending edges.
     * Present when `pending === true` and macro context is derivable from source node tags.
     * Carries deterministic atlas-derived metadata so consumers do not need to
     * reverse-engineer intent from the human-readable reason string.
     */
    frontierContext?: PendingExitMetadata
    /**
     * When true, this exit direction is permanently forbidden and will never be generated.
     * Distinct from `pending` (which will eventually be resolved).
     * Consumers should not prompt movement in this direction and may display a barrier indicator.
     */
    forbidden?: boolean
    /**
     * Structured barrier context for forbidden exit directions.
     * Present when `forbidden === true`.
     * Carries motif and reveal semantics so consumers can render contextually appropriate UI
     * without parsing the human-readable reason string.
     */
    forbiddenContext?: { reason: string; motif?: ForbiddenExitMotif; reveal?: ForbiddenExitReveal }
}

export interface WorldGraphResponse {
    nodes: WorldGraphNode[]
    edges: WorldGraphEdge[]
}

/** Sentinel used in Gremlin coalesce() when travelDurationMs is absent on an edge. */
const TRAVEL_DURATION_ABSENT = -1
const PENDING_NODE_NAME = 'Unexplored Open Plain'

function pendingNodeName(direction: string, archetype?: FrontierStructuralArchetype): string {
    if (direction === 'in') return 'Unexplored Interior'
    if (direction === 'out') return 'Unexplored Exterior Approach'
    if (direction === 'up') return 'Unexplored Upper Level'
    if (direction === 'down') return 'Unexplored Lower Level'
    // Use archetype to distinguish waterfront from generic overland when available
    if (archetype === 'waterfront') return 'Unexplored Waterfront'
    return PENDING_NODE_NAME
}

function pendingNodeId(fromId: string, direction: string): string {
    return `pending:${fromId}:${direction}`
}

function forbiddenNodeId(fromId: string, direction: string): string {
    return `forbidden:${fromId}:${direction}`
}

/**
 * Derive the structural class for a real (materialized) location node from its tags.
 *
 * Returns `'interior'` for locations tagged `interior:generated` (stubs created by
 * expanding an `in`/`out` exit), `'vertical'` for locations tagged `vertical:generated`
 * (stubs created by expanding an `up`/`down` exit), and `undefined` for fully authored
 * real locations that carry no structural archetype tag.
 */
function deriveStructuralClassFromTags(tags?: string[]): FrontierStructuralArchetype | undefined {
    if (!tags) return undefined
    if (tags.includes('interior:generated')) return 'interior'
    if (tags.includes('vertical:generated')) return 'vertical'
    return undefined
}

function forbiddenNodeName(motif?: ForbiddenExitMotif): string {
    const motifNames: Record<ForbiddenExitMotif, string> = {
        cliff: 'Impassable Cliff',
        water: 'Open Water Barrier',
        ward: 'Arcane Ward',
        law: 'Restricted Area',
        ruin: 'Collapsed Ruin'
    }
    return (motif && motifNames[motif]) || 'Impassable Barrier'
}

/**
 * Handler that returns all location nodes and exit edges as a graph.
 * Intentionally lightweight – no description compilation, no per-location exit fetches.
 */
@injectable()
export class WorldGraphHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('PersistenceConfig') private readonly persistence: IPersistenceConfig,
        @inject('ILocationRepository') private readonly locationRepository: ILocationRepository,
        @inject('GremlinClient') @optional() private readonly gremlinClient?: IGremlinClient
    ) {
        super(telemetry)
    }

    protected async execute(): Promise<HttpResponseInit> {
        try {
            // Memory mode: build graph from the repository contract (seeded locations + exits).
            // Cosmos mode: prefer Gremlin fast-path to avoid N+1 listAll() calls and keep the endpoint snappy.
            if (this.persistence.mode !== 'cosmos') {
                const locations = await this.locationRepository.listAll()

                const nodeById = new Map<string, WorldGraphNode>(
                    locations.map((loc) => [
                        loc.id,
                        {
                            id: loc.id,
                            name: loc.name || 'Unknown',
                            tags: loc.tags,
                            structuralClass: deriveStructuralClassFromTags(loc.tags)
                        }
                    ])
                )

                const edges: WorldGraphEdge[] = []
                const hardExitDirectionsBySource = new Map<string, Set<string>>()

                for (const loc of locations) {
                    const exits = loc.exits || []
                    const hardDirections = new Set<string>()
                    const hardEdges = exits
                        .filter((e) => Boolean(e.to) && Boolean(e.direction))
                        .map((e) => ({
                            fromId: loc.id,
                            toId: String(e.to),
                            direction: String(e.direction),
                            travelDurationMs: Number(e.travelDurationMs) > 0 ? Number(e.travelDurationMs) : undefined,
                            locked: e.lockState === 'locked' ? true : undefined
                        }))

                    for (const edge of hardEdges) {
                        hardDirections.add(edge.direction)
                        edges.push(edge)
                    }
                    hardExitDirectionsBySource.set(loc.id, hardDirections)
                }

                // Pending exits are valid traversal intent even before an edge is materialized.
                // Represent them as synthetic graph edges to synthetic placeholder nodes so the map
                // can display player-visible frontier directions (aligned with Exit Intent Capture).
                for (const loc of locations) {
                    const pending = loc.exitAvailability?.pending
                    if (!pending) continue

                    const hardDirections = hardExitDirectionsBySource.get(loc.id) ?? new Set<string>()

                    for (const [direction, reason] of Object.entries(pending)) {
                        if (!reason || hardDirections.has(direction)) continue

                        // Derive structured context from source node tags + direction.
                        const macroCtx = resolveMacroGenerationContext(loc.tags, direction as Direction)
                        const frontierCtx = buildAtlasAwarePendingMetadata(macroCtx)

                        const syntheticId = pendingNodeId(loc.id, direction)
                        if (!nodeById.has(syntheticId)) {
                            nodeById.set(syntheticId, {
                                id: syntheticId,
                                name: pendingNodeName(direction, frontierCtx.structuralArchetype),
                                tags: ['pending:synthetic'],
                                structuralClass: frontierCtx.structuralArchetype
                            })
                        }

                        edges.push({
                            fromId: loc.id,
                            toId: syntheticId,
                            direction,
                            pending: true,
                            frontierContext: frontierCtx
                        })
                    }
                }

                // Forbidden exits are permanent barriers — include them so consumers can distinguish
                // which directions are pending (will be generated) vs permanently blocked, without
                // parsing human-readable reason strings.
                for (const loc of locations) {
                    const forbidden = loc.exitAvailability?.forbidden
                    if (!forbidden) continue

                    const hardDirections = hardExitDirectionsBySource.get(loc.id) ?? new Set<string>()

                    for (const [direction, rawEntry] of Object.entries(forbidden)) {
                        if (!rawEntry || hardDirections.has(direction)) continue

                        const entry = normalizeForbiddenEntry(rawEntry as ForbiddenExitEntry | string)
                        const syntheticId = forbiddenNodeId(loc.id, direction)
                        if (!nodeById.has(syntheticId)) {
                            nodeById.set(syntheticId, {
                                id: syntheticId,
                                name: forbiddenNodeName(entry.motif),
                                tags: ['forbidden:synthetic']
                            })
                        }

                        edges.push({
                            fromId: loc.id,
                            toId: syntheticId,
                            direction,
                            forbidden: true,
                            forbiddenContext: { reason: entry.reason, motif: entry.motif, reveal: entry.reveal }
                        })
                    }
                }

                const nodes = Array.from(nodeById.values())

                this.track('World.Map.Fetched', {
                    nodeCount: nodes.length,
                    edgeCount: edges.length,
                    latencyMs: this.latencyMs,
                    persistenceMode: this.persistence.mode
                })

                return okResponse({ nodes, edges } satisfies WorldGraphResponse, {
                    correlationId: this.correlationId
                })
            }

            if (!this.gremlinClient) {
                throw new Error('World graph requires GremlinClient in cosmos mode, but it was not registered')
            }

            const [rawNodes, rawEdges] = await Promise.all([
                this.gremlinClient.submit<Record<string, unknown>>("g.V().hasLabel('location').valueMap(true)"),
                this.gremlinClient.submit<Record<string, unknown>>(
                    "g.E().hasLabel('exit')" +
                        ".project('fromId','toId','direction','travelDurationMs')" +
                        '.by(outV().id())' +
                        '.by(inV().id())' +
                        ".by(values('direction'))" +
                        `.by(coalesce(values('travelDurationMs'), constant(${TRAVEL_DURATION_ABSENT})))`
                )
            ])

            const locationPendingById = new Map<string, Record<string, string>>()
            const locationForbiddenById = new Map<string, Record<string, ForbiddenExitEntry | string>>()

            const nodesById = new Map<string, WorldGraphNode>()
            for (const v of rawNodes || []) {
                const id = String(v.id || v['id'])
                const name = Array.isArray(v.name) ? String((v.name as unknown[])[0]) : String(v.name || 'Unknown')
                const tags = Array.isArray(v.tags) ? (v.tags as string[]) : undefined

                nodesById.set(id, { id, name, tags, structuralClass: deriveStructuralClassFromTags(tags) })

                const pendingRaw = Array.isArray(v.exitAvailabilityPendingJson)
                    ? v.exitAvailabilityPendingJson[0]
                    : v.exitAvailabilityPendingJson

                if (typeof pendingRaw === 'string' && pendingRaw.length > 0) {
                    try {
                        const parsed = JSON.parse(pendingRaw) as Record<string, string>
                        locationPendingById.set(id, parsed)
                    } catch {
                        // ignore malformed JSON for map payload resilience; hydration path emits diagnostics
                    }
                }

                const forbiddenRaw = Array.isArray(v.exitAvailabilityForbiddenJson)
                    ? v.exitAvailabilityForbiddenJson[0]
                    : v.exitAvailabilityForbiddenJson

                if (typeof forbiddenRaw === 'string' && forbiddenRaw.length > 0) {
                    try {
                        const parsed = JSON.parse(forbiddenRaw) as Record<string, ForbiddenExitEntry | string>
                        locationForbiddenById.set(id, parsed)
                    } catch {
                        // ignore malformed JSON for map payload resilience; hydration path emits diagnostics
                    }
                }
            }

            const edges: WorldGraphEdge[] = (rawEdges || []).map((e) => ({
                fromId: String(e.fromId),
                toId: String(e.toId),
                direction: String(e.direction),
                travelDurationMs: Number(e.travelDurationMs) > 0 ? Number(e.travelDurationMs) : undefined
            }))

            const hardDirectionsBySource = new Map<string, Set<string>>()
            for (const edge of edges) {
                const set = hardDirectionsBySource.get(edge.fromId) ?? new Set<string>()
                set.add(edge.direction)
                hardDirectionsBySource.set(edge.fromId, set)
            }

            for (const [fromId, pending] of locationPendingById.entries()) {
                const hardDirections = hardDirectionsBySource.get(fromId) ?? new Set<string>()

                // Source node tags are available via nodesById; use them to derive
                // structured frontier context on-demand.
                const sourceTags = nodesById.get(fromId)?.tags

                for (const [direction, reason] of Object.entries(pending)) {
                    if (!reason || hardDirections.has(direction)) continue

                    const macroCtx = resolveMacroGenerationContext(sourceTags, direction as Direction)
                    const frontierCtx = buildAtlasAwarePendingMetadata(macroCtx)

                    const syntheticId = pendingNodeId(fromId, direction)
                    if (!nodesById.has(syntheticId)) {
                        nodesById.set(syntheticId, {
                            id: syntheticId,
                            name: pendingNodeName(direction, frontierCtx.structuralArchetype),
                            tags: ['pending:synthetic'],
                            structuralClass: frontierCtx.structuralArchetype
                        })
                    }

                    edges.push({
                        fromId,
                        toId: syntheticId,
                        direction,
                        pending: true,
                        frontierContext: frontierCtx
                    })
                }
            }

            // Forbidden exits are permanent barriers — include them so consumers can distinguish
            // which directions are pending (will be generated) vs permanently blocked.
            for (const [fromId, forbidden] of locationForbiddenById.entries()) {
                const hardDirections = hardDirectionsBySource.get(fromId) ?? new Set<string>()

                for (const [direction, rawEntry] of Object.entries(forbidden)) {
                    if (!rawEntry || hardDirections.has(direction)) continue

                    const entry = normalizeForbiddenEntry(rawEntry)
                    const syntheticId = forbiddenNodeId(fromId, direction)
                    if (!nodesById.has(syntheticId)) {
                        nodesById.set(syntheticId, {
                            id: syntheticId,
                            name: forbiddenNodeName(entry.motif),
                            tags: ['forbidden:synthetic']
                        })
                    }

                    edges.push({
                        fromId,
                        toId: syntheticId,
                        direction,
                        forbidden: true,
                        forbiddenContext: { reason: entry.reason, motif: entry.motif, reveal: entry.reveal }
                    })
                }
            }

            const nodes = Array.from(nodesById.values())

            this.track('World.Map.Fetched', {
                nodeCount: nodes.length,
                edgeCount: edges.length,
                latencyMs: this.latencyMs
            })

            return okResponse({ nodes, edges } satisfies WorldGraphResponse, {
                correlationId: this.correlationId
            })
        } catch (error) {
            return internalErrorResponse(error, { correlationId: this.correlationId })
        }
    }
}

export async function getWorldGraphHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(WorldGraphHandler)
    return handler.handle(req, context)
}
