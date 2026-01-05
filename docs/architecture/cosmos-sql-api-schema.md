# Cosmos DB SQL API Container Schema

Authoritative reference for Cosmos DB SQL API containers and environment variables used by The Shifting Atlas.

## Environment Variables

All container names are configured via environment variables to prevent drift between Bicep/infrastructure and application code.

### Required Variables

| Environment Variable | Container Name | Partition Key | Purpose |
|---------------------|----------------|---------------|---------|
| `COSMOS_SQL_ENDPOINT` | N/A | N/A | SQL API account endpoint |
| `COSMOS_SQL_DATABASE` | N/A | N/A | Database name (`game`) |
| `COSMOS_SQL_CONTAINER_PLAYERS` | `players` | `/id` | Authoritative player state |
| `COSMOS_SQL_CONTAINER_INVENTORY` | `inventory` | `/playerId` | Items owned by players |
| `COSMOS_SQL_CONTAINER_LAYERS` | `descriptionLayers` | `/scopeId` | Location/realm description overlays |
| `COSMOS_SQL_CONTAINER_EVENTS` | `worldEvents` | `/scopeKey` | Durable event stream |

### Optional Variables (with defaults)

| Environment Variable | Default Value | Partition Key | Purpose |
|---------------------|---------------|---------------|---------|
| `COSMOS_SQL_CONTAINER_DEADLETTERS` | `deadLetters` | `/scopeKey` | Failed event processing |
| `COSMOS_SQL_CONTAINER_PROCESSED_EVENTS` | `processedEvents` | `/idempotencyKey` | Event deduplication |
| `COSMOS_SQL_CONTAINER_EXIT_HINT_DEBOUNCE` | `exitHintDebounce` | `/locationId` | Exit generation throttling |
| `COSMOS_SQL_CONTAINER_TEMPORAL_LEDGER` | `temporalLedger` | `/scopeKey` | Temporal audit trail |
| `COSMOS_SQL_CONTAINER_WORLD_CLOCK` | `worldClock` | `/id` | Global tick state |
| `COSMOS_SQL_CONTAINER_LOCATION_CLOCKS` | `locationClocks` | `/id` | Per-location clock anchors |

## Usage Examples

### Query Layers by Location (Single-Partition)

```typescript
// Correct: Uses scopeId partition key
const scopeId = `loc:${locationId}`
const layer = await layerRepository.getActiveLayer(scopeId, 'weather', currentTick)

// Query is scoped to partition key = scopeId, efficient read
```

### Query Events by Scope (Single-Partition)

```typescript
// Correct: Uses scopeKey partition key
const scopeKey = `loc:${locationId}`
const events = await eventRepository.queryByScope(scopeKey, { limit: 100 })

// Query is scoped to partition key = scopeKey, efficient read
```

### Partition Key Patterns

#### Description Layers (`/scopeId`)

- **Location-scoped**: `loc:<locationId>` (e.g., `loc:550e8400-e29b-41d4-a716-446655440000`)
- **Realm-scoped**: `realm:<realmId>` (e.g., `realm:weather-zone-temperate`)

#### World Events (`/scopeKey`)

- **Location timeline**: `loc:<locationId>`
- **Player timeline**: `player:<playerId>`
- **World clock**: `wc`

## Validation

The application performs startup validation to ensure all required environment variables are set:

```typescript
// In persistenceConfig.ts
if (!sqlContainerLayers) missingVars.push('COSMOS_SQL_CONTAINER_LAYERS')
if (!sqlContainerEvents) missingVars.push('COSMOS_SQL_CONTAINER_EVENTS')

if (strict && missingVars.length > 0) {
    throw new Error(`Cosmos SQL API configuration incomplete. Missing: ${missingVars.join(', ')}`)
}
```

## Partition Key Migration Notes

### Description Layers: `/locationId` → `/scopeId`

**Current deployed state**: `/locationId` (legacy)  
**Target state**: `/scopeId` (realm-aware)  
**Migration status**: In progress

The `descriptionLayers` container is transitioning from location-only partitioning to scope-based partitioning to support realm-wide effects (weather, lighting).

**Code state**: Application code uses `/scopeId` with backward compatibility for `/locationId`.

**Infrastructure state**: Deployed containers may still use `/locationId` pending migration.

See `docs/architecture/cosmos-sql-containers.md` for full migration details.

## Related Documentation

- Container schema: `docs/architecture/cosmos-sql-containers.md`
- Partition key verification: `backend/test/integration/containerPartitionKeys.test.ts`
- Infrastructure provisioning: `infrastructure/main.bicep`

---

Last updated: 2026-01-05
