# Dungeon Runs (Concept Facet: Episodic Subgraph Instances)

> Status: DRAFT · Planned implementation post-M4 (Layering & Enrichment)

## Purpose

Enable focused, time-bounded adventures within self-contained structural subgraphs ("dungeons") overlaid with transient per-run state, providing pacing, replayability, controlled risk/reward balance, and safe extensibility—without fragmenting the unified world graph or violating established exit/layering invariants.

## What Is a Dungeon Run?

**Dungeon Run**: A transient traversal of a dungeon template (immutable graph structure) with its own ephemeral state document and outcome tracking, isolated from the persistent open world.

### Core Components

1. **Template**: Immutable topology (rooms as `location` vertices, exits as directional edges) persisted in Gremlin graph.
2. **Instance**: Ephemeral run-specific state (`dungeonInstanceId` document) tracking progression (cleared rooms, loot rolls, modifiers).
3. **Lifecycle**: Bootstrap → Active Traversal → Resolution → Teardown (TTL expiry of instance state).

## Why Dungeon Runs Matter

1. Pacing & Dramatic Arc
2. Risk/Reward Isolation
3. Difficulty Modulation
4. Replayability Without Content Bloat
5. Clean Analytics
6. Narrative Experimentation Sandbox
7. Concurrency Control
8. Emergent Lore Anchoring

## Alignment with Architecture

### Unified Graph (ADR-002)

Tagged subgraph within single partition (future partitioning deferred).

### Exit Edge Invariants

Obeys all invariants from `./exits.md` (directional uniqueness, reciprocity optional, idempotent). Instance state overlays do not mutate structural edges.

### Player Location Scalar (ADR-003)

Authoritative `currentLocationId` remains; instance context augments movement logic without schema change.

### Description Layering

Base room prose immutable; instance narrative overlays (atmosphere, corruption) additive; expire with run.

## Instance State (Conceptual Shape)

```
DungeonRunDocument {
  id: dungeonInstanceId
  dungeonId: string
  playerIds: string[]
  seed: string
  status: 'active' | 'cleared' | 'failed' | 'expired'
  entranceLocationId: string
  clearedRooms: Record<roomId, { clearedUtc: ISO }>
  lootRolls: Array<{ roomId:string; itemId:string; rarity:string; takenUtc?:ISO }>
  modifiers: { corruptionLevel?:number; weather?:string; factionInfluence?:string }
  metrics: { lastProgressUtc: ISO; roomsVisited: number; elapsedMs: number }
  ttl?: number
}
```

## Event Types (Proposed)

- Dungeon.Instance.Created
- Player.Dungeon.Enter
- Player.Dungeon.Progress
- Dungeon.Run.Cleared
- Player.Dungeon.Exit

## Movement Integration (Concept)

Entrance movement triggers instance creation (idempotent); in-dungeon movement consults instance overlays; exit finalizes status + telemetry.

## Edge Cases

Disconnect mid-run, multi-player parties (future), expiry eviction, partial generation failure (abort before enter event).

## Design Principles

Separation of concerns (graph vs SQL), idempotency, additive metadata, predictable cleanup, analytics-first.

## Partition Strategy (Deferred)

Remain single partition until RU pressure substantiates separation (see `../adr/ADR-002-graph-partition-strategy.md`).

## Anti-Patterns

Per-instance graph cloning, mutable run state on edges, premature partitioning, lore dumps in code, uncontrolled edge duplication.

## Open Questions (Pre-M6)

TTL granularity, checkpointing, abandoned vs timeout semantics, persistence of clear stats.

## Related Documentation

- [Exit Edge Invariants](./exits.md)
- [Location Version Policy](../architecture/location-version-policy.md)
- [ADR-002: Partition Strategy](../adr/ADR-002-graph-partition-strategy.md)
- [Direction Resolution Rules](./direction-resolution-rules.md)
- [Architecture Overview](../architecture/overview.md)

## Implementation Roadmap Reference

Execution details moved to `../execution/modules-implementation.md` (M6 Dungeon Runs cluster).

---

_Last updated: 2025-10-31 (relocated to concept facet; execution sections trimmed)_
