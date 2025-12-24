# Realm Hierarchy Architecture

Purpose: Define a unified graph-based model for geographic, political, functional, and narrative realms that provide contextual grouping for atomic locations. This enables consistent regional weather, rich AI context, and scalable world organization.

---

## Concepts

- Location: Atomic point in the world (existing). Remains a Gremlin vertex with exits forming topology.
- Realm: New Gremlin vertex type representing any spatial or conceptual grouping. A location may belong to multiple realms simultaneously.

### Realm Vertex

Label: `realm`

Properties (minimum):

- id: GUID
- name: string
- realmType: RealmType (enum)
- scope: RealmScope (enum)
- description?: string
- narrativeTags?: string[]
- properties?: object (optional domain-specific attributes; e.g., climate, government, culturalTraits)

RealmType (initial set):

- WORLD, CONTINENT, MOUNTAIN_RANGE, FOREST, DESERT, OCEAN
- KINGDOM, DUCHY, COUNTY, CITY_STATE
- METROPOLIS, CITY, TOWN, VILLAGE, DISTRICT, QUARTER, STREET
- WEATHER_ZONE
- TRADE_NETWORK, ALLIANCE, CULTURAL_REGION, MILITARY_COMMAND
- DUNGEON, RUINS, SACRED_SITE

RealmScope:

- GLOBAL, CONTINENTAL, MACRO, REGIONAL, LOCAL, MICRO

### Edges

Realm edges define relationships between realms and between locations/realms. All edges are managed via the `IRealmRepository` interface.

#### Edge Labels

- **within** (containment hierarchy): Location → Realm, Realm → Realm
- **member_of** (overlapping classification): Location → Realm, Realm → Realm
- **borders** (adjacency): Realm ↔ Realm (bidirectional/symmetric)
- **on_route** (infrastructure): Location → Location
- **vassal_of** (political subordination): Realm → Realm (directional)
- **allied_with** (political alliance): Realm → Realm (directional)
- **at_war_with** (political conflict): Realm → Realm (directional)

#### Edge Properties

**RouteEdge** (for `on_route` edges):
- `routeName: string` - Human-readable route name (e.g., "The King's Road")

Future edge properties may include:
- `BorderEdge`: crossingDifficulty, checkpoint details
- `PoliticalEdge`: treaty details, since/until timestamps

#### Edge Semantics & Constraints

**within (Containment Hierarchy)**

Purpose: Define hierarchical containment (e.g., location within district, district within city).

Constraints:
- **DAG enforcement**: Forms a Directed Acyclic Graph (no cycles). Cycle detection validates that adding a `within` edge would not create a loop.
- **Multi-parent allowed**: A location or realm MAY have multiple parents via `within` edges. Example: A border location belongs to multiple districts.
- **Self-loops prohibited**: Cannot create `within` edge where childId === parentId.

Validation:
```typescript
// Before adding: realm1.within(realm2)
// Check: Is realm2 already within realm1's containment chain?
const realm2Chain = await getContainmentChain(realm2.id)
if (realm2Chain.includes(realm1.id)) {
    throw Error('Cycle detected')
}
```

**member_of (Overlapping Classification)**

Purpose: Allow entities to belong to multiple conceptual groupings without hierarchical constraints.

Constraints:
- **No cycle detection**: Memberships can be circular (e.g., trade network members can contain other networks).
- **Multi-membership encouraged**: Locations/realms should belong to multiple overlapping realms (e.g., a city is part of both a trade network and a cultural region).

**borders (Adjacency)**

Purpose: Define symmetric adjacency between realms (e.g., Kingdom A borders Kingdom B).

Constraints:
- **Bidirectional**: Creating `borders` edge from realm1 to realm2 automatically creates reciprocal edge from realm2 to realm1.
- **Self-loops prohibited**: Cannot create `borders` edge where realm1Id === realm2Id.
- **Idempotent**: Creating duplicate border edges is safe (no-op).

**on_route (Infrastructure)**

Purpose: Connect locations via named routes/roads (e.g., "The King's Road" connects cities).

Constraints:
- **Required property**: `routeName` must be non-empty string.
- **Directional**: Routes may be one-way; create reciprocal edge if bidirectional.

**Political Edges (vassal_of, allied_with, at_war_with)**

Purpose: Define directional political relationships between realms.

Constraints:
- **Directional**: Source realm has relationship TO target realm (not symmetric).
- **Type-specific semantics**:
  - `vassal_of`: Source realm is subordinate to target realm.
  - `allied_with`: Source realm has alliance with target realm.
  - `at_war_with`: Source realm is in conflict with target realm.
- Future: May add time-varying properties (since/until) in M7.

Constraints:

- `within` edges form a DAG (no cycles). Multi-parent allowed for border locations and overlapping administrative boundaries.
- `borders` edges are bidirectional and enforce reciprocal creation.
- Self-loops prohibited for `within` and `borders` edges.

---

## Query Patterns

### Basic Realm Queries

**Get realm by ID:**
```typescript
const realm = await realmRepository.get(realmId)
```

**Create/update realm:**
```typescript
const result = await realmRepository.upsert({
    id: 'realm-001',
    name: 'The Whispering Woods',
    realmType: 'FOREST',
    scope: 'REGIONAL',
    description: 'Ancient forest...',
    narrativeTags: ['mysterious', 'ancient']
})
```

### Containment Hierarchy (within)

**Ancestors for a location (Gremlin):**
```gremlin
g.V(<locationId>).repeat(out('within').simplePath()).emit()
```

**Ancestors for a location (Repository):**
```typescript
const ancestors = await realmRepository.getContainmentChain(locationId)
// Returns: [immediateParent, grandparent, ..., root]
```

**Find weather zone for a location:**
```gremlin
g.V(<locationId>)
 .repeat(out('within').simplePath()).emit()
 .hasLabel('realm').has('realmType','WEATHER_ZONE').limit(1)
```

**Locations in a realm (recursive):**
```gremlin
g.V(<realmId>).repeat(in('within')).emit(hasLabel('location')).dedup()
```

**Add containment edge:**
```typescript
// Add location within realm (with DAG cycle detection)
await realmRepository.addWithinEdge(locationId, realmId)

// Add realm within parent realm
await realmRepository.addWithinEdge(childRealmId, parentRealmId)
```

### Membership (member_of)

**Get all memberships for an entity:**
```typescript
const memberships = await realmRepository.getMemberships(entityId)
// Returns: Array of realms the entity is a member of
```

**Add membership:**
```typescript
// Location joins trade network
await realmRepository.addMembershipEdge(locationId, tradeNetworkId)

// Realm joins alliance
await realmRepository.addMembershipEdge(realmId, allianceId)
```

### Adjacency (borders)

**Get bordering realms:**
```typescript
const neighbors = await realmRepository.getBorderingRealms(realmId)
// Returns: Array of realms that border this realm
```

**Add border (bidirectional):**
```typescript
// Creates edges in both directions
await realmRepository.addBorderEdge(kingdom1Id, kingdom2Id)
```

### Infrastructure (on_route)

**Add named route:**
```typescript
// Connect locations via "The King's Road"
await realmRepository.addRouteEdge(city1Id, city2Id, "The King's Road")
```

**Query routes (Gremlin):**
```gremlin
// Find all routes from a location
g.V(<locationId>).outE('on_route').project('to','routeName')
 .by(inV().id())
 .by(values('routeName'))
```

### Political Relationships

**Add political edges:**
```typescript
// Vassal relationship
await realmRepository.addPoliticalEdge(vassalRealmId, empireId, 'vassal_of')

// Alliance
await realmRepository.addPoliticalEdge(kingdom1Id, kingdom2Id, 'allied_with')

// War
await realmRepository.addPoliticalEdge(kingdom1Id, kingdom2Id, 'at_war_with')
```

**Query political relationships (Gremlin):**
```gremlin
// Find all vassals of an empire
g.V(<empireId>).in('vassal_of').values('name')

// Find all allies
g.V(<realmId>).out('allied_with').values('name')

// Find enemies
g.V(<realmId>).out('at_war_with').values('name')
```

Ancestors for a location:

```
g.V(<locationId>).repeat(out('within').simplePath()).emit()
```

Find weather zone for a location:

```
g.V(<locationId>)
 .repeat(out('within').simplePath()).emit()
 .hasLabel('realm').has('realmType','WEATHER_ZONE').limit(1)
```

Locations in a realm:

```
g.V(<realmId>).repeat(in('within')).emit(hasLabel('location')).dedup()
```

---

## Description Layers Integration (SQL)

Description layers target either a specific location or a realm. This supports zone-based weather and other regional overlays.

- Container: `descriptionLayers` (SQL API)
- Partition key: `/scopeId`
- Scope patterns: `loc:<locationId>` or `realm:<realmId>`
- Common fields: `layerType`, `effectiveFromTick`, `effectiveToTick`, `value`, `metadata?`

Resolution priority when rendering a layer for a location at tick T:

1. Location-specific (`loc:<locationId>`)
2. Containing weather zone (`realm:<zoneId>`, realmType=WEATHER_ZONE)
3. Broader containing realms ordered by RealmScope (LOCAL → REGIONAL → MACRO → CONTINENTAL → GLOBAL)

---

## MVP Scope (M3c)

1. Add `realm` vertex + enums (schema only)
2. Add `within` edges for Weather Zones and attach relevant locations
3. Migrate `descriptionLayers` to `/scopeId` and implement realm scope resolution

Deferred (M5+): Geographic & Administrative hierarchies (continents, kingdoms, cities)

Deferred (M6+): Conceptual realms (trade networks, alliances, cultural regions)

---

## Related Documents

- Design Module overview: `../design-modules/README.md` (World Structure module)
- Temporal framework: `../modules/world-time-temporal-reconciliation.md`
- SQL containers: `./cosmos-sql-containers.md`
- Implementation: `backend/src/repos/realmRepository.ts`, `backend/src/repos/realmRepository.cosmos.ts`
- Tests: `backend/test/integration/realmRepository.test.ts`, `shared/test/realmEdges.test.ts`

## Implementation Notes

### Repository Interface

The `IRealmRepository` interface (defined in `backend/src/repos/realmRepository.ts`) provides all realm and edge operations:

**Realm CRUD:**
- `get(id)` - Retrieve realm by ID
- `upsert(realm)` - Create or update realm
- `deleteRealm(id)` - Delete realm and all connected edges

**Edge Management:**
- `addWithinEdge(childId, parentId)` - Containment with cycle detection
- `addMembershipEdge(entityId, realmId)` - Overlapping classification
- `addBorderEdge(realm1, realm2)` - Bidirectional adjacency
- `addRouteEdge(fromId, toId, routeName)` - Infrastructure with route name
- `addPoliticalEdge(sourceId, targetId, type)` - Political relationships

**Query Helpers:**
- `getContainmentChain(entityId)` - Traverse `within` edges upward
- `getMemberships(entityId)` - Traverse `member_of` edges
- `getBorderingRealms(realmId)` - Traverse `borders` edges

### Testing

**Unit Tests** (`shared/test/realmEdges.test.ts`):
- Edge label validation (7 labels)
- RouteEdge interface validation

**Integration Tests** (`backend/test/integration/realmRepository.test.ts`):
- Tests run in both `memory` and `cosmos` modes via `describeForBothModes`
- 24 test cases covering all edge types and validation rules
- Tests include: CRUD, cycle detection, self-loop validation, bidirectionality

### DAG Cycle Detection Algorithm

The `within` edge cycle detection uses a simple containment chain traversal:

1. Before adding edge from `child` to `parent`
2. Query containment chain of `parent` (all ancestors)
3. If `child` appears in `parent`'s chain → reject (would create cycle)
4. Otherwise → allow edge creation

This ensures the `within` edges always form a Directed Acyclic Graph (DAG).

### Multi-Parent Policy

**Decision: Multi-parent `within` edges are ALLOWED.**

Rationale:
- Border locations can conceptually belong to multiple administrative districts
- Weather zones may overlap
- Trade routes may traverse multiple jurisdictions

Example:
```
Location "Border Outpost"
  → within District A (northern jurisdiction)
  → within District B (southern jurisdiction)
  → within Weather Zone "Storm Coast"
```

This creates a multi-parent DAG, not a strict tree. The cycle detection algorithm handles this correctly by checking for cycles, not parent count.

Last updated: 2025-12-23
