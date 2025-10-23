# Location Edge Management Guide

> For a concise invariants-only summary see `../architecture/exits.md`. This guide retains operational examples and extended rationale.

## Overview

The location edge management system provides structured creation, removal, and auditing of exit edges in the world graph. This ensures consistency, idempotency, and proper telemetry for all spatial relationships between locations.

## Core Features

### 1. Bidirectional Exit Creation

Create exits between locations with optional automatic reciprocal edges:

```typescript
import { getLocationRepository } from '@atlas/shared'

const repo = await getLocationRepository()

// Simple one-way exit
await repo.ensureExitBidirectional('location-a', 'north', 'location-b', {
    reciprocal: false,
    description: 'A narrow path leads north'
})

// Bidirectional exit (creates both directions)
await repo.ensureExitBidirectional('location-a', 'north', 'location-b', {
    reciprocal: true,
    description: 'A wide road extends north',
    reciprocalDescription: 'A wide road extends south'
})
```

**Returns:**

```typescript
{
    created: boolean,           // true if forward exit was new
    reciprocalCreated?: boolean // true if reverse exit was new (when reciprocal=true)
}
```

### 2. Exit Removal

Remove exit edges with automatic telemetry:

```typescript
const result = await repo.removeExit('location-a', 'north')
// Returns: { removed: boolean }
```

**Behavior:**

-   Returns `removed: true` only if exit existed and was deleted
-   Returns `removed: false` if exit didn't exist (idempotent)
-   Emits `World.Exit.Removed` telemetry only on actual removal

### 3. Batch Exit Provisioning

Create multiple exits efficiently:

```typescript
const result = await repo.applyExits([
    { fromId: 'village-square', direction: 'north', toId: 'inn', reciprocal: true },
    { fromId: 'village-square', direction: 'east', toId: 'market', reciprocal: true },
    { fromId: 'inn', direction: 'up', toId: 'inn-room', reciprocal: false }
])

console.log(result)
// {
//   exitsCreated: 5,        // Forward exits created
//   exitsSkipped: 0,        // Exits that already existed
//   reciprocalApplied: 4    // Reverse exits created
// }
```

### 4. Consistency Scanning

Detect graph anomalies:

```bash
npm run scan:graph-consistency
# or with output file:
npm run scan:graph-consistency -- --output=report.json
```

**Detects:**

-   **Dangling exits**: Exit edges pointing to non-existent locations
-   **Orphan locations**: Locations with no inbound or outbound exits

**Output:**

```json
{
    "scannedAt": "2025-01-15T10:30:00.000Z",
    "summary": {
        "totalLocations": 42,
        "totalExits": 87,
        "danglingExitsCount": 0,
        "orphanLocationsCount": 1
    },
    "danglingExits": [],
    "orphanLocations": [
        {
            "id": "abandoned-tower",
            "name": "Forgotten Tower",
            "tags": ["ruins", "isolated"]
        }
    ]
}
```

## Direction Utilities

### Opposite Direction Mapping

```typescript
import { getOppositeDirection } from '@atlas/shared'

const opposite = getOppositeDirection('north') // 'south'
const opposite = getOppositeDirection('up') // 'down'
const opposite = getOppositeDirection('in') // 'out'
```

**Full Mapping:**

-   `north` ↔ `south`
-   `east` ↔ `west`
-   `northeast` ↔ `southwest`
-   `northwest` ↔ `southeast`
-   `up` ↔ `down`
-   `in` ↔ `out`

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

-   `version` tracks **content changes** (name, description, tags)
-   Exit edges are **structural relationships** separate from content
-   Optimistic concurrency is for content conflicts, not edge conflicts
-   Exit changes tracked via dedicated telemetry events

See: [`docs/architecture/location-version-policy.md`](./location-version-policy.md)

## Idempotency Guarantees

All edge operations are idempotent:

-   `ensureExit`: Creating an existing exit returns `created: false`, no telemetry
-   `ensureExitBidirectional`: Both forward and reverse checked independently
-   `removeExit`: Removing non-existent exit returns `removed: false`, no telemetry
-   `applyExits`: Metrics separate created vs skipped counts

## Usage Patterns

### World Generation Script

```typescript
const exits = [
    { fromId: 'spawn', direction: 'north', toId: 'forest-path', reciprocal: true },
    { fromId: 'spawn', direction: 'east', toId: 'village', reciprocal: true },
    { fromId: 'forest-path', direction: 'north', toId: 'clearing', reciprocal: true }
]

const metrics = await repo.applyExits(exits)
console.log(`Created ${metrics.exitsCreated} exits, skipped ${metrics.exitsSkipped}`)
```

### AI-Generated Exit Proposal

```typescript
// AI suggests new exit
const proposal = { from: 'current-location', direction: 'west', to: 'new-ai-location' }

// Create one-way exit initially
await repo.ensureExitBidirectional(proposal.from, proposal.direction, proposal.to, {
    reciprocal: false,
    description: 'A mysterious passage opens to the west'
})

// Later, if validated, add reciprocal
await repo.ensureExit(proposal.to, getOppositeDirection(proposal.direction), proposal.from)
```

### Manual World Editing

```typescript
// Remove incorrect exit
await repo.removeExit('broken-location', 'north')

// Replace with correct exit
await repo.ensureExitBidirectional('broken-location', 'northeast', 'correct-target', {
    reciprocal: true
})
```

## Testing

Comprehensive test coverage in `shared/test/edgeManagement.test.ts`:

-   Opposite direction mapping for all 12 directions
-   Exit creation with `created` status detection
-   Idempotent re-creation (no duplicate telemetry)
-   Bidirectional creation with reciprocal tracking
-   Exit removal with proper return values
-   Batch provisioning with accurate metrics
-   Version policy verification (version unchanged on exit changes)

Run tests:

```bash
npm test
```

## Future Enhancements

### Player-Location Edges (Issue #103 - Closed)

Player persistence enhancement has been implemented. Future work will add `(player)-[:in]->(location)` edges alongside scalar `currentLocationId` field. See: [`docs/adr/ADR-003-player-location-edge-groundwork.md`](../adr/ADR-003-player-location-edge-groundwork.md)

### Exit Metadata

Potential extensions:

-   `blocked` status (doors, keys, conditions)
-   `cost` for pathfinding weights
-   `requiredSkill` for traversal gating
-   `description` layers for dynamic flavor text

### Consistency Enforcement

Future automated checks:

<!-- Removed scheduled CI/CD validation bullet (avoid duplicating workflow intent). -->

-   Alert on dangling exit rate > threshold
-   Auto-cleanup of orphan locations (with approval workflow)

## References

-   ADR-002: Graph Partition Strategy
-   ADR-003: Player-Location Edge Groundwork
-   Issue #100 (closed): Location Persistence
-   Issue #103 (closed): Player Persistence Enhancement
-   Issue #112 (closed): Location Edge Management (this document)

---

Last Updated: 2025-01-15
