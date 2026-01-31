# Location Edge Management Guide

> For a concise invariants-only summary see `../concept/exits.md` (relocated). This guide retains operational examples and extended rationale.

## Overview

The location edge management system provides structured creation, removal, and auditing of exit edges in the world graph. This ensures consistency, idempotency, and proper telemetry for all spatial relationships between locations.

## Core Features

### 1. Bidirectional Exit Creation

Create exits between locations with optional reciprocal edges.

Authoritative references:

- Interface: `backend/src/repos/locationRepository.ts`
- Implementations: `backend/src/repos/locationRepository.memory.ts`, `backend/src/repos/locationRepository.cosmos.ts`
- Contract coverage: `backend/test/integration/edgeManagement.test.ts`

### 2. Exit Removal

Remove exit edges idempotently (returns `{ removed: false }` when absent).

**Behavior:**

- Returns `removed: true` only if exit existed and was deleted
- Returns `removed: false` if exit didn't exist (idempotent)
- Emits `World.Exit.Removed` telemetry only on actual removal

### 3. Batch Exit Provisioning

Batch operations are supported for seed/migration flows; see the repository interface and its tests for the current input/metrics shape.

### 4. Consistency Scanning

Detect graph anomalies:

```bash
npm run scan:graph-consistency
# or with output file:
npm run scan:graph-consistency -- --output=report.json
```

**Detects:**

- **Dangling exits**: Exit edges pointing to non-existent locations
- **Orphan locations**: Locations with no inbound or outbound exits
- **Missing reciprocal exits**: One-way passages where bidirectional navigation expected (e.g., A→B north exists, B→A south missing)

**Exit Codes:**

- `0` - No dangling exits or missing reciprocal exits found (orphans are warnings only)
- `1` - Dangling exits or missing reciprocal exits detected
- `2` - Fatal error during scan

The output schema is owned by the scanner implementation; prefer inspecting the script and tests when updating consumers:

- Script: `scripts/scan-exits-consistency.mjs`
- Backend helper: `backend/test/helpers/seedTestWorld.ts` (seed patterns)

**Note:** Intentional one-way passages (e.g., trapdoors, waterfalls) will appear as missing reciprocals. The scanner surfaces potential issues for developer review without auto-fixing. A future metadata flag (`reciprocal: false` on exit edge) may be used to suppress warnings for explicitly one-way passages.

## Direction Utilities

### Opposite Direction Mapping

See the canonical direction utilities in `shared/` (and their tests) rather than duplicating mappings in docs.

**Full Mapping:**

- `north` ↔ `south`
- `east` ↔ `west`
- `northeast` ↔ `southwest`
- `northwest` ↔ `southeast`
- `up` ↔ `down`
- `in` ↔ `out`

## Telemetry Events

### World.Exit.Created

Emitted when a new exit edge materializes (not when idempotent no-op):

```typescript
{
    fromLocationId: string,
    toLocationId: string,
    dir: string,              // Direction (e.g., 'north')
    kind: string,             // 'manual', 'generated', 'ai'
    genSource?: string        // Optional source identifier
}
```

### World.Exit.Removed

Emitted only when an exit is actually deleted:

```typescript
{
    fromLocationId: string,
    dir: string,
    toLocationId?: string     // Destination if known
}
```

**Note**: Exit telemetry is game domain telemetry (Application Insights). Build automation uses separate `build.` prefixed events.

## Location Version Policy

**Exit changes DO NOT increment location version.**

Rationale:

- `version` tracks **content changes** (name, description, tags)
- Exit edges are **structural relationships** separate from content
- Optimistic concurrency is for content conflicts, not edge conflicts
- Exit changes tracked via dedicated telemetry events

See: [`docs/architecture/location-version-policy.md`](../architecture/location-version-policy.md)

## Idempotency Guarantees

All edge operations are idempotent:

- `ensureExit`: Creating an existing exit returns `created: false`, no telemetry
- `ensureExitBidirectional`: Both forward and reverse checked independently
- `removeExit`: Removing non-existent exit returns `removed: false`, no telemetry
- `applyExits`: Metrics separate created vs skipped counts

## Usage Patterns

Prefer reading the current seed/migration scripts and repository tests for concrete usage patterns:

- Seeding scripts: `scripts/seed-anchor-locations.mjs` and related scripts under `scripts/`
- Repository contract tests: `backend/test/integration/edgeManagement.test.ts`

## Testing

Tests are the authoritative spec for behavior.

- Backend integration tests: `backend/test/integration/edgeManagement.test.ts`
- Shared utilities/tests (directions/auth/etc): `shared/test/**`

## Future Enhancements

> Note: Player-location edges are not currently implemented. Post ADR-004, player state is SQL-only authoritative (no Gremlin player vertices). Any future graph-based player positioning would require a new ADR/design.

### Exit Metadata

Potential extensions:

- `blocked` status (doors, keys, conditions)
- `cost` for pathfinding weights
- `requiredSkill` for traversal gating
- `description` layers for dynamic flavor text

### Consistency Enforcement

Future automated checks:

- Alert on dangling exit rate > threshold
- Auto-cleanup of orphan locations (with approval workflow)

## References

- [Exit Edge Invariants](../concept/exits.md) – Concise invariants reference (concept facet)
- [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md)
- [ADR-003: Player-Location Edge Groundwork](../adr/ADR-003-player-location-edge-groundwork.md) (superseded)
- [ADR-004: Player Store Cutover Completion](../adr/ADR-004-player-store-cutover-completion.md)
- Issue #117: Epic - Location Edge Management
- Issue #131: Player-Location Edge Migration Design

---

Last Updated: 2025-10-23
