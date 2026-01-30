# Cosmos DB SQL Containers

Authoritative reference for SQL API containers used by The Shifting Atlas.

---

## Database

- Name: `game`

## Containers

### worldClock

- PK: `/id`
- Purpose: Global world tick advancement state (single logical document)

### locationClocks

- PK: `/id`
- Purpose: Per-location clock anchors (mutable operational state)

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

**Test coverage**: Validation tests ensure invalid patterns (missing prefix, wrong format, empty values) are rejected. See `shared/test/worldEventEmitter.test.ts`.

### temporalLedger

- PK: `/scopeKey`
- Purpose: Immutable audit trail of temporal events (world clock, player drift, reconciliation)
- TTL: Controlled by `TEMPORAL_LEDGER_TTL_DAYS` (default 90)

---

## Migration Notes

Description Layers PK change (`/locationId` → `/scopeId`) requires data migration:

1. Create new container with `/scopeId` partition key
2. Re-write existing items using `scopeId = 'loc:<locationId>'`
3. Update code paths to use realm-aware resolution and new PK

---

## Related

- Realm Hierarchy: `./realm-hierarchy.md`
- Temporal Framework: `../design-modules/world-time-temporal-reconciliation.md`

Last updated: 2025-01-06
