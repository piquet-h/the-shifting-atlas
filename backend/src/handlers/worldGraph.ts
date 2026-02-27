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
import { type GameEventName } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { inject, injectable } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'
import type { ITelemetryClient } from '../telemetry/ITelemetryClient.js'
import { BaseHandler } from './base/BaseHandler.js'
import { internalErrorResponse, okResponse } from './utils/responseBuilder.js'

export interface WorldGraphNode {
    id: string
    name: string
    tags?: string[]
}

export interface WorldGraphEdge {
    fromId: string
    toId: string
    direction: string
    travelDurationMs?: number
}

export interface WorldGraphResponse {
    nodes: WorldGraphNode[]
    edges: WorldGraphEdge[]
}

/** Sentinel used in Gremlin coalesce() when travelDurationMs is absent on an edge. */
const TRAVEL_DURATION_ABSENT = -1

/**
 * Handler that returns all location nodes and exit edges as a graph.
 * Intentionally lightweight – no description compilation, no per-location exit fetches.
 */
@injectable()
export class WorldGraphHandler extends BaseHandler {
    constructor(
        @inject('ITelemetryClient') telemetry: ITelemetryClient,
        @inject('GremlinClient') private gremlinClient: IGremlinClient
    ) {
        super(telemetry)
    }

    protected async execute(_req: HttpRequest): Promise<HttpResponseInit> {
        try {
            const [rawNodes, rawEdges] = await Promise.all([
                this.gremlinClient.submit<Record<string, unknown>>("g.V().hasLabel('location').valueMap(true)"),
                this.gremlinClient.submit<Record<string, unknown>>(
                    "g.E().hasLabel('exit')" +
                        ".project('fromId','toId','direction','travelDurationMs')" +
                        '.by(outV().id())' +
                        '.by(inV().id())' +
                        '.by(values(\'direction\'))' +
                        `.by(coalesce(values('travelDurationMs'), constant(${TRAVEL_DURATION_ABSENT})))`
                )
            ])

            const nodes: WorldGraphNode[] = (rawNodes || []).map((v) => ({
                id: String(v.id || v['id']),
                name: Array.isArray(v.name) ? String((v.name as unknown[])[0]) : String(v.name || 'Unknown'),
                tags: Array.isArray(v.tags) ? (v.tags as string[]) : undefined
            }))

            const edges: WorldGraphEdge[] = (rawEdges || []).map((e) => ({
                fromId: String(e.fromId),
                toId: String(e.toId),
                direction: String(e.direction),
                travelDurationMs: Number(e.travelDurationMs) > 0 ? Number(e.travelDurationMs) : undefined
            }))

            // TODO: Remove cast once @piquet-h/shared is republished with 'World.Map.Fetched'.
            this.track('World.Map.Fetched' as GameEventName, {
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
