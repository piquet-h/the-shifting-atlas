# Cosmos DB Database Naming Convention

**Last Updated:** 2025-10-29

## Overview

The Shifting Atlas uses a **single database per Cosmos DB account** approach with test isolation achieved through dedicated graph containers and partition keys, not separate databases.

## Actual Infrastructure (Defined in infrastructure/main.bicep)

### Cosmos DB Gremlin API (Graph)

**Account:** `cosmosgraph-atlas`

**Database:** `game` (single database for both prod and test)

**Graph Containers:**

-   `world` - Production graph
-   `world-test` - Test graph (complete isolation from production)

**Partition Key:** `/partitionKey`

**Test Isolation Strategy:**

-   Dedicated `world-test` graph container
-   `NODE_ENV=test` routes to `test` partition value
-   Test entity IDs prefixed with `e2e-`

### Cosmos DB SQL API (Document Store)

**Account:** `cosmossql-atlas`

**Database:** `game` (single database for both prod and test)

**Containers:**

-   `players` (partition key: `/id`)
-   `inventory` (partition key: `/playerId`)
-   `descriptionLayers` (partition key: `/locationId`)
-   `worldEvents` (partition key: `/scopeKey`)

**Test Isolation Strategy:**

-   Same containers used for prod and test
-   Test data isolated by partition keys and ID prefixes
-   `NODE_ENV=test` influences partition key selection where applicable

## Environment Variable Configuration

### Production

```bash
# Gremlin API
COSMOS_GREMLIN_ENDPOINT=https://cosmosgraph-atlas.documents.azure.com:443/
COSMOS_GREMLIN_DATABASE=game
COSMOS_GREMLIN_GRAPH=world

# SQL API
COSMOS_SQL_ENDPOINT=https://cosmossql-atlas.documents.azure.com:443/
COSMOS_SQL_DATABASE=game
```

### Test (Local & CI)

```bash
# Gremlin API - uses test graph in same database
GREMLIN_ENDPOINT_TEST=https://cosmosgraph-atlas.documents.azure.com:443/
GREMLIN_DATABASE_TEST=game          # Same database
GREMLIN_GRAPH_TEST=world-test       # Dedicated test graph

# SQL API - same database and containers
COSMOS_SQL_ENDPOINT_TEST=https://cosmossql-atlas.documents.azure.com:443/
COSMOS_SQL_DATABASE=game            # Same database

# Runtime configuration
NODE_ENV=test                       # Routes to 'test' partition
PERSISTENCE_MODE=cosmos
```

## Historical Context

**Previous (Incorrect) References:**

-   ❌ `game-test` database (never existed)
-   ❌ `game-docs` database (never existed)
-   ❌ `game-docs-test` database (never existed)

These names appeared in documentation and configuration examples but were never provisioned in the actual infrastructure.

**Corrected (2025-10-29):**
All documentation, configuration files, and workflows updated to reflect the actual single-database architecture with graph-level and partition-key-level isolation.

## Benefits of Single Database Approach

1. **Cost Optimization:** No need for duplicate databases in test environments
2. **Simplified Management:** Single set of credentials and connection strings
3. **Complete Isolation:** `world-test` graph is completely separate from `world` graph
4. **Easy Cleanup:** Test graph can be dropped and recreated without affecting production
5. **Infrastructure Simplicity:** Fewer resources to provision and manage

## Migration Notes

If you have local configuration files referencing the old names:

1. Replace `game-test` → `game`
2. Replace `game-docs` → `game`
3. Replace `game-docs-test` → `game`
4. Ensure `GREMLIN_GRAPH_TEST=world-test` is set for test scenarios

## Related Documentation

-   `infrastructure/main.bicep` - Source of truth for provisioned resources
-   `infrastructure/README.md` - Infrastructure documentation
-   `backend/test/e2e/README.md` - E2E test configuration
-   `.github/workflows/e2e-integration.yml` - CI configuration
