# Mosswell Repository Interfaces

> **Status**: Implemented (M1 Traversal)  
> **Location**: `backend/src/repos/`  
> **Related**: [ADR-001 Mosswell Persistence](../adr/ADR-001-mosswell-persistence-layering.md), [ADR-002 Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md)

## Purpose

This document provides a comprehensive overview of the repository interfaces used for Mosswell world persistence, covering location graph management, player state, description layering, and exit edge operations. These interfaces abstract persistence concerns and enable swappable implementations (in-memory for tests, Cosmos for production).

## Architecture Context

Mosswell uses a **dual persistence pattern** (ADR-002):

- **Cosmos DB Gremlin**: Immutable world structure (locations, exits, spatial relationships)
- **Cosmos DB SQL API**: Mutable player data and documents (players, inventory, description layers, world events)

Repository interfaces enforce this separation and provide a consistent contract for handlers and business logic.

## Core Repository Interfaces

### ILocationRepository

**Purpose**: Manages location vertices and spatial navigation in the world graph.

**Interface Location**: `backend/src/repos/locationRepository.ts`

**Key Operations**:

```typescript
interface ILocationRepository {
    // Retrieval
    get(id: string): Promise<Location | undefined>
    
    // Movement
    move(fromId: string, direction: string): Promise<
        | { status: 'ok'; location: Location }
        | { status: 'error'; reason: string }
    >
    
    // Mutation
    upsert(location: Location): Promise<{
        created: boolean
        id: string
        updatedRevision?: number
    }>
    
    // Exit Management
    ensureExit(
        fromId: string,
        direction: string,
        toId: string,
        description?: string
    ): Promise<{ created: boolean }>
    
    ensureExitBidirectional(
        fromId: string,
        direction: string,
        toId: string,
        opts?: {
            reciprocal?: boolean
            description?: string
            reciprocalDescription?: string
        }
    ): Promise<{
        created: boolean
        reciprocalCreated?: boolean
    }>
    
    removeExit(
        fromId: string,
        direction: string
    ): Promise<{ removed: boolean }>
    
    applyExits(
        exits: Array<{
            fromId: string
            direction: string
            toId: string
            description?: string
            reciprocal?: boolean
        }>
    ): Promise<{
        exitsCreated: number
        exitsSkipped: number
        reciprocalApplied: number
    }>
    
    updateExitsSummaryCache(
        locationId: string,
        cache: string
    ): Promise<{ updated: boolean }>
}
```

**Implementations**:

- **InMemoryLocationRepository**: JSON-backed, for tests and local dev
- **CosmosLocationRepository**: Gremlin-backed, for production

**Usage Pattern**:

```typescript
// Upsert is idempotent - safe to run multiple times
const { created, id } = await locationRepo.upsert({
    id: 'loc-mosswell-entrance',
    name: 'Mosswell Entrance',
    description: 'A weathered stone archway...',
    version: 1
})

// Ensure exit creates edge only if it doesn't exist
const { created: exitCreated } = await locationRepo.ensureExit(
    'loc-mosswell-entrance',
    'north',
    'loc-village-square'
)
```

**Idempotency Guarantees**:

- `upsert()`: Creates vertex if missing, updates if exists (by content hash)
- `ensureExit()`: Creates edge only if not present (no duplicates)
- `ensureExitBidirectional()`: Creates both directions atomically if requested
- `applyExits()`: Batch operation with individual idempotency per edge

### IPlayerRepository

**Purpose**: Manages player identity and session state in Cosmos SQL API.

**Interface Location**: `backend/src/repos/playerRepository.ts` (re-exported from `@piquet-h/shared/types/playerRepository`)

**Key Operations**:

```typescript
interface IPlayerRepository {
    // Retrieval
    get(playerId: string): Promise<PlayerRecord | undefined>
    
    // Creation
    getOrCreate(playerId?: string): Promise<{
        record: PlayerRecord
        created: boolean
    }>
    
    // External Identity Linking (future auth)
    linkExternalId(
        playerId: string,
        provider: string,
        externalId: string
    ): Promise<{ linked: boolean }>
    
    findByExternalId(
        provider: string,
        externalId: string
    ): Promise<PlayerRecord | undefined>
}

interface PlayerRecord {
    id: string // UUID v4
    displayName: string
    currentLocationId: string | null
    createdUtc: string
    lastActiveUtc?: string
    guest: boolean
    externalIds?: Record<string, string> // provider -> externalId
}
```

**Implementations**:

- **InMemoryPlayerRepository**: Map-backed, for tests
- **CosmosPlayerRepository**: SQL API-backed, for production

**Usage Pattern**:

```typescript
// Generate or retrieve existing player
const { record, created } = await playerRepo.getOrCreate()
console.log(created ? 'New player' : 'Existing player', record.id)

// Update player location
record.currentLocationId = 'loc-mosswell-entrance'
await playerRepo.update(record)
```

**Idempotency Guarantees**:

- `getOrCreate()`: Returns existing player if ID provided and found
- `linkExternalId()`: Safe to call multiple times for same provider+externalId pair

### IDescriptionRepository

**Purpose**: Manages additive description layers per ADR-001 (immutable base + additive variation).

**Interface Location**: `backend/src/repos/descriptionRepository.ts`

**Layer Types**:

- `structural_event`: Structural changes (damage, construction)
- `ambient`: Weather, lighting, sensory details
- `weather`: Explicit weather overlays
- `enhancement`: Lore enrichment, historical notes
- `personalization`: Player-specific observations

**Key Operations**:

```typescript
interface IDescriptionRepository {
    // Retrieval
    getLayersForLocation(
        locationId: string
    ): Promise<DescriptionLayer[]>
    
    getLayersForLocations(
        locationIds: string[]
    ): Promise<Map<string, DescriptionLayer[]>>
    
    // Mutation
    addLayer(layer: DescriptionLayer): Promise<{
        created: boolean
        id: string
    }>
    
    archiveLayer(layerId: string): Promise<{
        archived: boolean
    }>
}

interface DescriptionLayer {
    id: string
    locationId: string
    type: DescriptionLayerType
    content: string // Prose snippet (not full replacement)
    createdAt: string // ISO 8601
    expiresAt?: string // For ephemeral layers
    source?: string // 'ai-generated', 'player-action', etc.
    attributes?: Record<string, string | number | boolean>
    archived?: boolean
}
```

**Implementations**:

- **InMemoryDescriptionRepository**: Map-backed, for tests
- **CosmosDescriptionRepository**: SQL API `descriptionLayers` container

**Usage Pattern**:

```typescript
// Add ambient layer (does not mutate base location description)
const { created } = await descriptionRepo.addLayer({
    id: 'layer-ambient-rain-001',
    locationId: 'loc-mosswell-entrance',
    type: 'ambient',
    content: 'Rain patters against the weathered stones.',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    source: 'weather-system'
})

// Retrieve all active layers for composition
const layers = await descriptionRepo.getLayersForLocation('loc-mosswell-entrance')
// Compose final description: base + sorted layers
```

**Idempotency Guarantees**:

- `addLayer()`: Returns `created: false` if layer with same ID exists
- `archiveLayer()`: Safe to call multiple times (idempotent soft delete)

### IExitRepository

**Purpose**: Retrieval and ordering of exit edges (creation handled by ILocationRepository).

**Interface Location**: `backend/src/repos/exitRepository.ts`

**Key Operations**:

```typescript
interface IExitRepository {
    // Retrieval (ordered canonically)
    getExits(locationId: string): Promise<ExitEdgeResult[]>
    
    // Summary generation
    generateExitsSummary(locationId: string): Promise<string>
}

interface ExitEdgeResult {
    direction: Direction
    toLocationId: string
    description?: string
    kind?: string // 'door', 'archway', 'passage'
    state?: string // 'locked', 'hidden', 'open'
}
```

**Exit Ordering**:

Canonical order (from `sortExits()` utility):

1. **Compass**: north, south, east, west, northeast, northwest, southeast, southwest
2. **Vertical**: up, down
3. **Radial**: in, out
4. **Semantic**: Alphabetical (e.g., "portal", "secret_door")

**Usage Pattern**:

```typescript
const exits = await exitRepo.getExits('loc-mosswell-entrance')
// Returns: [{ direction: 'north', toLocationId: 'loc-village-square' }, ...]

const summary = await exitRepo.generateExitsSummary('loc-mosswell-entrance')
// Returns: "Exits: north, east" or "No exits available."
```

## Persistence Modes

The repository system supports two modes via `PERSISTENCE_MODE` environment variable:

### Memory Mode

**Use Case**: Tests, local dev without Azure dependencies

**Configuration**:
```json
// local.settings.json
{
  "Values": {
    "PERSISTENCE_MODE": "memory"
  }
}
```

**Characteristics**:
- Data loaded from `villageLocations.json`
- In-process state (lost on restart)
- No external dependencies
- Fast execution

### Cosmos Mode

**Use Case**: Production, staging, integration tests with real Azure resources

**Configuration**:
```json
// local.settings.json
{
  "Values": {
    "PERSISTENCE_MODE": "cosmos",
    "COSMOS_ENDPOINT": "https://<account>.gremlin.cosmos.azure.com:443/",
    "COSMOS_DATABASE": "shifting-atlas",
    "COSMOS_GRAPH_NAME": "world-graph",
    "COSMOS_SQL_ENDPOINT": "https://<account>.documents.azure.com:443/",
    "COSMOS_SQL_DATABASE": "game-docs"
  }
}
```

**Characteristics**:
- Durable persistence
- Graph traversal via Gremlin
- SQL API for mutable documents
- Requires Azure authentication

## Dependency Injection

Repositories use **Inversify** for DI, configured in `backend/src/container.ts`:

```typescript
// Bind repositories based on persistence mode
if (mode === 'cosmos') {
    container.bind<ILocationRepository>(TYPES.LocationRepository)
        .to(CosmosLocationRepository).inSingletonScope()
} else {
    container.bind<ILocationRepository>(TYPES.LocationRepository)
        .to(InMemoryLocationRepository).inSingletonScope()
}
```

**Function Usage**:

```typescript
import { container } from '../container.js'
import { TYPES } from '../types.js'

const locationRepo = container.get<ILocationRepository>(TYPES.LocationRepository)
```

## Testing Contracts

**Contract Test Location**: `backend/test/integration/repositoryInterfaces.test.ts`

These tests verify that both in-memory and Cosmos implementations satisfy the interface contracts:

```typescript
// Example contract test
test('ILocationRepository - upsert returns expected shape', async () => {
    const repo = await fixture.getLocationRepository()
    const result = await repo.upsert({
        id: 'test-loc-1',
        name: 'Test Location',
        description: 'A test location',
        version: 1
    })
    assert.ok(typeof result.created === 'boolean', 'created is boolean')
    assert.ok(result.id, 'id returned')
})
```

## Bootstrap Workflow

For initial world setup, see:

- **Script**: `backend/scripts/seed-production.ts` ([usage guide](./mosswell-bootstrap-script.md))
- **Function**: `backend/src/seeding/seedWorld.ts` (idempotent seeding logic)
- **Flow**: [Player Bootstrap Flow](./player-bootstrap-flow.md)

## Migration Pattern

For evolving world data over time, see:

- **Scaffold**: (Future) Migration script template with dry-run support
- **Workflow**: [Migration Workflow](./mosswell-migration-workflow.md)

## Performance Considerations

### Partition Keys

**Gremlin Graph** (`/partitionKey`):
- MVP: Single partition value `'world'` (see ADR-002)
- Future: Region-based sharding (`'mosswell'`, `'northern_ridge'`)
- Revisit threshold: >50k vertices or sustained >70% RU utilization

**SQL API Containers**:
- **players**: Partitioned by `/id` (player GUID)
- **inventory**: Partitioned by `/playerId` (colocates player items)
- **descriptionLayers**: Partitioned by `/locationId` (colocates location layers)
- **worldEvents**: Partitioned by `/scopeKey` (pattern: `loc:<id>` or `player:<id>`)

### Query Patterns

**Efficient**:
- Point reads (partition key + ID)
- Single-partition queries (e.g., all exits from location)
- Batch upserts within same partition

**Inefficient**:
- Cross-partition scans
- Unbounded graph traversals
- High-cardinality filters

**Optimization**:
- Cache Mosswell entrance ID in memory
- Limit exit queries to 50 edges per location
- Use `updateExitsSummaryCache()` to precompute summaries

## Related Documentation

- [ADR-001: Mosswell Persistence & Layering](../adr/ADR-001-mosswell-persistence-layering.md) – Persistence model & description layers
- [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) – Partition key evolution path
- [Player Bootstrap Flow](./player-bootstrap-flow.md) – Player creation sequence
- [Mosswell Bootstrap Script](./mosswell-bootstrap-script.md) – World seeding usage
- [Migration Workflow](./mosswell-migration-workflow.md) – Migration scaffold pattern
- [Edge Management](./edge-management.md) – Exit edge creation workflow
- [Architecture Overview](../architecture/overview.md) – High-level system architecture

---

**Last Updated**: 2025-10-27  
**Maintenance**: Update when adding new repository interfaces or changing contracts
