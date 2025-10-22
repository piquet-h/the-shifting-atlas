# Dungeon Runs (Episodic Subgraph Instances)

> Status: DRAFT · Planned implementation post-M4 (Layering & Enrichment)

## Purpose

Enable focused, time-bounded adventures within self-contained structural subgraphs ("dungeons") overlaid with transient per-run state, providing pacing, replayability, controlled risk/reward balance, and safe extensibility—without fragmenting the unified world graph or violating established exit/layering invariants.

## What Is a Dungeon Run?

**Dungeon Run**: A transient, instrumented traversal of a dungeon template (immutable graph structure) with its own mutable state overlay (SQL document) and outcome tracking, isolated from the persistent open world to enable replayability, analytics, and safe third-party extension.

### Core Components

1. **Template** (Structural): Immutable dungeon topology (rooms as `location` vertices, exits as directional edges) persisted in the unified Gremlin world graph. Reusable across many runs.
2. **Instance** (State): Ephemeral run-specific state document (SQL API) keyed by `dungeonInstanceId`, tracking progression (cleared rooms, loot rolls, unlocked doors, timers, modifiers).
3. **Lifecycle Phases**:
    - **Bootstrap**: Player enters via entrance vertex; instance record created with seed + modifiers.
    - **Active Traversal**: Movement consumes structural edges from graph + overlays volatile state from SQL (blocked doors, cleared hazards).
    - **Resolution**: Success (objective met), abort (death/voluntary exit), or timeout.
    - **Teardown**: Instance retained briefly (audit/telemetry), then expires via TTL without deleting graph structure.

## Why Dungeon Runs Matter (Text-Based Open World)

1. **Pacing & Dramatic Arc**: Open worlds risk low-tension drift; runs inject focused rising tension with clear start, escalating middle, and resolution.
2. **Risk/Reward Isolation**: Tune higher-stakes drops or narrative payoffs without destabilizing overworld economy or traversal balance.
3. **Difficulty Modulation**: Instance-specific modifiers (environmental challenges, corruption levels) scale independently of core world accessibility.
4. **Replayability Without Content Bloat**: Few templates → many distinct runs via seeds + variation layering (weather, faction control).
5. **Clean Analytics**: Separate telemetry segmentation (`Dungeon.Instance.Created`, `Dungeon.Run.Cleared`) enables funnel drop-off and engagement analysis distinct from ambient exploration.
6. **Narrative Injection Point**: Controlled sandbox for experimental mechanics (dynamic descriptions, AI-generated encounters) before promoting to wider world.
7. **Concurrency Control**: Avoid overworld contention (contested bosses) by sandboxing per-instance encounter state.
8. **Emergent Lore Anchoring**: Persistent world references legendary runs (clear times, failed expeditions) without altering base geography.

## Alignment with Existing Architecture

### Unified Graph (ADR-002)

Dungeons live within the existing single-partition Gremlin graph as labeled subgraphs. No separate containers or databases. Rooms tagged with `dungeonId` metadata; all share current `'world'` partition key. Future region-based partitioning ([ADR-002](../adr/ADR-002-graph-partition-strategy.md)) can treat dungeons as partition values if RU pressure warrants (deferred until evidence).

### Exit Edge Invariants (exits.md)

Dungeon room connections obey all invariants in [`exits.md`](./exits.md):

-   Directional uniqueness preserved.
-   Optional reciprocity (one-way drops, secret passages).
-   Idempotent creation/removal.
-   Exit changes never increment location `version` ([`location-version-policy.md`](./location-version-policy.md)).
-   Run state overlays (blocked/cleared) stored externally; structural edges remain immutable.

### Player Location Scalar (ADR-003 Groundwork)

Player's `currentLocationId` continues as authoritative during MVP. Dungeon run overlays enrich movement logic without forcing edge schema changes. Instance context consulted for state checks (is door unlocked?) but does not replace location tracking.

### Description Layering (M4)

Dungeon runs leverage the layering engine:

-   **Base Layer**: Template room descriptions (stable).
-   **Structural Layer**: Exit summaries (from graph edges).
-   **Instance Layer**: Transient atmospheric overlays tied to `dungeonInstanceId` (torch sputters, corruption intensifies).
    Instance layers expire with the run; base descriptions never mutate.

### World Event Contract

Dungeon lifecycle events extend the draft spec ([`world-event-contract.md`](./world-event-contract.md)) with new types (see Event Schema below). All events follow envelope structure, idempotency keys, and correlation patterns.

## Vertex Metadata Extensions (Non-Breaking)

Additive fields for location vertices participating in dungeon templates:

```typescript
interface LocationVertex {
    // ... existing fields (id, name, description, tags, version)
    kind?: 'location' | 'dungeon-room' // Distinguish overworld vs dungeon structural context
    dungeonId?: string // Stable template GUID (same across all instances)
    dungeonInstanceId?: string // Transient; only if instance state materialized as vertices (avoid; prefer SQL)
    depth?: number // Relative depth for difficulty curves / generation logic
    entrance?: boolean // Marks entrance rooms (multiple allowed)
    entranceKind?: 'main' | 'secret' | 'service' // Optional entrance taxonomy
}
```

**Recommended Strategy**: Tag template rooms with `dungeonId` + `depth`; do NOT create per-instance vertices. Instance state lives in SQL documents only.

## Instance State Schema (SQL API Document)

Container: `dungeonRuns` (partition key: `/dungeonInstanceId`)

```typescript
interface DungeonRunDocument {
    id: string // dungeonInstanceId (GUID, also PK)
    dungeonId: string // Template reference
    playerIds: string[] // Current party (initially single player; future multi-player)
    seed: string // RNG seed for variation (loot rolls, modifiers)
    createdUtc: string // ISO 8601
    status: 'active' | 'cleared' | 'failed' | 'expired' // Lifecycle state
    entranceLocationId: string // Fallback teleport target if evicted
    clearedRooms: Record<string, { clearedUtc: string }> // roomId → clear timestamp
    lootRolls: Array<{
        roomId: string
        itemId: string
        rarity: string
        takenUtc?: string
    }>
    modifiers: {
        corruptionLevel?: number
        weather?: string
        factionInfluence?: string
        // Extensible for third-party proposals
    }
    metrics: {
        lastProgressUtc: string
        roomsVisited: number
        elapsedMs: number
    }
    ttl?: number // Optional Cosmos TTL (seconds) for auto-cleanup
}
```

**Access Pattern**: Movement handler queries by `dungeonInstanceId` (efficient point read). Cleared room checks, loot depletion, modifier lookups all happen against this document.

## Event Schema (World Event Contract Extensions)

Proposed new event types (extend [`world-event-contract.md`](./world-event-contract.md)):

### Dungeon.Instance.Created

```jsonc
{
    "type": "Dungeon.Instance.Created",
    "actor": { "kind": "system" },
    "idempotencyKey": "{dungeonId}:{playerId}:{minuteBucket}",
    "payload": {
        "dungeonId": "uuid",
        "dungeonInstanceId": "uuid",
        "seedHash": "string",
        "entranceLocationId": "uuid",
        "modifiers": {
            /* ... */
        }
    }
}
```

### Player.Dungeon.Enter

```jsonc
{
    "type": "Player.Dungeon.Enter",
    "actor": { "kind": "player", "id": "playerId" },
    "idempotencyKey": "{playerId}:{dungeonInstanceId}:enter",
    "payload": {
        "playerId": "uuid",
        "dungeonId": "uuid",
        "dungeonInstanceId": "uuid",
        "fromLocationId": "uuid"
    }
}
```

### Player.Dungeon.Progress

```jsonc
{
    "type": "Player.Dungeon.Progress",
    "actor": { "kind": "player", "id": "playerId" },
    "idempotencyKey": "{dungeonInstanceId}:{roomId}:clear",
    "payload": {
        "playerId": "uuid",
        "dungeonInstanceId": "uuid",
        "roomId": "uuid",
        "clearedCount": 5
    }
}
```

### Dungeon.Run.Cleared

```jsonc
{
    "type": "Dungeon.Run.Cleared",
    "actor": { "kind": "system" },
    "idempotencyKey": "{dungeonInstanceId}:finalize",
    "payload": {
        "dungeonInstanceId": "uuid",
        "durationMs": 120000,
        "roomsCleared": 12,
        "lootSummaryHash": "sha256"
    }
}
```

### Player.Dungeon.Exit

```jsonc
{
  "type": "Player.Dungeon.Exit",
  "actor": { "kind": "player", "id": "playerId" },
  "idempotencyKey": "{playerId}:{dungeonInstanceId}:exit",
  "payload": {
    "playerId": "uuid",
    "dungeonInstanceId": "uuid",
    "reason": "cleared" | "aborted" | "timeout" | "death",
    "toLocationId": "uuid"
  }
}
```

## Movement & Traversal Integration

### Entrance Handling

1. Player at overworld location with dungeon entrance exit (normal directional edge).
2. Move command triggers check: is destination `dungeonId`-tagged?
3. If yes + no active run: create instance document (`Dungeon.Instance.Created` event).
4. Update player location; emit `Player.Dungeon.Enter`.

### In-Dungeon Movement

1. Standard movement logic queries graph for exit edges.
2. Before allowing traversal, consult `dungeonRuns` document:
    - Is door unlocked? (check `clearedRooms` or modifier state)
    - Is passage blocked? (modifier overlay)
3. Apply state-dependent restrictions; emit `Player.Dungeon.Progress` on room clear.

### Exit Handling

1. Player moves to exit vertex (tagged with `entrance=true` or has exit edge back to overworld).
2. Mark instance `status` appropriately (`cleared` if objective met, `aborted` otherwise).
3. Emit `Player.Dungeon.Exit` + optionally `Dungeon.Run.Cleared`.
4. TTL cleanup will expire document after retention window.

### Edge Cases

-   **Player Disconnect Mid-Run**: Instance remains `active`; on reconnection resume if not expired, else evict to entrance (`reason: timeout`).
-   **Multi-Player Parties (Future)**: Introduce `partyId`; coordinate shared `clearedRooms` state.
-   **Run Expiry While Inside**: Movement attempt detects expired instance → soft eviction event, relocate to `entranceLocationId`.
-   **Partial Generation Failure**: Abort instance creation before any `Player.Dungeon.Enter` event emits (atomic start).

## Telemetry (Application Insights)

Reuse existing `trackGameEventStrict` patterns from [`shared/src/telemetry.ts`](../../shared/src/telemetry.ts):

**New Event Name Constants** (to be added centrally):

-   `Dungeon.Instance.Created`
-   `Dungeon.Run.Cleared`
-   `Dungeon.Run.Aborted`
-   `Dungeon.Run.Timeout`
-   `Player.Dungeon.Enter`
-   `Player.Dungeon.Exit`

**Dimensions to Include**:

-   `dungeonId` (template reference)
-   `dungeonInstanceId` (run instance)
-   `playerId`
-   `durationMs` (for cleared runs)
-   `roomsCleared`
-   `reason` (exit reason)

## Third-Party Extension Hooks (Future API Surfaces)

### Read Operations

-   `GET /dungeon/template/{dungeonId}` – Template topology, room descriptions, recommended level.
-   `GET /dungeon/run/{instanceId}` – Current run state, cleared rooms, modifiers.
-   `GET /dungeon/clear-stats?dungeonId={id}` – Aggregate clear rates, median duration, top times.

### Proposal & Modification (Validated)

-   `POST /dungeon/run/{instanceId}/proposal` – Submit modifier adjustments (schema-validated, rate-limited).
-   `POST /dungeon/run/{instanceId}/layer` – Add instance-scoped description layer (aligned with layering engine validation).

### Telemetry Summary

-   `GET /dungeon/run/{instanceId}/metrics` – Progression timeline, room visit heatmap.

**Security**: All guarded by role/API key/Entra scopes; proposals rate-limited. AI-generated encounters validated before materialization.

## Design Principles

1. **Separation of Concerns**: Graph = structure; SQL document = volatile progression; layering = narrative delta.
2. **Idempotency Everywhere**: Retried events (enter, progress, clear) do not duplicate side effects.
3. **Non-Intrusive Extension**: Additive metadata fields; never breaking base location or exit semantics.
4. **Predictable Cleanup**: TTL/expiry on instance documents; no dangling references.
5. **Analytics First**: Event schema designed for funnel analysis, drop-off points, engagement curves.

## Partition Strategy Considerations

### Current (Single Partition)

All dungeon rooms share `'world'` partition key ([ADR-002](../adr/ADR-002-graph-partition-strategy.md)). Traversal queries remain cheap single-partition operations. No action needed now.

### Future (Region-Based Partitioning)

If RU pressure emerges AND dungeons exhibit hot-partition behavior independent of overworld:

-   Option A: Partition key = `dungeon:<dungeonId>` (template isolation).
-   Option B: Partition key = region (dungeons colocated with their overworld region).

**Tradeoff**: Cross-partition edges (entrance → first room) raise RU/query complexity. Test traversal cost before adopting. Defer until telemetry shows sustained RU > threshold (70% for 3+ days per ADR-002).

### Instance State (SQL API)

Already partitioned by `/dungeonInstanceId` (efficient point reads). No contention with graph partition strategy.

## When to Revisit Physical Separation

Trigger separate graph containers ONLY if ALL true:

1. Dungeons generate ≥30–40% of total Gremlin RU AND produce hot-partition throttling independent of overworld.
2. Ephemeral churn (create/drop structural edges) becomes measurable RU sink (verify via telemetry).
3. Bulk wipe/regeneration semantics become operationally frequent (e.g., daily rotating procedural dungeons) and tagging + selective delete proves too costly.

Until then: cost of operational complexity > benefit.

## Migration & Rollback

### Incremental Adoption Path

1. Tag existing prospective dungeon locations with `dungeonId` metadata (no functional impact).
2. Define SQL `dungeonRuns` container + repository stub (no processors yet).
3. Emit `Dungeon.Instance.Created` in shadow mode (log only, no gameplay).
4. Layer movement logic to check instance context for state overlays.
5. Add progression events + minimal telemetry dashboards.
6. Introduce modifiers (corruption/weather) via third-party or MCP proposals.

### Rollback Strategy

-   Remove instance context checks from movement handlers.
-   Revert to pure graph-based traversal.
-   Archive or expire instance documents.
-   No structural graph changes required (metadata fields remain harmless).

## Anti-Patterns

Avoid:

-   **Per-Instance Graph Cloning**: Explodes vertex count, undermines ADR-002 scaling plan.
-   **Mutable Run State as Edge Properties**: Forces high-write load on Gremlin; SQL API better suited.
-   **Premature Partition Key Diversification**: Adds cross-partition complexity without RU evidence.
-   **Embedding Lore Dumps in Code**: Use description layers + narrative doc references.
-   **Uncontrolled Edge Duplication**: Idempotent exit creation must guard against multi-materialization.

## Open Questions (To Resolve Before M6 Implementation)

-   Should instance TTL be configurable per-dungeon or global policy?
-   Do we need explicit "checkpoint" state within runs (partial progress save)?
-   How to handle abandoned runs (player never returns) vs timeout (system-initiated eviction)?
-   Should cleared status persist beyond TTL for leaderboards/achievements?

## Related Documentation

-   [Exit Edge Invariants](./exits.md) – Directional uniqueness, reciprocity, idempotency
-   [Location Version Policy](./location-version-policy.md) – Exit changes do not increment content version
-   [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) – Single partition MVP, region sharding future
-   [World Event Contract](./world-event-contract.md) – Envelope structure, idempotency, correlation
-   [Direction Resolution Rules](./direction-resolution-rules.md) – Canonicalization for exit edges

## Implementation Roadmap Reference

See **Epic #TBD** (Dungeon Run Infrastructure) planned for **M6: Dungeon Runs** milestone (post-M4 Layering & Enrichment, post-M5 Systems scaffold).

---

_Last updated: 2025-10-22 (initial draft; planned post-M4)_
