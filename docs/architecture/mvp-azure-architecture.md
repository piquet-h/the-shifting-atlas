# MVP Azure Architecture

Status (2025-11-13): Dual persistence fully operational. Frontend, backend Functions, Cosmos DB (Gremlin + SQL API) active. Strategic rationale in `overview.md`; milestone details in `../roadmap.md`.

## Core Shape

```plaintext
[Client] → [Azure Static Web Apps]
                |
                v
         [Backend Function App]
                |
                +---------------------------+
                |                           |
                v                           v
    [Cosmos DB Gremlin]         [Cosmos DB SQL API]
    (World Graph)                (Mutable State)
    - Locations                  - Players (PK: /id)
    - Exits                      - Inventory (PK: /playerId)
    - Spatial Relations          - Layers (PK: /locationId)
                                 - Events (PK: /scopeKey)
                |
        (future) Service Bus
                |
        (optional) AI MCP Read Layer
```

| Component               | Role                                               | Notes                                        |
| ----------------------- | -------------------------------------------------- | -------------------------------------------- |
| Static Web Apps         | Serve frontend + auth gateway (future)             | No embedded API; backend isolated            |
| Functions App           | HTTP commands + (later) queue triggers             | Keep handlers thin for async cutover         |
| Cosmos Gremlin          | World graph (locations, exits, NPC shell)          | Single logical partition initially (ADR-002) |
| Cosmos SQL API          | Mutable state (players, inventory, layers, events) | Four containers with partition key per entity|
| Service Bus / Queues    | World + NPC evolution (future)                     | Introduced post synchronous persistence      |
| MCP Servers (read-only) | Structured AI context & prompt templates           | No mutation until validation gates exist     |

## Dual Persistence Architecture

The system uses **dual persistence** (ADR-002): immutable world structure in Gremlin, mutable player/inventory/layer state in SQL API.

### Cosmos DB Gremlin API (Graph)
**Purpose:** Immutable world structure, spatial relationships, pathfinding.

**Entities:**
- Location vertices (id, name, description, coordinates)
- Exit edges (semantic labels: `exit_north`, `exit_south`, etc.)
- NPC vertices (future)

**Partition Key:** `/partitionKey` with value `'world'` (single partition for MVP, see ADR-002)

### Cosmos DB SQL API (Document Store)
**Purpose:** Mutable player state, fast queries, cost-efficient writes.

**Database:** `game`

**Containers:**

| Container | Partition Key | Purpose | Key Properties |
|-----------|---------------|---------|----------------|
| `players` | `/id` | Player state | id, currentLocationId, guest, externalId, name |
| `inventory` | `/playerId` | Player items | playerId, items[], capacity |
| `descriptionLayers` | `/locationId` | Dynamic descriptions | locationId, layers[], provenance |
| `worldEvents` | `/scopeKey` | Event timeline | scopeKey (e.g., `loc:<id>`), timestamp, eventType |

**Access Pattern:** `@azure/cosmos` SDK via repository abstraction layer (see `sql-repository-pattern.md`)

See [Container Schemas](#container-schemas) section below for detailed field definitions and partition rationale.

## Container Schemas

### Players Container (`players`)

**Partition Key:** `/id` (player GUID)  
**Rationale:** Player operations always scoped to single player; co-locates all data for player queries.

**Schema:**
```typescript
interface PlayerDocument {
    id: string                    // Player GUID (PK value)
    createdUtc: string           // ISO timestamp
    updatedUtc: string           // ISO timestamp (updated on any change)
    guest: boolean               // true = anonymous, false = authenticated
    externalId?: string          // Entra ID / OAuth sub claim
    name?: string                // Display name
    currentLocationId: string    // Current location anchor (updated on move)
}
```

**Key Operations:**
- `get(id)` - Retrieve player by ID
- `update(player)` - Update player state (e.g., location, name)
- `linkExternalId(id, externalId)` - Link guest to authenticated identity

**Telemetry Events:** `Player.Get`, `Player.Update`, `Player.LinkExternalId`

### Inventory Container (`inventory`)

**Partition Key:** `/playerId` (player GUID)  
**Rationale:** Co-locates all items for a player; efficient queries for player inventory.

**Schema:**
```typescript
interface InventoryDocument {
    id: string                    // Document ID (can be playerId or item grouping)
    playerId: string             // Player GUID (PK value)
    items: InventoryItem[]       // Array of items
    capacity: number             // Max items
    createdUtc: string
    updatedUtc: string
}

interface InventoryItem {
    itemId: string               // Item GUID
    name: string
    quantity: number
    acquiredUtc: string
    metadata?: Record<string, unknown>
}
```

**Key Operations:**
- `getPlayerInventory(playerId)` - Get all items for player
- `addItem(playerId, item)` - Add item to inventory
- `removeItem(playerId, itemId)` - Remove item

**Telemetry Events:** `Inventory.Get`, `Inventory.ItemAdded`, `Inventory.ItemRemoved`

### Description Layers Container (`descriptionLayers`)

**Partition Key:** `/locationId` (location GUID)  
**Rationale:** Co-locates all layers for a location; efficient queries for layered descriptions.

**Schema:**
```typescript
interface DescriptionLayerDocument {
    id: string                    // Document ID (can be locationId or layer grouping)
    locationId: string           // Location GUID (PK value)
    layers: DescriptionLayer[]   // Ordered array of layers
    createdUtc: string
    updatedUtc: string
}

interface DescriptionLayer {
    layerId: string              // Layer GUID
    type: 'base' | 'atmospheric' | 'temporal' | 'contextual'
    content: string              // Layer text
    priority: number             // Higher = applied later
    conditions?: Record<string, unknown>  // Activation rules
    provenance?: string          // AI model or author
    createdUtc: string
}
```

**Key Operations:**
- `getLayers(locationId)` - Get all layers for location
- `addLayer(locationId, layer)` - Add new layer
- `updateLayer(locationId, layerId, layer)` - Update existing layer

**Telemetry Events:** `Layer.Get`, `Layer.Added`, `Layer.Updated`

### World Events Container (`worldEvents`)

**Partition Key:** `/scopeKey` (scope pattern: `loc:<id>` or `player:<id>`)  
**Rationale:** Co-locates timeline events by scope; efficient queries for location/player history.

**Schema:**
```typescript
interface WorldEventDocument {
    id: string                    // Event GUID
    scopeKey: string             // PK value (e.g., 'loc:abc-123' or 'player:def-456')
    eventType: string            // Event category (e.g., 'player_entered', 'item_spawned')
    timestamp: string            // ISO timestamp
    playerId?: string            // Related player (if applicable)
    locationId?: string          // Related location (if applicable)
    payload: Record<string, unknown>  // Event-specific data
    correlationId?: string       // Request correlation ID
}
```

**Key Operations:**
- `getLocationEvents(locationId)` - Get events for location
- `getPlayerEvents(playerId)` - Get events for player
- `addEvent(event)` - Record new event

**Telemetry Events:** `WorldEvent.Added`, `WorldEvent.Query`

## Decision Matrix: Gremlin vs SQL API

Use this matrix when adding new entity types to the system:

| Use Gremlin Graph When... | Use SQL API When... |
|---------------------------|---------------------|
| Data is **immutable** (location structure) | Data is **mutable** (player state, inventory) |
| Need **spatial queries** (pathfinding, proximity) | Need **fast key-value lookups** (get player by ID) |
| Relationships are **first-class** (exit edges) | Relationships are **denormalized** (player → location FK) |
| Query pattern: **traversal** (`g.V().out()`) | Query pattern: **point read** (`SELECT * WHERE id=`) |
| Write frequency: **rare** (world building) | Write frequency: **frequent** (player actions) |
| Scale concern: **graph size** (vertex count) | Scale concern: **write throughput** (RU/s) |

**Examples:**

| Entity Type | Storage | Rationale |
|-------------|---------|-----------|
| Location | Gremlin | Immutable structure; traversal queries for navigation |
| Exit | Gremlin | First-class relationship; spatial pathfinding |
| Player | SQL API | Mutable state; frequent updates (location, name) |
| Inventory | SQL API | Mutable state; high write frequency (item add/remove) |
| Description Layer | SQL API | Mutable content; no traversal queries needed |
| World Event | SQL API | Append-only timeline; no relationships |
| NPC (future) | Gremlin | Spatial queries; path planning |
| Quest (future) | SQL API | Mutable progress; no spatial queries |

**Mixed Patterns:**

Some entities span both stores:
- **Player:** State in SQL API (`currentLocationId`), optional vertex in Gremlin for spatial queries (see `player-location-edge-migration.md`)
- **Item:** Definition in Gremlin (immutable item type), instances in SQL API (player inventory)

## Early Principles

1. Ship traversal loop before AI enrichment.
2. Direct writes first → event/queue refactor second (mechanical, not architectural rewrite).
3. Immutable base descriptions; additive layers (see layering module) – informs persistence design early.
4. Telemetry names stable before volume scaling (avoid dashboard churn).

## Code Examples: Dual Persistence Patterns

### Example 1: Reading Player + Location (Dual Persistence)

Typical pattern for displaying player state requires reading from **both** stores:

```typescript
// backend/src/handlers/getPlayerState.ts
import { inject, injectable } from 'inversify'
import { IPlayerRepository } from '@piquet-h/shared/types/playerRepository'
import { ILocationRepository } from '../repos/locationRepository.js'

@injectable()
export class GetPlayerStateHandler {
    constructor(
        @inject('IPlayerRepository') private playerRepo: IPlayerRepository,
        @inject('ILocationRepository') private locationRepo: ILocationRepository
    ) {}

    async handle(playerId: string) {
        // Read player state from SQL API
        const player = await this.playerRepo.get(playerId)
        if (!player) {
            throw new Error('Player not found')
        }

        // Read location from Gremlin graph
        const location = await this.locationRepo.getLocation(player.currentLocationId)
        if (!location) {
            throw new Error('Location not found')
        }

        return {
            player: {
                id: player.id,
                name: player.name,
                guest: player.guest
            },
            location: {
                id: location.id,
                name: location.name,
                description: location.description,
                exits: location.exits
            }
        }
    }
}
```

**Key Pattern:** SQL API for mutable player state, Gremlin for immutable location structure.

### Example 2: Updating Player Location After Movement

**Critical:** After successful movement, player's `currentLocationId` must be updated in SQL API to persist location change across sessions.

```typescript
// backend/src/handlers/moveCore.ts (simplified excerpt)
import { inject, injectable } from 'inversify'
import { IPlayerRepository } from '@piquet-h/shared/types/playerRepository'
import { ILocationRepository } from '../repos/locationRepository.js'

@injectable()
export class MoveHandler {
    constructor(
        @inject('IPlayerRepository') private playerRepo: IPlayerRepository,
        @inject('ILocationRepository') private locationRepo: ILocationRepository
    ) {}

    async movePlayer(playerId: string, direction: string) {
        // 1. Validate exit exists in Gremlin graph
        const result = await this.locationRepo.move(
            playerId,
            currentLocationId,
            direction
        )

        if (!result.success) {
            return { success: false, error: result.error }
        }

        // 2. Update player location in SQL API (CRITICAL STEP)
        const player = await this.playerRepo.get(playerId)
        if (player) {
            player.currentLocationId = result.location.id
            await this.playerRepo.update(player)  // Persist location change
        }

        // 3. Return new location to client
        return {
            success: true,
            location: result.location
        }
    }
}
```

**Why This Matters:**
- Without step 2, player location resets on reconnect (issue #494)
- SQL API is source of truth for player state
- Gremlin graph validates spatial structure only

### Example 3: Adding Item to Inventory

```typescript
// backend/src/handlers/addInventoryItem.ts
import { inject, injectable } from 'inversify'
import { IInventoryRepository } from '../repos/inventoryRepository.js'

@injectable()
export class AddInventoryItemHandler {
    constructor(
        @inject('IInventoryRepository') private inventoryRepo: IInventoryRepository
    ) {}

    async handle(playerId: string, itemId: string, itemName: string) {
        // Read current inventory from SQL API
        const inventory = await this.inventoryRepo.getPlayerInventory(playerId)

        // Add new item
        const newItem = {
            itemId,
            name: itemName,
            quantity: 1,
            acquiredUtc: new Date().toISOString()
        }

        inventory.items.push(newItem)

        // Persist updated inventory
        await this.inventoryRepo.update(inventory)

        return { success: true, inventory }
    }
}
```

**Key Pattern:** SQL API handles mutable collections with efficient updates.

### Example 4: Query Location Timeline Events

```typescript
// backend/src/handlers/getLocationHistory.ts
import { inject, injectable } from 'inversify'
import { IWorldEventRepository } from '../repos/worldEventRepository.js'

@injectable()
export class GetLocationHistoryHandler {
    constructor(
        @inject('IWorldEventRepository') private eventRepo: IWorldEventRepository
    ) {}

    async handle(locationId: string, limit: number = 50) {
        // Query events by scope key (efficient due to partition key)
        const scopeKey = `loc:${locationId}`
        const events = await this.eventRepo.queryByScope(scopeKey, limit)

        return {
            locationId,
            events: events.map(e => ({
                type: e.eventType,
                timestamp: e.timestamp,
                player: e.playerId,
                details: e.payload
            }))
        }
    }
}
```

**Key Pattern:** Scope-based partition key enables efficient timeline queries.

## Immediate Build Focus (M1 → M2 Bridge)

-   Location persistence (Gremlin)
-   Exit model + movement command
-   Direction normalization & movement telemetry (`Location.Move` with status)

## Migration Runbook: Adding New SQL API Container

Follow this checklist when extending dual persistence to a new entity type:

### Phase 1: Design & Planning

- [ ] **Decision Matrix:** Verify entity belongs in SQL API (not Gremlin)
  - Mutable state? High write frequency? No spatial queries?
- [ ] **Partition Key Strategy:** Choose partition key following ADR-002 guidelines
  - Prefer entity ID for single-entity queries (e.g., `/playerId`)
  - Use scope pattern for timeline queries (e.g., `/scopeKey`)
- [ ] **Schema Design:** Define TypeScript interface with required fields
  - Include: `id`, `createdUtc`, `updatedUtc`, partition key field
- [ ] **Telemetry Events:** Define event names following `Domain.Subject.Action` pattern

### Phase 2: Infrastructure

- [ ] **Bicep Template:** Add container definition to `infrastructure/modules/cosmos-sql.bicep`
  ```bicep
  {
    name: 'myNewContainer'
    partitionKeyPath: '/myPartitionKey'
    defaultTtl: -1  // No auto-expiration
  }
  ```
- [ ] **Environment Variables:** Add to `backend/src/config.ts` and Bicep outputs
  ```typescript
  COSMOS_SQL_CONTAINER_MYNEW: process.env.COSMOS_SQL_CONTAINER_MYNEW || 'myNewContainer'
  ```
- [ ] **Deploy:** Run `azd up` to provision container

### Phase 3: Repository Layer

- [ ] **Interface:** Define repository interface in `shared/src/types/`
  ```typescript
  export interface IMyEntityRepository {
      get(id: string): Promise<MyEntity | undefined>
      create(entity: MyEntity): Promise<MyEntity>
      update(entity: MyEntity): Promise<MyEntity>
  }
  ```
- [ ] **Implementation:** Create Cosmos implementation in `backend/src/repos/`
  - Extend `CosmosDbSqlRepository<MyEntity>`
  - Implement interface methods using base class operations
  - Add telemetry events
- [ ] **Mock:** Create in-memory implementation for tests
  - Extend `Map<string, MyEntity>` for simple storage
- [ ] **DI Registration:** Wire in `backend/src/inversify.config.ts`
  ```typescript
  container.bind<IMyEntityRepository>('IMyEntityRepository')
      .to(CosmosMyEntityRepository)
      .inSingletonScope()
  ```

### Phase 4: Testing

- [ ] **Unit Tests:** Test repository operations with mock
  - Create, read, update, delete (CRUD)
  - Partition key handling
  - Error scenarios (not found, conflict)
- [ ] **Integration Tests:** Test against live Cosmos (local emulator acceptable)
  - Verify telemetry events emitted
  - Confirm RU consumption reasonable

### Phase 5: Migration (If Existing Data)

- [ ] **Migration Script:** Create in `scripts/migrate-mynew-entity.mjs`
  - Read from source (Gremlin or old structure)
  - Transform to new schema
  - Write to SQL API container
  - Validate row counts match
- [ ] **Dry Run:** Execute with `--dry-run` flag, verify output
- [ ] **Backfill:** Run migration script against production
- [ ] **Validation:** Query both stores, confirm consistency

### Phase 6: Documentation

- [ ] **Update This File:** Add container to [Container Schemas](#container-schemas) section
- [ ] **Update sql-repository-pattern.md:** Add implementation example
- [ ] **Update Copilot Instructions:** Add container to Section 5 environment variables

### Example: Adding "Quests" Container

**Decision:** Quests are mutable (progress tracking), high write frequency, no spatial queries → **SQL API**

**Partition Key:** `/playerId` (quests belong to player, efficient query pattern)

**Schema:**
```typescript
interface QuestDocument {
    id: string              // Quest GUID
    playerId: string        // PK value
    questType: string
    status: 'active' | 'completed' | 'failed'
    progress: Record<string, unknown>
    startedUtc: string
    updatedUtc: string
}
```

**Bicep:**
```bicep
{
  name: 'quests'
  partitionKeyPath: '/playerId'
}
```

**Repository:** Implement `IQuestRepository` with `getPlayerQuests(playerId)`, `updateQuestProgress(questId, progress)`

## Troubleshooting: Common Dual Persistence Issues

### Issue 1: Player Location Not Persisting (Snap-Back on Reconnect)

**Symptoms:**
- Player moves to new location successfully
- Player refreshes page or reconnects
- Player "snaps back" to old location

**Root Cause:** `currentLocationId` not updated in SQL API after movement

**Resolution:**
1. Verify move handler calls `playerRepo.update()` after successful move
2. Check telemetry for `Player.Update` event with `success: false`
3. Ensure `IPlayerRepository.update()` method exists and is implemented

**Example Fix:** See [Example 2: Updating Player Location After Movement](#example-2-updating-player-location-after-movement)

**Reference:** Issue #494 (closed) - Player Location Not Persisted After Movement

### Issue 2: Missing `IPlayerRepository.update()` Method

**Symptoms:**
- TypeScript error: `Property 'update' does not exist on type 'IPlayerRepository'`
- Move handler cannot update player state

**Root Cause:** Repository interface missing `update()` method

**Resolution:**
1. Add method to interface in `shared/src/types/playerRepository.ts`:
   ```typescript
   update(player: PlayerRecord): Promise<PlayerRecord>
   ```
2. Implement in Cosmos repository (`backend/src/repos/playerRepository.cosmosSql.ts`)
3. Implement in in-memory repository for tests

**Reference:** Issue #494 Part 1 - Add IPlayerRepository.update() Method

### Issue 3: Partition Key Mismatch (404 Not Found on Update)

**Symptoms:**
- Document exists but `getById()` returns null
- Update/delete operations fail with 404
- Works in Azure Portal but not in code

**Root Cause:** Partition key value in query doesn't match document's partition key

**Resolution:**
1. Verify partition key path in container definition (e.g., `/id`, `/playerId`)
2. Ensure query passes correct partition key value:
   ```typescript
   // Correct: Partition key matches field
   await this.getById(playerId, playerId)  // For PK: /playerId
   
   // Wrong: Using wrong field as partition key
   await this.getById(playerId, documentId)  // Mismatch!
   ```
3. Check Cosmos container settings in Azure Portal

### Issue 4: High RU Consumption on Query

**Symptoms:**
- Query operations consume >100 RU
- Throttling (429) errors on frequent queries
- Budget alerts triggered

**Root Cause:** Query not using partition key or lacks indexing

**Resolution:**
1. **Always specify partition key** in queries:
   ```typescript
   // Good: Uses partition key (1-5 RU)
   const player = await repo.getById(playerId, playerId)
   
   // Bad: Cross-partition query (100+ RU)
   const result = await container.items.query('SELECT * FROM c WHERE c.id = @id')
   ```
2. **Add indexes** for frequently queried non-PK fields (rare, prefer PK queries)
3. **Review query patterns:** Refactor to partition-key-scoped queries

### Issue 5: Stale Data After Update

**Symptoms:**
- Update succeeds but `get()` returns old data
- Different Function instances see different values
- Eventually consistent after delay

**Root Cause:** Cosmos eventual consistency model

**Resolution:**
1. **Read-your-own-writes:** After update, return updated document from update operation (don't re-query immediately)
   ```typescript
   const updated = await repo.update(player)  // Returns updated doc
   return updated  // Don't call repo.get() again
   ```
2. **Session consistency:** Use session tokens for read-after-write guarantees (advanced, usually not needed)
3. **Verify update success:** Check telemetry for `Player.Update` event confirming write

### Issue 6: Gremlin Fallback Always Triggered

**Symptoms:**
- Telemetry shows `source: 'gremlin-fallback'` for all player reads
- SQL API container has documents but not being read
- Migration appears incomplete

**Root Cause:** Player documents not migrated to SQL API or wrong container name

**Resolution:**
1. Verify container name in config matches Bicep deployment:
   ```typescript
   COSMOS_SQL_CONTAINER_PLAYERS = 'players'  // Must match Bicep
   ```
2. Run migration script to backfill existing players:
   ```bash
   node scripts/migrate-players-to-sql.mjs
   ```
3. Verify documents exist in Azure Portal (Cosmos SQL API → game → players)
4. Check SQL client initialization (endpoint, database name, credentials)

**Expected Behavior:** After migration, `source: 'sql'` should appear in >95% of reads

### Issue 7: Dead Letter Queue Messages After Dual Persistence

**Symptoms:**
- Move operations succeed but dead letter messages appear
- Error: "Player document not found" in logs
- Inconsistent state between Gremlin and SQL

**Root Cause:** Legacy code paths still expect player vertices in Gremlin

**Resolution:**
1. **Audit code:** Search for direct Gremlin player vertex queries:
   ```bash
   grep -r "g.V(playerId)" backend/src/
   ```
2. **Migrate to SQL API:** Replace Gremlin player reads with SQL API:
   ```typescript
   // Old: Gremlin vertex query
   const vertex = await g.V(playerId).next()
   
   // New: SQL API document query
   const player = await playerRepo.get(playerId)
   ```
3. **Remove player vertices:** After code migration, clean up Gremlin player vertices (optional)

## Feature Flags: Migration Control

### DISABLE_GREMLIN_PLAYER_VERTEX

**Purpose:** Progressive rollout of SQL API-only player persistence (ADR-002 completion).

**Environment Variable:** `DISABLE_GREMLIN_PLAYER_VERTEX`  
**Default:** `false` (Gremlin fallback enabled)  
**Valid Values:** `true`, `false`, `1`, `0`, `yes`, `no` (case-insensitive)

**Behavior:**

| Flag Value | Player Reads | Player Writes | Gremlin Fallback | Use Case |
|------------|--------------|---------------|------------------|----------|
| `false` (default) | SQL API primary | SQL API only | Available on read miss | Safe migration mode; backward compatibility |
| `true` | SQL API only | SQL API only | Disabled | Post-migration; Gremlin cleanup phase |

**Migration Flow:**

1. **Phase 1: Dual Mode (flag=false, default)**
   - New players created in SQL API
   - Existing players in Gremlin migrated to SQL on read
   - Fallback to Gremlin if player not in SQL
   - Telemetry: `Player.Get` with `source='sql'` or `source='gremlin-fallback'`

2. **Phase 2: SQL-Only Mode (flag=true)**
   - Set `DISABLE_GREMLIN_PLAYER_VERTEX=true` in production environment
   - All player reads from SQL API exclusively
   - No Gremlin fallback (reduces latency, RU consumption)
   - Telemetry: `Player.Get` with `source='sql'` only

3. **Phase 3: Cleanup (manual)**
   - After observing zero `gremlin-fallback` events for 7+ days
   - Optionally remove player vertices from Gremlin
   - Keep exit/location graph intact

**Rollback Scenario:**
```bash
# Revert to Gremlin fallback if SQL API issues detected
export DISABLE_GREMLIN_PLAYER_VERTEX=false
```

**Observability:**
- Startup event: `FeatureFlag.Loaded` with all flag values
- Invalid flag values: `FeatureFlag.ValidationWarning` + console warning

**Implementation Reference:**
- Flag definition: `backend/src/config/featureFlags.ts`
- DI binding: `backend/src/inversify.config.ts` (conditional Gremlin fallback)
- Repository logic: `backend/src/repos/playerRepository.cosmosSql.ts`

**Related Issues:**
- #517 (PlayerRecord Schema & Repository Core)
- #518 (Player Write-Through Logic)
- #519 (This Feature Flag)
- ADR-002 (Dual Persistence Strategy)

## Pointers

-   High‑level rationale: `overview.md`
-   Event naming: `../observability.md`
-   Partition evolution: `../adr/ADR-002-graph-partition-strategy.md`
-   Layering model: `../modules/description-layering-and-variation.md`
-   SQL repository pattern: `sql-repository-pattern.md`
-   Player-location edge migration (future): `player-location-edge-migration.md`

## Deferments

-   AI mutation tools (proposal / generation) – after validation & replay infrastructure
-   Region sharding – gate on RU/latency signals (ADR-002 thresholds)
-   Multiplayer & economy – post stable layering + traversal analytics

_Last updated: 2025-11-18 (added DISABLE_GREMLIN_PLAYER_VERTEX feature flag documentation)_
