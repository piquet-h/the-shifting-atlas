# Design Document: Multiplayer Mechanics

## Vision

Create a living, multiplayer world where collaboration, conflict, and shared storytelling evolve dynamically. Every party decision, combat encounter, and NPC interaction should feel meaningful—shaped by persistent context, adaptive AI, and player-driven consequences. The system should empower both casual adventurers and strategic roleplayers to co-create a rich, responsive narrative landscape.

## 🧑‍🤝‍🧑 Multiplayer Mechanics: Syncing player states, cooperative exploration

-   Real-time state synchronization
-   Party formation and shared objectives
-   PvP and PvE mechanics
-   Instance management and matchmaking

### Real-time state synchronization

-   Real-time vs. async updates
-   Shared quest progression and NPC memory
-   Location syncing and party movement logic
-   **Temporal reconciliation**: When players reunite after asynchronous play (one online, one offline), their individual timelines must align. See [World Time & Temporal Reconciliation Framework](./world-time-temporal-reconciliation.md) for details on reconciliation policies (wait/slow/compress) and narrative generation for "time passes" scenarios.

**Key Principle**: Players act asynchronously, accumulating personal time offsets. When they meet at a shared location, the temporal system reconciles their clocks to a common anchor, ensuring consistent shared reality without breaking narrative flow.

**Example Scenario**:

-   Player A offline for 8 hours (real-time) → drift applied → player clock advances by 8 in-game hours
-   Player B active, advances clock by 2 in-game hours via actions
-   Player A reconnects, moves to same location as Player B
-   Reconciliation: Both players' clocks align to location anchor (max of both offsets)
-   Narrative: "Hours pass as you catch up with your companion..."

See Epic #497 for temporal reconciliation implementation status.

### Party formation and shared objectives

-   Invite/accept/kick flow
-   Shared loot rules and quest objectives
-   Role-based bonuses and synergy effects

### PvP and PvE mechanics

-   Combat rules, stat scaling, and faction modifiers
-   Instance logic for dungeons, arenas, and boss fights
-   Reputation impact and griefing mitigation

### Instance management and matchmaking

## World State Layers & Synchronization

Multiplayer visibility of evolving locations leverages the **immutable base + additive layer** model defined in `navigation-and-traversal.md` and enriched via AI genesis (`ai-prompt-engineering.md`).

### Layer Categories (Read-Only to Clients)

| Layer Type  | Example                                | Sync Characteristics                                            |
| ----------- | -------------------------------------- | --------------------------------------------------------------- |
| Base        | Original location genesis description  | Cached aggressively; invalidates only on structural audit fixes |
| Event       | "A fresh barricade blocks the archway" | Propagated immediately (low TTL caching)                        |
| Faction     | "Banners of the Azure Sigil hang here" | Region-scope invalidation on faction shift                      |
| Seasonal    | "Lanterns glow for the Equinox"        | Preloaded via seasonal manifest                                 |
| Catastrophe | "Ash and embers swirl in the ruin"     | High-priority fan‑out (push)                                    |
| Aftermath   | "Charred beams now cool in silence"    | Replaces catastrophe layer ordering, not base                   |

### Consistency Model

-   **Location Snapshot**: Server composes ordered layers → hash → clients diff apply.
-   **Delta Broadcast**: Only new/removed layer IDs + changed exit states.
-   **Conflict Avoidance**: Player-authored micro-layers (future) require optimistic version; reject on mismatch.

### Traversal Event Flow (Simplified)

1. Player issues move.
2. Server validates `EXIT` (state=open, gating satisfied).
3. Movement committed; latency + network timing recorded via `Multiplayer.Movement.Latency`. If traversal reveals or creates an additive layer, emit `World.Layer.Added`.
4. Party sync: party members receive prioritized delta packet with new location hash and delta layers.

### Latency Targets (Aspirational)

| Operation                                   | p50      | p95      |
| ------------------------------------------- | -------- | -------- |
| Movement round-trip (no genesis)            | < 250ms  | < 500ms  |
| Movement + on-demand genesis (new location) | < 1200ms | < 1800ms |
| Layer push fan-out (<= 500 subs)            | < 300ms  | < 650ms  |

### Anti-Griefing Integration

Griefing signals (quest sabotage, harassment patterns) reduce _layer publication privileges_ for player-authored overlays (future feature) without desynchronizing core structural updates.

### Telemetry (Multiplayer Scope)

Canonical events (see `shared/src/telemetryEvents.ts`; all emitted via `trackGameEventStrict`):

-   `Multiplayer.LayerDelta.Sent` (layerCount, bytes, recipients)
-   `Multiplayer.LocationSnapshot.HashMismatch` (clientHash, serverHash)
-   `Multiplayer.Movement.Latency` (serverMs, networkMs)

### Open Considerations

-   Regional batching of broadcast vs per-location micro-packets.
-   Predictive prefetch of adjacent location layer sets for fast parties.
-   Privacy gates for secret layers (individual vs group discovery state).

---

_Multiplayer layer synchronization section added 2025-09-25 to align with AI-first world crystallization._

-   Shard logic: local vs. global state
-   Matchmaking protocols and encounter scaling
-   World event triggers and resolution tracking
