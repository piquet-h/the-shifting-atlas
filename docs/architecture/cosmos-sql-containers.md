# Cosmos DB SQL Containers

Authoritative reference for SQL API containers used by The Shifting Atlas.

---

## Database

- Name: `game`

## Containers

### players

- PK: `/id`
- Purpose: Authoritative player state (clockTick, lastAction, lastDrift, profile)

### inventory

- PK: `/playerId`
- Purpose: Items owned by a player colocated by partition key

### descriptionLayers

- PK: `/scopeId` ← updated
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

### worldEvents

- PK: `/scopeKey` (e.g., `loc:<id>`, `player:<id>`, `wc`)
- Purpose: Durable event stream for world and player timelines

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
- Temporal Framework: `../modules/world-time-temporal-reconciliation.md`

Last updated: 2025-12-13
