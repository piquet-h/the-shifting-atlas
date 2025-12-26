import { RealmVertex, isRealmEdgeLabel } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import type { IGremlinClient } from '../gremlin/gremlinClient.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import { CosmosGremlinRepository, WORLD_GRAPH_PARTITION_KEY_PROP } from './base/index.js'
import { IRealmRepository } from './realmRepository.js'
import { firstScalar } from './utils/index.js'

/**
 * Cosmos (Gremlin) implementation of IRealmRepository.
 * Manages realm vertices and edges in the world graph.
 */
@injectable()
export class CosmosRealmRepository extends CosmosGremlinRepository implements IRealmRepository {
    constructor(
        @inject('GremlinClient') client: IGremlinClient,
        @inject(TelemetryService) protected telemetryService: TelemetryService
    ) {
        super(client, telemetryService)
    }

    async get(id: string): Promise<RealmVertex | undefined> {
        try {
            const vertices = await this.query<Record<string, unknown>>('g.V(realmId).hasLabel("realm").valueMap(true)', { realmId: id })
            if (!vertices || vertices.length === 0) {
                return undefined
            }

            const v = vertices[0]
            return {
                id: String(v.id || v['id']),
                name: firstScalar(v.name) || 'Unknown Realm',
                realmType: firstScalar(v.realmType) as any, // Type assertion needed; validated on write
                scope: firstScalar(v.scope) as any,
                description: firstScalar(v.description) as string | undefined,
                narrativeTags: Array.isArray(v.narrativeTags) ? (v.narrativeTags as string[]) : undefined,
                properties: v.properties ? (v.properties as Record<string, unknown>) : undefined
            }
        } catch (error) {
            console.error(`[RealmRepository.get] Error fetching realm ${id}:`, error)
            throw error
        }
    }

    async upsert(realm: RealmVertex): Promise<{ created: boolean; id: string }> {
        // Input validation
        if (!realm.id || !realm.name || !realm.realmType || !realm.scope) {
            throw new Error('Realm missing required fields (id, name, realmType, scope)')
        }

        const startTime = Date.now()
        let success = false
        let created = false

        try {
            // Check if realm exists
            const existingVertices = await this.queryWithTelemetry<Record<string, unknown>>(
                'realm.upsert.check',
                'g.V(rid).hasLabel("realm").valueMap(true)',
                { rid: realm.id }
            )
            const exists = existingVertices && existingVertices.length > 0
            created = !exists

            // Build the upsert query
            const bindings: Record<string, unknown> = {
                rid: realm.id,
                name: realm.name,
                realmType: realm.realmType,
                scope: realm.scope
            }

            let query =
                `g.V(rid).fold().coalesce(unfold(), addV('realm').property('id', rid).property('${WORLD_GRAPH_PARTITION_KEY_PROP}', pk))` +
                `.property('name', name).property('realmType', realmType).property('scope', scope)`

            // Add optional description
            if (realm.description !== undefined) {
                bindings.desc = realm.description
                query += `.property('description', desc)`
            }

            // Drop existing narrativeTags first (to replace them)
            if (realm.narrativeTags && realm.narrativeTags.length > 0) {
                query += `.sideEffect(properties('narrativeTags').drop())`
            }

            // Add each narrativeTag as a separate property
            if (realm.narrativeTags && realm.narrativeTags.length > 0) {
                for (let i = 0; i < realm.narrativeTags.length; i++) {
                    bindings[`tag${i}`] = realm.narrativeTags[i]
                    query += `.property('narrativeTags', tag${i})`
                }
            }

            // Add properties bag as a single property (Cosmos Gremlin supports JSON objects)
            if (realm.properties !== undefined) {
                try {
                    bindings.props = JSON.stringify(realm.properties)
                    query += `.property('properties', props)`
                } catch (error) {
                    // Log JSON serialization error but continue (properties are optional)
                    console.warn(`[RealmRepository.upsert] Failed to serialize properties for realm ${realm.id}:`, error)
                }
            }

            await this.queryWithTelemetry('realm.upsert.write', query, bindings)

            success = true
            return { created, id: realm.id }
        } catch (error) {
            success = false
            throw error
        } finally {
            const latencyMs = Date.now() - startTime
            this.telemetryService?.trackGameEventStrict('World.Realm.Upsert', {
                realmId: realm.id,
                latencyMs,
                success,
                created: success ? created : undefined
            })
        }
    }

    async addWithinEdge(childId: string, parentId: string): Promise<{ created: boolean }> {
        // Validate against self-reference
        if (childId === parentId) {
            throw new Error('Cannot create within edge to self (childId === parentId)')
        }

        // Check if adding this edge would create a cycle
        // Strategy: Check if parent is already within the child's containment chain
        const parentChain = await this.getContainmentChain(parentId)
        if (parentChain.some((r) => r.id === childId)) {
            throw new Error(`Cannot add within edge: would create cycle (${parentId} is already within ${childId}'s containment chain)`)
        }

        // Ensure vertices exist - child could be location or realm, parent is always realm
        // We use a permissive approach: try location first, will be no-op if vertex exists with different label
        await this.ensureVertex('location', childId)
        await this.ensureVertex('realm', parentId)

        // Check if edge already exists
        const existingEdges = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.addWithinEdge.check',
            "g.V(cid).outE('within').where(inV().hasId(pid))",
            { cid: childId, pid: parentId }
        )

        if (existingEdges && existingEdges.length > 0) {
            return { created: false }
        }

        // Create edge
        await this.queryWithTelemetry('realm.addWithinEdge.create', "g.V(cid).addE('within').to(g.V(pid))", { cid: childId, pid: parentId })

        this.telemetryService?.trackGameEventStrict('World.Realm.EdgeCreated', {
            childId,
            parentId
        })

        return { created: true }
    }

    async addMembershipEdge(entityId: string, realmId: string): Promise<{ created: boolean }> {
        // Ensure vertices exist - entity could be location or realm, realm is always realm
        // We use a permissive approach: try location first, will be no-op if vertex exists with different label
        await this.ensureVertex('location', entityId)
        await this.ensureVertex('realm', realmId)

        // Check if edge already exists
        const existingEdges = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.addMembershipEdge.check',
            "g.V(eid).outE('member_of').where(inV().hasId(rid))",
            { eid: entityId, rid: realmId }
        )

        if (existingEdges && existingEdges.length > 0) {
            return { created: false }
        }

        // Create edge
        await this.queryWithTelemetry('realm.addMembershipEdge.create', "g.V(eid).addE('member_of').to(g.V(rid))", {
            eid: entityId,
            rid: realmId
        })

        return { created: true }
    }

    async addBorderEdge(realm1Id: string, realm2Id: string): Promise<{ created: boolean; reciprocalCreated: boolean }> {
        // Validate against self-reference
        if (realm1Id === realm2Id) {
            throw new Error('Cannot create border edge to self (realm1Id === realm2Id)')
        }

        // Ensure vertices exist
        await this.ensureVertex('realm', realm1Id)
        await this.ensureVertex('realm', realm2Id)

        // Check if edges already exist (both directions)
        const existingEdge1 = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.addBorderEdge.check1',
            "g.V(r1).outE('borders').where(inV().hasId(r2))",
            { r1: realm1Id, r2: realm2Id }
        )

        const existingEdge2 = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.addBorderEdge.check2',
            "g.V(r2).outE('borders').where(inV().hasId(r1))",
            { r1: realm1Id, r2: realm2Id }
        )

        const created1 = !existingEdge1 || existingEdge1.length === 0
        const created2 = !existingEdge2 || existingEdge2.length === 0

        // Create first edge if needed
        if (created1) {
            await this.queryWithTelemetry('realm.addBorderEdge.create1', "g.V(r1).addE('borders').to(g.V(r2))", {
                r1: realm1Id,
                r2: realm2Id
            })
        }

        // Create reciprocal edge if needed
        if (created2) {
            await this.queryWithTelemetry('realm.addBorderEdge.create2', "g.V(r2).addE('borders').to(g.V(r1))", {
                r1: realm1Id,
                r2: realm2Id
            })
        }

        return { created: created1, reciprocalCreated: created2 }
    }

    async addRouteEdge(fromId: string, toId: string, routeName: string): Promise<{ created: boolean }> {
        // Validate routeName
        if (!routeName || routeName.trim() === '') {
            throw new Error('Route name cannot be empty')
        }

        // Ensure vertices exist (locations)
        await this.ensureVertex('location', fromId)
        await this.ensureVertex('location', toId)

        // Check if edge already exists
        const existingEdges = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.addRouteEdge.check',
            "g.V(fid).outE('on_route').where(inV().hasId(tid))",
            { fid: fromId, tid: toId }
        )

        if (existingEdges && existingEdges.length > 0) {
            return { created: false }
        }

        // Create edge with routeName property
        await this.queryWithTelemetry('realm.addRouteEdge.create', "g.V(fid).addE('on_route').to(g.V(tid)).property('routeName', rname)", {
            fid: fromId,
            tid: toId,
            rname: routeName
        })

        return { created: true }
    }

    async addPoliticalEdge(
        sourceId: string,
        targetId: string,
        edgeType: 'vassal_of' | 'allied_with' | 'at_war_with'
    ): Promise<{ created: boolean }> {
        // Validate edge type
        if (!isRealmEdgeLabel(edgeType)) {
            throw new Error(`Invalid political edge type: ${edgeType}`)
        }

        // Ensure vertices exist (realms)
        await this.ensureVertex('realm', sourceId)
        await this.ensureVertex('realm', targetId)

        // Check if edge already exists
        const existingEdges = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.addPoliticalEdge.check',
            `g.V(sid).outE('${edgeType}').where(inV().hasId(tid))`,
            { sid: sourceId, tid: targetId }
        )

        if (existingEdges && existingEdges.length > 0) {
            return { created: false }
        }

        // Create edge
        await this.queryWithTelemetry('realm.addPoliticalEdge.create', `g.V(sid).addE('${edgeType}').to(g.V(tid))`, {
            sid: sourceId,
            tid: targetId
        })

        return { created: true }
    }

    async getContainmentChain(entityId: string): Promise<RealmVertex[]> {
        // Traverse 'within' edges upward, collecting all ancestor realms
        const result = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.getContainmentChain',
            "g.V(eid).repeat(out('within').simplePath()).emit().hasLabel('realm').valueMap(true).dedup()",
            { eid: entityId }
        )

        if (!result || result.length === 0) {
            return []
        }

        return result.map((v) => ({
            id: String(v.id || v['id']),
            name: firstScalar(v.name) || 'Unknown Realm',
            realmType: firstScalar(v.realmType) as any,
            scope: firstScalar(v.scope) as any,
            description: firstScalar(v.description) as string | undefined,
            narrativeTags: Array.isArray(v.narrativeTags) ? (v.narrativeTags as string[]) : undefined,
            properties: v.properties ? (v.properties as Record<string, unknown>) : undefined
        }))
    }

    async getMemberships(entityId: string): Promise<RealmVertex[]> {
        // Traverse 'member_of' edges to find all realms entity belongs to
        const result = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.getMemberships',
            "g.V(eid).out('member_of').hasLabel('realm').valueMap(true).dedup()",
            { eid: entityId }
        )

        if (!result || result.length === 0) {
            return []
        }

        return result.map((v) => ({
            id: String(v.id || v['id']),
            name: firstScalar(v.name) || 'Unknown Realm',
            realmType: firstScalar(v.realmType) as any,
            scope: firstScalar(v.scope) as any,
            description: firstScalar(v.description) as string | undefined,
            narrativeTags: Array.isArray(v.narrativeTags) ? (v.narrativeTags as string[]) : undefined,
            properties: v.properties ? (v.properties as Record<string, unknown>) : undefined
        }))
    }

    async getBorderingRealms(realmId: string): Promise<RealmVertex[]> {
        // Traverse 'borders' edges to find adjacent realms
        const result = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.getBorderingRealms',
            "g.V(rid).out('borders').hasLabel('realm').valueMap(true).dedup()",
            { rid: realmId }
        )

        if (!result || result.length === 0) {
            return []
        }

        return result.map((v) => ({
            id: String(v.id || v['id']),
            name: firstScalar(v.name) || 'Unknown Realm',
            realmType: firstScalar(v.realmType) as any,
            scope: firstScalar(v.scope) as any,
            description: firstScalar(v.description) as string | undefined,
            narrativeTags: Array.isArray(v.narrativeTags) ? (v.narrativeTags as string[]) : undefined,
            properties: v.properties ? (v.properties as Record<string, unknown>) : undefined
        }))
    }

    async deleteRealm(id: string): Promise<{ deleted: boolean }> {
        // Verify realm exists first
        const existing = await this.query<Record<string, unknown>>('g.V(rid).hasLabel("realm").limit(1)', { rid: id })
        if (!existing || existing.length === 0) {
            return { deleted: false }
        }

        // Delete the realm vertex and all connected edges
        await this.query('g.V(rid).drop()', { rid: id })

        return { deleted: true }
    }

    async getWeatherZoneForLocation(locationId: string): Promise<RealmVertex | null> {
        // Traverse 'within' edges upward through containment chain
        // Filter for realms with realmType='WEATHER_ZONE'
        // Return the first match (nearest weather zone)
        const result = await this.queryWithTelemetry<Record<string, unknown>>(
            'realm.getWeatherZoneForLocation',
            "g.V(lid).repeat(out('within').simplePath()).emit().hasLabel('realm').has('realmType', 'WEATHER_ZONE').limit(1).valueMap(true)",
            { lid: locationId }
        )

        if (!result || result.length === 0) {
            return null
        }

        const v = result[0]
        return {
            id: String(v.id || v['id']),
            name: firstScalar(v.name) || 'Unknown Realm',
            realmType: firstScalar(v.realmType) as any,
            scope: firstScalar(v.scope) as any,
            description: firstScalar(v.description) as string | undefined,
            narrativeTags: Array.isArray(v.narrativeTags) ? (v.narrativeTags as string[]) : undefined,
            properties: v.properties ? (v.properties as Record<string, unknown>) : undefined
        }
    }
}
