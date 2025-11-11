# Cosmos DB Migrations

This directory contains one-time migration scripts for the Shifting Atlas data persistence layer.

## Gremlin to SQL API Migration

**Script**: `backend/scripts/migrations/gremlin-to-sql-migration.ts`

**Purpose**: One-time migration to backfill existing Gremlin player/inventory data into SQL API containers for cost-efficient mutable data storage (ADR-002: Dual Persistence).

**Goal**: Zero data loss; completes in <10 minutes for 1000 players.

### Prerequisites

1. **Environment variables** configured (see `backend/local.settings.cosmos.json` for reference):

    - `COSMOS_GREMLIN_ENDPOINT`
    - `COSMOS_GREMLIN_DATABASE`
    - `COSMOS_GREMLIN_GRAPH`
    - `COSMOS_SQL_ENDPOINT`
    - `COSMOS_SQL_DATABASE`
    - `COSMOS_SQL_CONTAINER_PLAYERS` (default: `players`)
    - `COSMOS_SQL_CONTAINER_INVENTORY` (default: `inventory`)

2. **Azure credentials** via DefaultAzureCredential:

    - Local: `az login`
    - Production: Managed Identity

3. **Dependencies** installed:
    ```bash
    cd backend
    npm install
    ```

### Usage

**Dry run** (preview without writes):

```bash
cd backend
npx tsx scripts/migrations/gremlin-to-sql-migration.ts --dry-run
```

**Actual migration**:

```bash
cd backend
npx tsx scripts/migrations/gremlin-to-sql-migration.ts
```

**Custom batch size** (for progress tracking):

```bash
cd backend
npx tsx scripts/migrations/gremlin-to-sql-migration.ts --batch-size=50
```

**Help**:

```bash
cd backend
npx tsx scripts/migrations/gremlin-to-sql-migration.ts --help
```

### Options

-   `--dry-run`: Preview operations without writing to SQL API
-   `--batch-size=N`: Entities per progress report (default: 100)
-   `--max-retries=N`: Max retry attempts for throttled requests (default: 5)
-   `--help, -h`: Show help message

### Migration Process

1. **Players**: Reads all player vertices from Gremlin `g.V().hasLabel('player')`

    - Maps Gremlin properties to SQL API document schema
    - Upserts to SQL API `players` container (idempotent)
    - Progress logged every 100 players (configurable)
    - Errors logged but don't halt migration

2. **Inventory**: Checks for legacy inventory edges in Gremlin
    - Modern inventory is already in SQL API
    - Script handles legacy `(player)-[:owns_item]->(item)` edges if they exist
    - Upserts to SQL API `inventory` container

### Idempotency

The migration uses **upsert semantics** (not insert), so it can be re-run without creating duplicates:

-   If a player already exists in SQL API with the same ID, it will be updated
-   Re-running after partial failure will resume from where it left off
-   Safe to run multiple times

### Error Handling

**Throttling (429 errors)**: Exponential backoff with configurable retries

-   Base delay: 1 second
-   Exponential: 1s → 2s → 4s → 8s → 16s
-   Max retries: 5 (configurable)

**Malformed data**: Logged and skipped, migration continues

**Failed entities**: Summary printed at end with error details

### Exit Codes

-   `0`: Success (all entities migrated or skipped in dry-run)
-   `1`: Configuration error, migration failure, or entities failed

### Output Example

```
=== Gremlin to SQL API Migration ===

Configuration:
  Dry Run: NO
  Batch Size: 100
  Max Retries: 5
  Gremlin: https://cosmosgraph-atlas.documents.azure.com:443/
  SQL API: https://cosmossql-atlas.documents.azure.com:443/
  Target Containers: players, inventory

Initializing connections...

=== Migrating Players ===
Fetching players from Gremlin...
Found 523 players in Gremlin
Progress: 100/523 players processed
Progress: 200/523 players processed
Progress: 300/523 players processed
Progress: 400/523 players processed
Progress: 500/523 players processed
Completed player migration: 523 written, 0 failed

=== Migrating Inventory ===
Checking for legacy inventory edges in Gremlin...
No inventory edges found in Gremlin (expected for modern setup)

=== Migration Summary ===
Duration: 145.23s

Players:
  Processed: 523
  Written: 523
  Skipped: 0
  Failed: 0

Inventory:
  Processed: 0
  Written: 0
  Skipped: 0
  Failed: 0

✓ Migration completed successfully
```

### Edge Cases Handled

1. **Player already in SQL**: Upserted based on `updatedUtc` timestamp (newer wins)
2. **Gremlin data malformed**: Logged as error, continues with next entity
3. **SQL API throttled**: Exponential backoff + retry (up to 5 attempts)
4. **Missing optional fields**: Defaults applied (`guest: true`, `currentLocationId: 'loc-mosswell-square'`)
5. **Gremlin property arrays**: First scalar value extracted
6. **No players found**: Exits gracefully with summary

### Rollback

To rollback (delete migrated data):

```sql
-- Connect to Cosmos SQL API via Azure Portal Data Explorer
-- Select database: game
-- Container: players

-- Delete all migrated players (use with caution)
SELECT * FROM c WHERE c.id != null

-- Or delete specific player
SELECT * FROM c WHERE c.id = 'player-guid-here'
```

**Note**: Rollback requires manual intervention via Azure Portal. Migration does not modify Gremlin data (read-only).

### Monitoring

During migration, monitor:

1. **Cosmos RU consumption** via Azure Portal (shouldn't exceed provisioned RU/s)
2. **Script output** for progress and errors
3. **Application Insights** for telemetry events (if instrumented)

### Post-Migration

After successful migration:

1. Verify player count matches:

    ```gremlin
    g.V().hasLabel('player').count()
    ```

    ```sql
    SELECT VALUE COUNT(1) FROM c
    ```

2. Spot-check player data integrity (compare 5-10 random players)

3. Monitor application health for 24 hours

4. Update application to use SQL repository (already implemented in `CosmosPlayerRepositorySql`)

5. Consider decommissioning Gremlin player vertices after soak period (separate cleanup script)

### References

-   [ADR-002: Graph Partition Strategy](../../docs/adr/ADR-002-graph-partition-strategy.md)
-   [SQL Repository Pattern](../../docs/architecture/sql-repository-pattern.md)
-   [Player Repository (Gremlin)](../../backend/src/repos/playerRepository.cosmos.ts)
-   [Player Repository (SQL)](../../backend/src/repos/playerRepository.cosmosSql.ts)
