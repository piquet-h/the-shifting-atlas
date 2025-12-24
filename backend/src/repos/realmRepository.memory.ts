import { RealmVertex } from '@piquet-h/shared'
import { injectable } from 'inversify'
import { IRealmRepository } from './realmRepository.js'

/**
 * In-memory implementation of IRealmRepository for testing and local development.
 * Stores realms and edges in Map structures.
 */
@injectable()
export class InMemoryRealmRepository implements IRealmRepository {
    private realms: Map<string, RealmVertex> = new Map()
    private withinEdges: Map<string, Set<string>> = new Map() // childId -> Set<parentId>
    private membershipEdges: Map<string, Set<string>> = new Map() // entityId -> Set<realmId>
    private borderEdges: Map<string, Set<string>> = new Map() // realmId -> Set<borderingRealmId>
    private routeEdges: Map<string, Map<string, string>> = new Map() // fromId -> Map<toId, routeName>
    private politicalEdges: Map<string, Map<string, 'vassal_of' | 'allied_with' | 'at_war_with'>> = new Map() // sourceId -> Map<targetId, edgeType>

    async get(id: string): Promise<RealmVertex | undefined> {
        return this.realms.get(id)
    }

    async upsert(realm: RealmVertex): Promise<{ created: boolean; id: string }> {
        const created = !this.realms.has(realm.id)
        this.realms.set(realm.id, { ...realm })
        return { created, id: realm.id }
    }

    async addWithinEdge(childId: string, parentId: string): Promise<{ created: boolean }> {
        // Validate against self-reference
        if (childId === parentId) {
            throw new Error('Cannot create within edge to self (childId === parentId)')
        }

        // Check for cycle: if parent is already within child's containment chain
        const parentChain = await this.getContainmentChain(parentId)
        if (parentChain.some((r) => r.id === childId)) {
            throw new Error(`Cannot add within edge: would create cycle (${parentId} is already within ${childId}'s containment chain)`)
        }

        // Check if edge already exists
        const existing = this.withinEdges.get(childId)
        if (existing && existing.has(parentId)) {
            return { created: false }
        }

        // Add edge
        if (!this.withinEdges.has(childId)) {
            this.withinEdges.set(childId, new Set())
        }
        this.withinEdges.get(childId)!.add(parentId)

        return { created: true }
    }

    async addMembershipEdge(entityId: string, realmId: string): Promise<{ created: boolean }> {
        // Check if edge already exists
        const existing = this.membershipEdges.get(entityId)
        if (existing && existing.has(realmId)) {
            return { created: false }
        }

        // Add edge
        if (!this.membershipEdges.has(entityId)) {
            this.membershipEdges.set(entityId, new Set())
        }
        this.membershipEdges.get(entityId)!.add(realmId)

        return { created: true }
    }

    async addBorderEdge(realm1Id: string, realm2Id: string): Promise<{ created: boolean; reciprocalCreated: boolean }> {
        // Validate against self-reference
        if (realm1Id === realm2Id) {
            throw new Error('Cannot create border edge to self (realm1Id === realm2Id)')
        }

        // Check if edges already exist
        const existing1 = this.borderEdges.get(realm1Id)
        const existing2 = this.borderEdges.get(realm2Id)
        const created = !existing1 || !existing1.has(realm2Id)
        const reciprocalCreated = !existing2 || !existing2.has(realm1Id)

        // Add first edge
        if (created) {
            if (!this.borderEdges.has(realm1Id)) {
                this.borderEdges.set(realm1Id, new Set())
            }
            this.borderEdges.get(realm1Id)!.add(realm2Id)
        }

        // Add reciprocal edge
        if (reciprocalCreated) {
            if (!this.borderEdges.has(realm2Id)) {
                this.borderEdges.set(realm2Id, new Set())
            }
            this.borderEdges.get(realm2Id)!.add(realm1Id)
        }

        return { created, reciprocalCreated }
    }

    async addRouteEdge(fromId: string, toId: string, routeName: string): Promise<{ created: boolean }> {
        // Validate routeName
        if (!routeName || routeName.trim() === '') {
            throw new Error('Route name cannot be empty')
        }

        // Check if edge already exists
        const existing = this.routeEdges.get(fromId)
        if (existing && existing.has(toId)) {
            return { created: false }
        }

        // Add edge
        if (!this.routeEdges.has(fromId)) {
            this.routeEdges.set(fromId, new Map())
        }
        this.routeEdges.get(fromId)!.set(toId, routeName)

        return { created: true }
    }

    async addPoliticalEdge(
        sourceId: string,
        targetId: string,
        edgeType: 'vassal_of' | 'allied_with' | 'at_war_with'
    ): Promise<{ created: boolean }> {
        // Check if edge already exists
        const existing = this.politicalEdges.get(sourceId)
        if (existing && existing.has(targetId)) {
            return { created: false }
        }

        // Add edge
        if (!this.politicalEdges.has(sourceId)) {
            this.politicalEdges.set(sourceId, new Map())
        }
        this.politicalEdges.get(sourceId)!.set(targetId, edgeType)

        return { created: true }
    }

    async getContainmentChain(entityId: string): Promise<RealmVertex[]> {
        const chain: RealmVertex[] = []
        const visited = new Set<string>()
        const queue: string[] = [entityId]
        const maxDepth = 50 // Prevent infinite loops in case of data corruption

        let depth = 0
        while (queue.length > 0 && depth < maxDepth) {
            const currentId = queue.shift()!
            if (visited.has(currentId)) continue
            visited.add(currentId)

            const parents = this.withinEdges.get(currentId)
            if (parents) {
                for (const parentId of parents) {
                    const parentRealm = this.realms.get(parentId)
                    if (parentRealm) {
                        chain.push(parentRealm)
                        queue.push(parentId)
                    }
                }
            }

            depth++
        }

        return chain
    }

    async getMemberships(entityId: string): Promise<RealmVertex[]> {
        const memberships: RealmVertex[] = []
        const realmIds = this.membershipEdges.get(entityId)
        if (realmIds) {
            for (const realmId of realmIds) {
                const realm = this.realms.get(realmId)
                if (realm) {
                    memberships.push(realm)
                }
            }
        }
        return memberships
    }

    async getBorderingRealms(realmId: string): Promise<RealmVertex[]> {
        const bordering: RealmVertex[] = []
        const borderingIds = this.borderEdges.get(realmId)
        if (borderingIds) {
            for (const borderRealmId of borderingIds) {
                const realm = this.realms.get(borderRealmId)
                if (realm) {
                    bordering.push(realm)
                }
            }
        }
        return bordering
    }

    async deleteRealm(id: string): Promise<{ deleted: boolean }> {
        if (!this.realms.has(id)) {
            return { deleted: false }
        }

        // Delete realm and all edges
        this.realms.delete(id)
        this.withinEdges.delete(id)
        this.membershipEdges.delete(id)
        this.borderEdges.delete(id)
        this.routeEdges.delete(id)
        this.politicalEdges.delete(id)

        // Remove edges from other entities pointing to this realm
        for (const [, parentSet] of this.withinEdges) {
            parentSet.delete(id)
        }
        for (const [, realmSet] of this.membershipEdges) {
            realmSet.delete(id)
        }
        for (const [, borderSet] of this.borderEdges) {
            borderSet.delete(id)
        }
        for (const [, toMap] of this.routeEdges) {
            toMap.delete(id)
        }
        for (const [, targetMap] of this.politicalEdges) {
            targetMap.delete(id)
        }

        return { deleted: true }
    }
}
