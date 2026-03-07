# Cosmos DB SQL API Reference

Authoritative reference for Cosmos DB SQL API containers, environment variables, and partition key conventions used by The Shifting Atlas.

---

## Database

- Name: `game`

---

## Containers

### players

- PK: `/id`
- Purpose: Authoritative player state (clockTick, lastAction, lastDrift, profile)
- **Environment variable**: `COSMOS_SQL_CONTAINER_PLAYERS` (default: `players`)

### inventory

- PK: `/playerId`
- Purpose: Items owned by a player colocated by partition key
- **Environment variable**: `COSMOS_SQL_CONTAINER_INVENTORY` (default: `inventory`)

### descriptionLayers

- PK: `/scopeId` (target state) — **Current deployed state: `/locationId`** (migration in progress)
- Scope patterns:
    - `loc:<locationId>` for location-specific overlays
    - `realm:<realmId>` for realm-scoped overlays (e.g., weather zones)
- Common fields:
    - `layerType: 'weather' | 'ambient' | 'lighting' | string`
    - `effectiveFromTick: number`
    - `effectiveToTick: number | null` (open-ended)
    - `value: string`
    - `metadata?: object`
- Notes:
    - When resolving layers for a location at tick T, search location scope then containing realms (see `realm-hierarchy.md`).
    - **Migration status**: Application code supports `/scopeId` with backward compatibility for `/locationId`
- **Environment variable**: `COSMOS_SQL_CONTAINER_LAYERS` (default: `descriptionLayers`)

### worldEvents

- PK: `/scopeKey` (e.g., `loc:<id>`, `player:<id>`, `global:<category>`)
- Purpose: Durable event stream for world and player timelines
- **Environment variable**: `COSMOS_SQL_CONTAINER_EVENTS` (default: `worldEvents`)

#### Scope Key Patterns (REQUIRED)

All world events **MUST** use one of these canonical `scopeKey` patterns:

1. **Location-scoped events**: `loc:<locationId>` (UUID required)
    - Example: `loc:550e8400-e29b-41d4-a716-446655440000`
    - Use for: Events tied to a specific location (exits, NPC spawns, ambient changes)

2. **Player-scoped events**: `player:<playerId>` (UUID required)
    - Example: `player:6ba7b810-9dad-11d1-80b4-00c04fd430c8`
    - Use for: Events specific to a player (move, look, inventory changes)

3. **Global system events**: `global:<category>` (any category string)
    - Examples: `global:maintenance`, `global:tick`, `global:worldclock`
    - Use for: System-wide events not tied to a specific entity

#### Validation Rules

- `scopeKey` cannot be empty or missing
- Must match pattern: `<prefix>:<value>` where prefix is `loc`, `player`, or `global`
- For `loc:` and `player:` prefixes, the value **MUST** be a valid UUID
- For `global:` prefix, the value can be any non-empty category string
- Invalid patterns are rejected with `WorldEventValidationError` during event creation

**Runtime enforcement**: The `emitWorldEvent()` function validates scopeKey format before event creation. See `shared/src/events/worldEventEmitter.ts` for implementation.

### temporalLedger

- PK: `/scopeKey`
- Purpose: Immutable audit trail of temporal events (world clock, player drift, reconciliation)
- TTL: Controlled by `TEMPORAL_LEDGER_TTL_DAYS` (default 90)

### worldClock

- PK: `/id`
- Purpose: Global world tick advancement state (single logical document)
- **Environment variable**: `COSMOS_SQL_CONTAINER_WORLD_CLOCK` (default: `worldClock`)

### locationClocks

- PK: `/id`
- Purpose: Per-location clock anchors (mutable operational state)
- **Environment variable**: `COSMOS_SQL_CONTAINER_LOCATION_CLOCKS` (default: `locationClocks`)

### deadLetters

- PK: `/partitionKey` (value: `'deadletter'`)
- Purpose: Failed event processing — persists events that fail validation with redacted player data
- **Environment variable**: `COSMOS_SQL_CONTAINER_DEADLETTERS` (default: `deadLetters`)
- See `dead-letter-storage.md` for full schema and operational procedures

### processedEvents

- PK: `/idempotencyKey`
- Purpose: Event deduplication
- **Environment variable**: `COSMOS_SQL_CONTAINER_PROCESSED_EVENTS` (default: `processedEvents`)

### exitHintDebounce

- PK: `/locationId`
- Purpose: Exit generation throttling
- **Environment variable**: `COSMOS_SQL_CONTAINER_EXIT_HINT_DEBOUNCE` (default: `exitHintDebounce`)

---

## Environment Variables

All container names are configured via environment variables to prevent drift between Bicep/infrastructure and application code.

### Required Variables

| Environment Variable | Default Container | Partition Key | Purpose |
|----------------------|-------------------|---------------|---------|
| `COSMOS_SQL_ENDPOINT` | N/A | N/A | SQL API account endpoint |
| `COSMOS_SQL_DATABASE` | N/A | N/A | Database name (`game`) |
| `COSMOS_SQL_CONTAINER_PLAYERS` | `players` | `/id` | Authoritative player state |
| `COSMOS_SQL_CONTAINER_INVENTORY` | `inventory` | `/playerId` | Items owned by players |
| `COSMOS_SQL_CONTAINER_LAYERS` | `descriptionLayers` | `/scopeId` | Location/realm description overlays |
| `COSMOS_SQL_CONTAINER_EVENTS` | `worldEvents` | `/scopeKey` | Durable event stream |

### Optional Variables (with defaults)

| Environment Variable | Default Container | Partition Key | Purpose |
|----------------------|-------------------|---------------|---------|
| `COSMOS_SQL_CONTAINER_DEADLETTERS` | `deadLetters` | `/partitionKey` | Failed event processing |
| `COSMOS_SQL_CONTAINER_PROCESSED_EVENTS` | `processedEvents` | `/idempotencyKey` | Event deduplication |
| `COSMOS_SQL_CONTAINER_EXIT_HINT_DEBOUNCE` | `exitHintDebounce` | `/locationId` | Exit generation throttling |
| `COSMOS_SQL_CONTAINER_TEMPORAL_LEDGER` | `temporalLedger` | `/scopeKey` | Temporal audit trail |
| `COSMOS_SQL_CONTAINER_WORLD_CLOCK` | `worldClock` | `/id` | Global tick state |
| `COSMOS_SQL_CONTAINER_LOCATION_CLOCKS` | `locationClocks` | `/id` | Per-location clock anchors |

---

## Partition Key Query Patterns

### Description Layers (`/scopeId`)

```typescript
// Correct: Uses scopeId partition key
const scopeId = `loc:${locationId}`
const layer = await layerRepository.getActiveLayer(scopeId, 'weather', currentTick)
```

- `loc:<locationId>` (e.g., `loc:550e8400-e29b-41d4-a716-446655440000`)
- `realm:<realmId>` (e.g., `realm:weather-zone-temperate`)

### World Events (`/scopeKey`)

```typescript
// Correct: Uses scopeKey partition key
const scopeKey = `loc:${locationId}`
const events = await eventRepository.queryByScope(scopeKey, { limit: 100 })
```

---

## Startup Validation

The application performs startup validation to ensure all required environment variables are set:

```typescript
// In persistenceConfig.ts
if (!sqlContainerLayers) missingVars.push('COSMOS_SQL_CONTAINER_LAYERS')
if (!sqlContainerEvents) missingVars.push('COSMOS_SQL_CONTAINER_EVENTS')

if (strict && missingVars.length > 0) {
    throw new Error(`Cosmos SQL API configuration incomplete. Missing: ${missingVars.join(', ')}`)
}
```

---

## Migration Notes

### Description Layers: `/locationId` → `/scopeId`

**Current deployed state**: `/locationId` (legacy)  
**Target state**: `/scopeId` (realm-aware)  
**Migration**: Requires container recreation — create new container with `/scopeId` PK, re-write items using `scopeId = 'loc:<locationId>'`, update code paths to realm-aware resolution.

**Code state**: Application code uses `/scopeId` with backward compatibility for `/locationId`.

---

## Related

- Realm Hierarchy: `./realm-hierarchy.md`
- Temporal Framework: `../design-modules/world-time-temporal-reconciliation.md`
- Dead-Letter Storage: `./dead-letter-storage.md`
- Partition key verification: `backend/test/integration/containerPartitionKeys.test.ts`
- Infrastructure provisioning: `infrastructure/main.bicep`

---

Last updated: 2026-01-05
