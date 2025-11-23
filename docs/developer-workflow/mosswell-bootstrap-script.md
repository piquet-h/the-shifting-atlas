# Mosswell Bootstrap Script

> **Status**: Implemented (M1 Traversal)  
> **Script**: `backend/scripts/seed-production.ts`  
> **Function**: `backend/src/seeding/seedWorld.ts`  
> **Related**: [Repository Interfaces](./mosswell-repository-interfaces.md), [ADR-001](../adr/ADR-001-mosswell-persistence-layering.md)

## Purpose

The Mosswell bootstrap script provides idempotent world seeding for development, testing, and production environments. It persists the initial Mosswell village locations and exits into the configured persistence layer (in-memory or Cosmos DB Gremlin).

## Quick Start

```bash
# Production seeding (Cosmos DB)
cd backend
npm run seed:production

# Verify idempotency (run again - should show 0 new vertices/exits)
npm run seed:production
```

**Expected Output**:

```
🌱 Seeding PRODUCTION Cosmos database...
   Partition: "world" (production)
   Mode: cosmos
   Source: villageLocations.json (34 Mosswell locations)

✅ Production seeding complete!
   Locations processed: 34
   Location vertices created: 34
   Exits created: 90
    (Player creation removed from seed process – create players via bootstrap endpoint)

🎉 Mosswell is ready for production!
```

**Second Run** (idempotent):

```
✅ Production seeding complete!
   Locations processed: 34
   Location vertices created: 0
   Exits created: 0
    (No implicit player creation – repeat run confirms idempotent location/exits only)

💡 All locations already exist (idempotent run)
```

## Script Behavior

### Idempotency Guarantees

The bootstrap script is **safe to run multiple times**. It will:

-   ✅ Create missing location vertices
-   ✅ Create missing exit edges
-   ✅ Skip existing vertices and edges (no duplicates)
    // (Removed) Create demo player – seeding no longer provisions a player. Use player bootstrap flow for test users.
-   ✅ Update location content if changed (based on content hash)

**No destructive operations**: Never deletes or overwrites existing world data.

### Data Source

**Default**: `backend/src/data/villageLocations.json` (34 locations, 90 exits)

**Structure**:

```json
[
    {
        "id": "loc-mosswell-entrance",
        "externalId": "mosswell_entrance",
        "name": "Mosswell Entrance",
        "description": "A weathered stone archway marks the entrance...",
        "kind": "entrance",
        "version": 1,
        "exits": [
            {
                "direction": "north",
                "to": "loc-village-square",
                "description": "A cobblestone path leads north"
            }
        ]
    }
]
```

**Custom Data** (for migrations or expansions):

```typescript
import { seedWorld } from './src/seeding/seedWorld.js'
import customData from './migrations/expansion-locations.json'

const result = await seedWorld({
    blueprint: customData,
    log: console.log,
    locationRepository,
    playerRepository
})
```

## Usage

### Prerequisites

1. **Backend dependencies installed**:

    ```bash
    cd backend
    npm install
    ```

2. **Persistence mode configured** (`local.settings.json`):

    **For Cosmos Mode**:

    ```json
    {
        "Values": {
            "PERSISTENCE_MODE": "cosmos",
            "COSMOS_ENDPOINT": "https://<account>.gremlin.cosmos.azure.com:443/",
            "COSMOS_DATABASE": "shifting-atlas",
            "COSMOS_GRAPH_NAME": "world-graph",
            "COSMOS_KEY_SECRET_NAME": "cosmos-primary-key"
        }
    }
    ```

    **For Memory Mode** (local testing):

    ```json
    {
        "Values": {
            "PERSISTENCE_MODE": "memory"
        }
    }
    ```

3. **Azure authentication** (Cosmos mode only):
    ```bash
    az login
    # OR set COSMOS_KEY_SECRET_NAME and configure Key Vault access
    ```

### Running the Script

**Standard Production Seeding**:

```bash
cd backend
npm run seed:production
```

**Direct Invocation** (alternative):

```bash
cd backend
npx tsx scripts/seed-production.ts
```

**Safety Checks**:

The script performs pre-flight validation:

-   ❌ Aborts if `NODE_ENV=test` (prevents seeding test partition)
-   ❌ Aborts if `PARTITION_SCOPE=test` (same reason)
-   ❌ Aborts if `PERSISTENCE_MODE` is not `cosmos`

These checks prevent accidental test partition pollution.

### Environment Overrides

**Test a different partition** (for staging):

```bash
export PARTITION_SCOPE="staging"
npm run seed:production
```

**Use a different Cosmos account**:

```bash
export COSMOS_ENDPOINT="https://my-staging-cosmos.gremlin.cosmos.azure.com:443/"
npm run seed:production
```

## Script Logic

### Execution Flow

```
1. Load local.settings.json environment variables
2. Validate environment (not test mode, cosmos mode enabled)
3. Initialize repositories (Cosmos Gremlin client + SQL API)
4. Call seedWorld() function
   a. Iterate locations from JSON blueprint
   b. Upsert each location (creates if missing, updates if changed)
   c. Ensure all exits (creates edges if missing)
   d. Track creation metrics
5. (Removed) Ensure demo player exists – handled explicitly by player bootstrap endpoint.
6. Report summary (locations/exits created, elapsed time)
```

### Core Function: `seedWorld()`

**Location**: `backend/src/seeding/seedWorld.ts`

**Interface**:

```typescript
export interface SeedWorldOptions {
    blueprint?: Location[]
    log?: (...args: unknown[]) => void
    locationRepository: ILocationRepository
    bulkMode?: boolean
}

export interface SeedWorldResult {
    locationsProcessed: number
    locationVerticesCreated: number
    exitsCreated: number
}
```

**Usage Example**:

```typescript
import { seedWorld } from '../src/seeding/seedWorld.js'

const result = await seedWorld({
    locationRepository: cosmosLocationRepo,
    log: console.log
})

console.log(`Created ${result.locationVerticesCreated} new locations`)
console.log(`Created ${result.exitsCreated} new exits`)
```

## Idempotency Implementation

### Location Upsert

**Method**: `locationRepository.upsert(location)`

**Logic**:

1. Compute content hash from location properties (name, description, kind)
2. Query vertex by ID
3. If vertex exists:
    - Compare content hashes
    - If different: Update vertex properties, increment revision
    - If same: Skip (return `created: false`)
4. If vertex missing: Create new vertex (return `created: true`)

**Result**: Safe to call with same data repeatedly.

### Exit Ensure

**Method**: `locationRepository.ensureExit(fromId, direction, toId)`

**Logic**:

1. Query for existing edge with label matching direction
2. If edge exists: Return `created: false` (skip)
3. If edge missing: Create edge with direction label (return `created: true`)

**Result**: No duplicate edges for same direction.

### Player Creation (Removed from Seeding)

Player creation is now explicit and outside the seed script. Use the player bootstrap endpoint or repository `getOrCreate()` in tests to create players as needed.

## Troubleshooting

### Script Fails with "Cannot run production seed in test mode"

**Cause**: Environment variables indicate test mode.

**Solution**:

```bash
# Remove test environment variables
unset NODE_ENV
unset PARTITION_SCOPE
npm run seed:production
```

### Script Fails with "PERSISTENCE_MODE must be 'cosmos'"

**Cause**: `local.settings.json` has `PERSISTENCE_MODE: "memory"`.

**Solution**:

1. Update `local.settings.json`:
    ```json
    {
        "Values": {
            "PERSISTENCE_MODE": "cosmos"
        }
    }
    ```
2. Or use quick toggle script:
    ```bash
    npm run use:cosmos
    npm run seed:production
    ```

### Script Hangs or Times Out

**Possible Causes**:

-   Cosmos endpoint unreachable
-   Missing authentication (Managed Identity or Key Vault secret)
-   Network firewall blocking Cosmos port (443)

**Solution**:

1. Verify Cosmos endpoint is correct:
    ```bash
    curl -v https://<account>.gremlin.cosmos.azure.com:443/
    ```
2. Test Azure authentication:
    ```bash
    az login
    az account show
    ```
3. Check Key Vault secret access (if using secret-based auth)

### All Locations Show "Created: 0" on First Run

**Cause**: Locations already exist from previous seed.

**Verification**:

```bash
# Query Cosmos for location count
az cosmosdb gremlin graph throughput show \
  --account-name <account> \
  --resource-group <rg> \
  --database-name shifting-atlas \
  --name world-graph
```

**Expected**: If truly first run, should see `locationVerticesCreated: 34`.

**If unexpected**: Vertices may have been created by another process (backend function, manual Gremlin query).

## Performance

### Execution Time

**Memory Mode**: ~50-100ms (in-process, no I/O)

**Cosmos Mode**: ~2-5 seconds (depends on network latency, RU availability)

**Factors**:

-   Number of locations (34 in default blueprint)
-   Number of exits (90 in default blueprint)
-   Cosmos RU/s provisioned (400 RU/s for dev tier)
-   Geographic proximity to Cosmos region

### RU Consumption

**Per Location**:

-   Upsert (new): ~10 RU
-   Upsert (existing, no change): ~5 RU (read + compare)
-   Exit creation: ~5 RU per edge

**Total for Full Seed** (first run):

-   34 locations × 10 RU = 340 RU
-   90 exits × 5 RU = 450 RU
-   **Total**: ~800 RU (~2 seconds at 400 RU/s)

**Idempotent Run** (no changes):

-   34 locations × 5 RU = 170 RU
-   90 exits × 3 RU (edge existence check) = 270 RU
-   **Total**: ~440 RU (~1 second at 400 RU/s)

## Integration with CI/CD

**Planned** (Future enhancement):

```yaml
# .github/workflows/deploy.yml
- name: Seed Production World
  run: |
      cd backend
      npm run seed:production
  env:
      COSMOS_ENDPOINT: ${{ secrets.COSMOS_ENDPOINT }}
      COSMOS_KEY_SECRET_NAME: cosmos-primary-key
```

**Current**: Manual execution after infrastructure provisioning.

## Related Scripts

### Test Data Seeding

For test partition (used by integration tests):

```typescript
// backend/test/helpers/IntegrationTestFixture.ts
await seedWorld({
    locationRepository: testLocationRepo,
    playerRepository: testPlayerRepo,
    blueprint: testLocations, // Smaller test dataset
    log: () => {} // Suppress logs in tests
})
```

**Partition**: `"test"` (isolated from production `"world"`)

### Custom Migration Script Template

For future world expansions, see [Migration Workflow](./mosswell-migration-workflow.md).

## Deprecated: Demo Player

The automatic demo player provisioning was removed in refactor `dfdd6e9`. Create test players explicitly via the player bootstrap flow or repository API.

## Data Schema

### Location Schema

```typescript
interface Location {
    id: string // UUID (e.g., "loc-mosswell-entrance")
    externalId?: string // Human-readable stable ID (e.g., "mosswell_entrance")
    name: string // Display name
    description: string // Base prose (immutable)
    kind?: string // 'entrance', 'plaza', 'shop', etc.
    version: number // Content version (increment on updates)
    exits?: Array<{
        direction: Direction // 'north', 'south', etc.
        to: string // Target location ID
        description?: string // Exit-specific prose
    }>
}
```

### Exit Edge Schema (Gremlin)

```gremlin
// Edge label: direction value (e.g., "north")
g.V('loc-mosswell-entrance')
    .addE('north')
    .to(g.V('loc-village-square'))
    .property('description', 'A cobblestone path leads north')
```

**Properties**:

-   **Label**: Direction string (enables efficient direction-based queries)
-   **description**: Optional prose for exit flavor text
-   **kind**: (Future) 'door', 'archway', 'passage'
-   **state**: (Future) 'locked', 'hidden', 'open'

## Best Practices

### Do's ✅

-   Run bootstrap script after infrastructure changes (new Cosmos account, partition migration)
-   Use idempotency to recover from partial failures (re-run is safe)
-   Verify output metrics (locations/exits created should match expectations)
-   Test with memory mode first, then Cosmos mode

### Don'ts ❌

-   Don't modify `villageLocations.json` in place for custom worlds (create new migration files)
-   Don't assume bootstrap creates any players (use player bootstrap endpoint)
-   Don't run with `PARTITION_SCOPE=test` in production environment variables
-   Don't rely on bootstrap for runtime player onboarding (use `POST /api/player/bootstrap`)

## Related Documentation

-   [Repository Interfaces](./mosswell-repository-interfaces.md) – Persistence contract details
-   [Player Bootstrap Flow](./player-bootstrap-flow.md) – Player creation sequence
-   [Migration Workflow](./mosswell-migration-workflow.md) – Migration scaffold usage
-   [Local Dev Setup](./local-dev-setup.md) – Environment configuration
-   [ADR-001: Mosswell Persistence](../adr/ADR-001-mosswell-persistence-layering.md) – Design rationale
-   [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) – Partition key evolution

---

**Last Updated**: 2025-10-27  
**Maintenance**: Update when bootstrap script arguments or behavior change
