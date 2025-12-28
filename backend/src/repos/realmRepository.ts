import { RealmVertex } from '@piquet-h/shared'

/**
 * Repository contract for realm vertex and edge operations.
 * Manages hierarchical spatial/conceptual groupings and their relationships.
 *
 * Edge semantics:
 * - `within`: Containment hierarchy (DAG, no cycles). Location→Realm or Realm→Realm.
 * - `member_of`: Overlapping classification. Allows multiple memberships.
 * - `borders`: Symmetric adjacency between realms.
 * - `on_route`: Infrastructure connection with route name property.
 * - `vassal_of`, `allied_with`, `at_war_with`: Directional political relationships.
 */
export interface IRealmRepository {
    /**
     * Get a realm vertex by ID.
     * @param id - Realm GUID
     * @returns Realm vertex or undefined if not found
     */
    get(id: string): Promise<RealmVertex | undefined>

    /**
     * Upsert (create or update) a realm vertex.
     * @param realm - Realm vertex to persist
     * @returns Result with created flag and realm ID
     */
    upsert(realm: RealmVertex): Promise<{ created: boolean; id: string }>

    /**
     * Add a containment edge (within) from child to parent.
     * Enforces DAG constraint: rejects if edge would create a cycle.
     *
     * @param childId - Child entity ID (Location or Realm)
     * @param parentId - Parent realm ID
     * @returns Result with created flag, or error if cycle detected
     * @throws Error if adding edge would create a cycle
     */
    addWithinEdge(childId: string, parentId: string): Promise<{ created: boolean }>

    /**
     * Add a membership edge (member_of) from entity to realm.
     * Allows multiple memberships (overlapping classification).
     *
     * @param entityId - Entity ID (Location or Realm)
     * @param realmId - Realm ID
     * @returns Result with created flag
     */
    addMembershipEdge(entityId: string, realmId: string): Promise<{ created: boolean }>

    /**
     * Add a bidirectional border edge between two realms.
     * Creates symmetric adjacency relationship.
     *
     * @param realm1Id - First realm ID
     * @param realm2Id - Second realm ID
     * @returns Result with created flags for both directions
     * @throws Error if realm1Id === realm2Id (self-loop)
     */
    addBorderEdge(realm1Id: string, realm2Id: string): Promise<{ created: boolean; reciprocalCreated: boolean }>

    /**
     * Add a route edge (on_route) between two locations with a named route.
     * Creates infrastructure connection with route name property.
     *
     * @param fromId - Source location ID
     * @param toId - Destination location ID
     * @param routeName - Name of the route (e.g., "The King's Road")
     * @returns Result with created flag
     */
    addRouteEdge(fromId: string, toId: string, routeName: string): Promise<{ created: boolean }>

    /**
     * Add a directional political edge between realms.
     * Supports: vassal_of, allied_with, at_war_with.
     *
     * @param sourceId - Source realm ID
     * @param targetId - Target realm ID
     * @param edgeType - Political relationship type
     * @returns Result with created flag
     */
    addPoliticalEdge(
        sourceId: string,
        targetId: string,
        edgeType: 'vassal_of' | 'allied_with' | 'at_war_with'
    ): Promise<{ created: boolean }>

    /**
     * Query containment chain (ancestors) for a given entity.
     * Traverses `within` edges upward to find all containing realms.
     *
     * @param entityId - Entity ID (Location or Realm)
     * @returns Array of ancestor realms, ordered from nearest to farthest
     */
    getContainmentChain(entityId: string): Promise<RealmVertex[]>

    /**
     * Query all realms that an entity is a member of.
     * Traverses `member_of` edges.
     *
     * @param entityId - Entity ID (Location or Realm)
     * @returns Array of realms the entity is a member of
     */
    getMemberships(entityId: string): Promise<RealmVertex[]>

    /**
     * Query all realms that border a given realm.
     * Traverses `borders` edges (bidirectional).
     *
     * @param realmId - Realm ID
     * @returns Array of bordering realms
     */
    getBorderingRealms(realmId: string): Promise<RealmVertex[]>

    /**
     * Delete a realm vertex and all its connected edges.
     *
     * @param id - Realm ID
     * @returns Result with deleted flag
     */
    deleteRealm(id: string): Promise<{ deleted: boolean }>

    /**
     * Get the weather zone realm for a given location.
     * Traverses `within` edges upward through containment chain to find
     * the first realm with realmType='WEATHER_ZONE'.
     *
     * @param locationId - Location ID
     * @returns Weather zone realm or null if not found
     */
    getWeatherZoneForLocation(locationId: string): Promise<RealmVertex | null>
}
