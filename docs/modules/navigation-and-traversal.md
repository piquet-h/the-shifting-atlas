# Design Document: Navigation and Location Generation System

> STATUS: FUTURE / NOT IMPLEMENTED (2025-09-21). No traversal, location generation, or graph persistence code exists yet. This document is an architectural outline only. Initial implementation will start with two hardcoded locations and a `look`/`move` command before any procedural or AI-driven expansion.

> Related: [World Rules & Lore](world-rules-and-lore.md) · [AI Prompt Engineering](ai-prompt-engineering.md) · [Multiplayer Mechanics](multiplayer-mechanics.md) · [Extension Framework](extension-framework.md)

## Summary

The system powers a persistent, MMO-scale text adventure blending D&D mechanics with generative AI. Players can drop in/out, form guilds, influence factions, and co-create the world through play.

Locations are represented as nodes in a 3D graph, with exits as edges storing directional vectors and rich metadata. The system ensures intuitive, context-aware navigation and dynamic location generation using Azure OpenAI and Cosmos DB.

## Graph Schema (Initial Implementation Target)

This section narrows the aspirational vision into a concrete, minimal-yet-extensible graph model for the first traversal milestone.

### Vertex Types

| Label                        | Purpose                                                                | Notes                                                   |
| ---------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `Location`                   | A discrete traversable space presented to the player.                  | Smallest interaction unit (where LOOK text renders).    |
| `Structure` (optional later) | Large composite location (e.g., Coliseum) grouping internal locations. | Enables hierarchical navigation & aggregated analytics. |
| `Zone` (future)              | Thematic/biome region spanning many locations.                         | Used for encounter tables & faction influence.          |
| `Portal` (optional)          | Special traversal anchor (teleport pad, waystone).                     | Distinct semantics from ordinary exits.                 |

Initial implementation uses only `Location`; `Structure` and `Zone` are design placeholders so early decisions don’t block future hierarchy.

### Edge Types

| Label               | Direction               | Purpose                                                                       | Key Properties                                                                           |
| ------------------- | ----------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `EXIT`              | `Location -> Location`  | Player movement; canonical traversable connection.                            | `dir`, `name`, `kind`, `distance`, `travelMs`, `state`, `gating`, `genSource`, `version` |
| `CONTAINS`          | `Structure -> Location` | Hierarchical membership (arena owns inner ring locations).                    | `role` (e.g., `outer_concourse`, `inner_stage`)                                          |
| `CONNECTS` (future) | `Zone <-> Zone`         | Region adjacency for procedural expansion.                                    | `boundaryType`                                                                           |
| `LINKS` (future)    | `Location -> Portal`    | Association to special mechanics (fast travel).                               | `activation`                                                                             |
| `VANTAGE` (future)  | `Location -> Location`  | One-way descriptive visibility (you can see the arena floor from the stands). | `visibilityTier`, `obstruction`                                                          |

Only `EXIT` is required for the MVP. Others provide a roadmap (do not implement prematurely).

### Core Properties

Location Vertex (`Location`):

- `id` (GUID)
- `name`
- `baseDescription` (human-authored stable text)
- `descLayers` (array of layered description objects; see AI section)
- `biome` (string)
- `tags` (string[]; e.g. `"urban"`, `"arena"`, `"stone"`)
- `vector` (object: `{ x, y, z }`) – optional in earliest slice (can stub `{0,0,0}`)
- `exitsSummaryCache` (string; regenerated when exits change)
- `lastGeneratedUtc` (ISO; when AI layer updated)
- `revision` (int, optimistic concurrency)

Exit Edge (`EXIT`):

- `dir` (enum token – cardinal, vertical, semantic, radial)
- `name` (player-facing label; e.g. `North Gate`, `Archway`, `Tunnel`)
- `kind` (`cardinal` | `vertical` | `radial` | `semantic` | `portal`)
- `distance` (relative units or abstract difficulty metric)
- `travelMs` (approx movement time; default null initially)
- `state` (`open` | `closed` | `locked` | `concealed`)
- `gating` (optional expression: e.g. `requires:item:bronze_key` or `skill:athletics>=12`)
- `accessibility` (object: `{ mobility: boolean, lowVision: boolean }` future)
- `genSource` (`manual` | `ai` | `hybrid`)
- `version` (int)
- `createdUtc`

### Rationale for a Single `EXIT` Label

Using one edge label with a `dir` + `kind` property avoids edge label explosion (`EXIT_NORTH`, `EXIT_SOUTH`, ...). Query patterns remain simple:

```
g.V(roomId).outE('EXIT').has('dir','north').inV()
```

Directional synonyms ("n", "north", "North Gate") are normalized at the command parsing layer, _not_ stored as multiple edges.

## Modeling Complex Multi-Exit Structures (Coliseum Example)

Scenario: A circular outer concourse with multiple numbered gates leading inward to the arena floor, plus service tunnels and vertical stands access.

Approach Options:

1. **Flat Locations Only (MVP)** – Each concourse segment and the arena floor are `Location` vertices; gates are `EXIT` edges. Pros: simplest now. Cons: analytics across the entire coliseum require grouping logic later.
2. **Introduce `Structure` Vertex (Later)** – A single `Structure` vertex (`Coliseum`) with `CONTAINS` edges to its internal `Location`s. Enables aggregated metrics (players inside, events broadcast scope) and AI prompts referencing parent context.

MVP Recommendation: Implement the coliseum using only `Location` + `EXIT`, _but_ name/tag locations with a consistent scheme:

- `Coliseum Concourse NW`
- `Coliseum Concourse North`
- `Coliseum Gate 3`
- `Coliseum Arena Floor`

Add shared tags: `arena`, `coliseum`, `public` so future queries can group them:

```
g.V().hasLabel('Location').has('tags','arena')
```

### Internal vs Radial Exits

- **Radial (inward/outward)**: Use `kind: 'radial'` with `dir: 'in'` or `dir: 'out'` (paired edges). Name edges for specificity: `North Gate`, `Gate 3`.
- **Concourse Circumference**: Cardinal or semantic (e.g., `clockwise`, `counterclockwise`) – store as `kind: 'semantic'`, `dir: 'clockwise'` if adopting rotational movement.
- **Vertical Access**: Stands/seating tiers use `kind: 'vertical'`, `dir: 'up'` / `dir: 'down'`.

### Vantage & Visibility (Deferred)

To describe seeing the arena from the stands without enabling traversal, add a future `VANTAGE` edge (directional, one-way). The presence of `VANTAGE` allows the LOOK command in the source location to merge sensory fragments from the target.

## Exit Taxonomy & Direction Normalization

| Kind              | Examples                              | Player Input Examples             | Normalization Output (`dir`) |
| ----------------- | ------------------------------------- | --------------------------------- | ---------------------------- |
| `cardinal`        | north, south-east                     | `n`, `N`, `north`                 | `north`                      |
| `vertical`        | up/down ladders                       | `climb up`, `u`                   | `up`                         |
| `radial`          | inward/outward in circular structures | `in`, `enter arena`, `out`        | `in` / `out`                 |
| `semantic`        | `archway`, `iron door`, `tunnel`      | `through archway`                 | canonical slug (`archway`)   |
| `portal` (future) | waystone, shrine                      | `teleport shrine`, `use waystone` | slug of portal               |

Parsing layer resolves synonyms → canonical `dir` + optional target filter (e.g. choose between two `archway` edges by disambiguating with ordinal or additional descriptor).

## AI-Assisted Description & Exit Generation (Layered Model)

We preserve design control & moderation while leveraging generative AI:

`baseDescription` – Hand-authored, safe fallback.
`descLayers[]` – Array of layered augmentation objects (see `description-layering-and-variation.md` for full cross‑cutting model). Token placeholders are **not** embedded; variation is additive and base text is immutable.

```
{
    layer: 'ai',            // or 'event', 'seasonal'
    text: 'Roaring crowds...',
    model: 'gpt-4o-mini',
    promptHash: 'sha256:abc123',
    createdUtc: '2025-09-25T12:34:00Z',
    moderation: { approved: true, reviewer: 'designerA' }
}
```

Render pipeline for LOOK (tokenless layering):

1. Start with immutable `baseDescription`.
2. Apply structural event layers (chronological) that may supersede base clauses (without editing stored base).
3. Apply active ambient (weather/time/season) + enhancement layers.
4. Append synthesized exits summary (from `exitsSummaryCache`).
5. (Optional) Append personalization overlay (not persisted globally).

Exit generation uses a two-pass prompt approach:

1. **Structure pass**: Ask model for candidate exits (JSON) with `dir`, `kind`, `narrativeHook`.
2. **Description pass**: For each accepted exit edge, generate a short phrase for origin-facing description; store in edge property `edgeDesc` (optional, can be deferred until edges are stable).

Regeneration triggers:

- Edge add/remove → mark location `exitsSummaryCache` stale.
- World event (e.g., `gate_closed`) → append new `event` layer or modify edge `state`.
- Scheduled freshness job (e.g., weekly) → re-run AI layer _only if_ last change > threshold.

Moderation pipeline (initially manual override): Generated text is NOT persisted into `descLayers` until a flag is set (avoid storing unreviewed hallucinations). Early MVP can skip moderation fields but structure them for forward compatibility.

## Gremlin Query Examples (Illustrative)

Get all exits & target location names for a location:

```
g.V(roomId).outE('EXIT').as('e').inV().project('dir','name','to')
    .by(values('dir'))
    .by(values('name'))
    .by(values('name'))
```

Traverse via direction if open:

```
g.V(roomId).outE('EXIT')
    .has('dir','north').has('state','open')
    .inV().limit(1)
```

List radial inward gates from concourse:

```
g.V(concourseId).outE('EXIT')
    .has('kind','radial').has('dir','in')
    .inV()
```

Find locations needing exit summary regeneration (no cache or stale):

```
g.V().hasLabel('Location')
    .has('exitsSummaryCache',within('', null))
```

## Implementation Phases Alignment

| Phase | Scope                                             | Notes                                         |
| ----- | ------------------------------------------------- | --------------------------------------------- |
| 1     | Locations + `EXIT` edges + baseDescription        | Hardcoded seed, no AI, manual creation.       |
| 2     | Normalization + exit summary cache                | Player-friendly LOOK output.                  |
| 3     | AI candidate exits (non-persisted until approved) | Store proposals separately (not yet modeled). |
| 4     | AI description layers + regeneration triggers     | Introduce `descLayers`.                       |
| 5     | Hierarchical `Structure` + vantage edges          | Complex spatial narration.                    |

## Direction & Input Normalization Roadmap

> Purpose: Convert messy, player-friendly freeform traversal input into a canonical movement or generation directive without losing semantic richness needed by AI, telemetry, gating, or future spatial reasoning.

### Definition

Normalization = layered reconciliation of player intent ("go north", "enter archway", "through the forge door", "left", typo'd forms, landmarks) into a structured result:

```
{
    status: 'ok' | 'ambiguous' | 'unknown' | 'generate',
    canonical?: { dir: string; kind: 'cardinal'|'vertical'|'radial'|'semantic'|'portal' },
    candidates?: Array<{ dir: string; kind: string; score: number }>,
    generationHint?: { dir: string; reason: string; vector?: {x:number,y:number,z:number} },
    clarification?: string
}
```

Only the canonical `dir` is persisted on `EXIT` edges; expression diversity lives in the parsing layer.

### Layered Pipeline

1. Preprocess – lowercase, trim, collapse whitespace, strip trailing punctuation.
2. Shortcut Expansion – `n`→`north`, `sw`→`southwest`, `u`→`up`, `enter` (alone) → `in`.
3. Phrase Reduction – remove leading verbs (`go`, `walk`, `head`, `enter`, `step into`).
4. Semantic / Landmark Resolution – map tokens to exits by:
    - Exact dir match
    - Exit `name` / `synonyms`
    - Landmark alias → direction (e.g. `fountain` → `north` if annotated locally)
5. Compound Compass Handling – snap unsupported composites (`north-northeast`) to nearest canonical 8‑way (configurable for future 16‑way). No storage of raw composite.
6. Relative Directions – `left/right/forward/back` transformed using player's `lastHeading`; if absent, request clarification.
7. Typo Tolerance – fuzzy match (edit distance ≤1) to existing direction or exit name.
8. Availability & State – confirm an `EXIT` edge exists and `state === open`; return gating info otherwise.
9. Generation Fallback – if direction valid but no edge: produce `generationHint` (possible AI expansion trigger).
10. Ambiguity Resolution – if multiple exits score similarly, return ranked candidates for client disambiguation prompt.

### Canonical Direction Set Strategy (Internal Stages – NOT Issue Labels)

Dir Stage 1: 8 compass + `up/down` + `in/out` (radial) – keeps analytics simple.

Dir Stage 2: Add semantic slugs for named exits (`archway`, `tunnel`) with `kind: semantic`.

Dir Stage 3: Relative tokens (`left/right/forward/back`) – maintained purely at parsing layer; never stored on edges.

Dir Stage 4 (optional): High precision bearings – store `bearingDeg` (0–359) while keeping snapped `dir` for compatibility.

### Data Model Touchpoints

Exit Edge (future extension fields):

```
dir, kind, name?, state, gating?, distance?, travelMs?, synonyms?: string[], landmarkRefs?: string[], bearingDeg?, genSource
```

Location (future): `landmarkAliases: string[]`, `vector`, `exitsSummaryCache`.

### Seed & Data Hygiene

Validation rule: all `exits[].direction` must map to **current** canonical set. Composite or unknown tokens are rejected during CI.

Sanitization script (planned): parses seed JSON, warns on unknown directions, offers snap suggestions (e.g. `south-southwest` → `southwest`).

### Telemetry Events (Additions)

- `Navigation.Input.Parsed` (rawLen, canonicalDir, latencyMs, ambiguityCount)
- `Navigation.Input.Ambiguous` (optionsCount)
- `Navigation.Exit.GenerationRequested` (dir, reason)
- `Navigation.Exit.GenerationRejected` (reason)

These feed confusion / friction dashboards and drive iterative lexicon tuning.

### Implementation Milestones (Normalization Sub-Phases)

| N-Phase | Goal                           | Deliverables                                                         |
| ------- | ------------------------------ | -------------------------------------------------------------------- |
| N1      | Basic lexical normalization    | Utility + tests: shortcut & typo mapping; seed validator.            |
| N2      | Landmark + semantic exit names | Extend seed with `name` / `synonyms`; landmark alias resolution.     |
| N3      | Relative directions            | Track `lastHeading` per player; implement `left/right/forward/back`. |
| N4      | Generation fallback            | Emit generation events when direction has no edge.                   |
| N5      | Bearing precision (optional)   | Add `bearingDeg` + snapping; analytics for path smoothness.          |

### Open Design Decisions (Normalization)

- Do we persist `bearingDeg` early, or derive later from vector deltas? (Leaning: derive.)
- Should landmark alias resolution be server-only or hinted by client for UI auto-complete? (Leaning: server authoritative.)
- Minimum confidence threshold for fuzzy direction correction vs prompting user? (Tune via telemetry.)

### Rationale Recap

Keeping exit storage canonical prevents direction token explosion, simplifies Gremlin queries, and keeps telemetry aggregatable while allowing rich player phrasing and future AI hooks (semantic exits & generation).

## AI-First Crystallization Strategy

> Philosophy: The world is born through AI "genesis transactions" that crystallize into immutable base layers. Subsequent change is additive (event/faction/season layers) — never silent destructive rewrites. Non-determinism is embraced; auditability and provenance guarantee trust.

| Stage | Focus               | AI Role                    | Human Gate              | Structural Volatility     | Advancement Signals                      |
| ----- | ------------------- | -------------------------- | ----------------------- | ------------------------- | ---------------------------------------- |
| A     | Anchor Locations    | None (hand-authored)       | Designer                | None                      | Baseline traversal & telemetry online    |
| B     | AI Genesis          | Full location + exits JSON | Auto unless flagged     | Adds new nodes/edges only | Low duplication & safety pass rate > 95% |
| C     | Event Layers        | Describe world change      | Sometimes (high-impact) | Non-structural overlays   | Latency & cost within budget             |
| D     | Perspective/Sensory | Alternate views            | Optional                | Non-structural            | Engagement uplift vs control sample      |
| E     | Epoch Evolution     | Motif/style shifts         | Manual                  | Limited new branches      | Stable retention & low confusion metrics |
| F     | Player Co-Creation  | Constrained imprints       | Required                | Micro-layer only          | Moderation turnaround < SLA              |

### Generation (Genesis) Pipeline

1. **Intent** (exploration, scripted expansion, extension hook)
2. **Context Assembly**: Nearby location snapshot, biome distribution, active faction states, prior motifs, uniqueness embeddings
3. **Prompt Build** (see `ai-prompt-engineering.md`): includes safety & style constraints
4. **Model Response** → structured JSON
5. **Validation Gates**:
    - Schema completeness
    - Safety / profanity filter
    - Name uniqueness / collision check
    - Embedding similarity threshold (reject if too similar to neighbors)
    - Tag hygiene (no forbidden combos)
6. **Staging Vertex**: `status: 'pending'` (not yet visible)
7. **Crystallize**: Commit to `Location` + `EXIT` edges; set `creationEpoch`; persist `provenance`
8. **Post-Commit Hooks**: Index embedding, schedule optional vantage proposals, emit telemetry

### Provenance Object

Stored on each generated location (and optionally on exits):

```
provenance: {
    genSource: 'ai',
    model: 'gpt-4o-mini',
    promptHash: 'sha256:...',
    contextWindow: { nearby: 8, biome: 'urban_spire' },
    embeddingHash: 'sha256:...',
    approvedBy: 'auto' | 'moderator:<id>',
    createdUtc: '2025-09-25T12:34:00Z'
}
```

### Mutation via Layers (No Base Rewrite)

- Structural events add edges / set edge `state`
- Environmental, faction, catastrophe, seasonal -> new `descLayers` entries
- Restoration / aftermath -> layer referencing prior state (audit chain preserved)

### Safeguards

| Risk                    | Control                                           |
| ----------------------- | ------------------------------------------------- |
| Offensive / unsafe text | Safety filter + moderation staging                |
| Semantic duplication    | Embedding nearest-neighbor reject                 |
| Cost runaway            | Token budget & per-epoch caps                     |
| Player confusion        | Change layers always narrate _why_                |
| Irreversible bloat      | Rollback log of genesis transactions & edge diffs |

### Minimal Anchor Phase (Stage A)

Even AI-first strategy benefits from 5–8 curated anchor locations to establish style, biome gradients, and motif seeds feeding early prompts.

### Telemetry (Key Events)

Canonical event names follow the `Domain.[Subject].Action` PascalCase pattern (2–3 segments) and are centrally defined in `shared/src/telemetryEvents.ts`. Do not introduce ad‑hoc names here—extend the canonical list first if a new event is required.

- `World.Location.Generated` (tokens, latencyMs, safetyResult, similarityScore)
- `World.Location.Rejected` (failureCode)
- `World.Layer.Added` (layerType, roomId)
- `World.Exit.Created` (dir, kind, genSource)

Instrumentation MUST use `trackGameEventStrict` to enforce name validity; legacy helpers should be migrated.

### Advancement Criteria (B → C)

- Sustained similarity rejection < 10%
- Safety false-positive rate acceptable (< 3%)
- Median genesis latency within target (< X ms after warm)

Refer to: `ai-prompt-engineering.md` for prompt schemas; `extension-framework.md` for pre/post genesis hooks.

## Open Questions (Tracked)

- Do we move player location as a property (`currentRoomId`) or add `AT` edges? (MVP: property, migration path documented.)
- Should exit edge contain inverse reference metadata for summary optimization? (Likely unnecessary early; can query reverse.)
- Do we cache direction synonyms per locale? (Internationalization deferred.)

## Next Actions

1. Implement `Location` + `EXIT` TypeScript interfaces (shared module).
2. Create `HttpCreateRoom`, `HttpLinkRooms`, `HttpGetRoom` Functions.
3. Implement direction normalization utility (string → { dir, kind }).
4. Add seed script for small coliseum slice (outer concourse + arena + 2 gates).
5. Defer AI integration until baseline traversal & tests pass.

---

_This schema section was added (2025-09-25) to prevent rework before coding the traversal layer._

## Location Generation

1. **Trigger: Location Creation with Exit Expansion**
    - When a new location is created, the system immediately generates all connected locations for each exit vector.
    - This proactive generation enables batch creation of multiple locations in advance.
    - If an exit leads to an existing location node, the system tailors the new location's description to match the destination's biome, mood, and spatial context.

2. **Contextual Prompt Construction**
    - A prompt is built for Azure OpenAI, including details like current location, vector hint, nearby locations, and generation rules (e.g., biome continuity, max distance, unique names).
    - Example prompt: “Generate a new forest location approximately 10 units north of Whispering Glade. Nearby is Mossy Hollow. Ensure biome continuity and avoid naming conflicts.”

3. **AI Response Parsing**
    - Extracts details such as name, description, biome, and optional tags (e.g., mood, elevation, hazards).

4. **Vector Assignment and Convergence**
    - Computes a target vector using directional heuristics and applies proximity checks.
    - If an existing location is nearby, reuse it and add a portal with narrative stitching.
    - Otherwise, generate a new location and assign its vector.

5. **Graph Persistence**
    - Adds the new location as a vertex and the connection as an `exit_to` edge.
    - All metadata is stored in Cosmos DB.

6. **Tailoring for Existing Destinations**
    - When an exit leads to an existing location, the origin’s exit description is tailored to reflect the destination’s biome, mood, elevation, and other metadata.
    - This supports spatial continuity, narrative stitching, environmental foreshadowing, and multiplayer consistency.
    - Tailoring may be skipped for symbolic exits, mysterious destinations, or rapid traversal scenarios.

## Navigation and Traversal

1. **Traversal Logic**
    - Players choose a direction via semantic exit or freeform input.
    - The system checks for existing edges:
        - If `exit_to`: Moves to the connected location.
        - If none: Generates a new location and connection immediately.
    - New locations and edges are persisted in Cosmos DB.

2. **Procedural Navigation in 3D Space**
    - Locations are stored as 3D vectors relative to a global origin.
    - Euclidean distance measures proximity between locations.
    - Proximity thresholds define connection criteria.
    - Vector normalization ensures consistent direction representation.

3. **Directional Heuristics**
    - Directional weighting influences location generation and connections.
    - Vector adjustments and biome clustering enhance spatial and thematic coherence.

4. **Terrain Types and Modifiers**
    - Elevation and slope affect stamina cost, speed, and DCs for movement.
    - Hazards like rivers, lava, and blizzards require skill checks or items.
    - Faction zones restrict access and influence encounter tables.

5. **Traversal Skill Checks**
    - Movement challenges (e.g., climbing, swimming) are gated by D&D skill checks.
    - Terrain, gear, spells, and party assists modify DCs.

6. **Fast Travel and Teleportation**
    - Anchors like waystones and shrines enable fast travel.
    - Require discovery and resources; preserve spatial consistency.

7. **Semantic Exits**
    - Natural language descriptions are parsed into vectors and conditions.
    - Developers can seed exits with explicit vectors and tags.

8. **Multiplayer Convergence and Retroactive Portals**
    - Spatial checks reuse nearby locations to avoid duplicates.
    - If a portal doesn't exist, retroactively add one with narrative justification.
    - Temporal tags track who/when changed what.

9. **Temporal Tagging and World Evolution**
    - Each edge and location is annotated with timestamps and player IDs.
    - Evolution events (e.g., clearing vines, building bridges) mutate the graph.
    - Azure OpenAI generates narrative updates reflecting changes.

10. **Narrative Integration**
    - Prompts describe how player actions alter traversal.
    - Hidden paths become visible after evolution.

11. **Anti-Griefing Mechanics**
    - The system tracks player actions and tags disruptive behavior patterns.
    - Griefers experience reduced narrative rewards, diminished skill check success rates, and lower encounter quality over time.
    - These mechanics are designed to preserve enjoyment for cooperative players while discouraging repeated disruptive behavior.

## Long-Distance Travel Architecture (Journey Model)

> Scope: Concise architectural slice for multi-hop / overland movement. Complements (not replaces) existing real-time single-hop traversal. Event‑driven; no polling loops.

### Goals

- Allow a player to request travel to a distant target (location ID, landmark alias, semantic phrase) without manually issuing each intermediate `move`.
- Preserve world consistency & interruption points (encounters, gating, generation fallbacks) while keeping Functions stateless per invocation.
- Re‑use the existing `Location` + `EXIT` graph; do not introduce a parallel pathing mesh.

### Journey Vertex (Conceptual)

```
Journey {
    id, playerId,
    status: 'in_progress' | 'completed' | 'interrupted' | 'waiting_generation' | 'unreachable' | 'stalled',
    origin: string,
    target: { kind: 'location' | 'landmark' | 'semantic'; ref: string; resolvedLocationId?: string; confidence?: number },
    legs: [ { seq, from, to, edgeId?, estMs, mode: 'walk' | 'fast_travel' | 'conveyance', genStatus?: 'none'|'pending'|'provisional'|'final' } ],
    totalEstMs, startedUtc, etaUtc?, completedUtc?,
    meta?: { strategy: string; cache: 'hit' | 'miss'; version: string }
}
```

Persisted only when multi-hop; a plain single move stays lightweight.

### Lifecycle (Events / Queue Messages)

1. Request (HTTP) – validate target & origin, attempt path resolution (see below). If no route & generation disallowed → status `unreachable`.
2. Persist Journey (status `in_progress`) & emit TravelStarted event.
3. Enqueue first leg message with visibility delay = leg.estMs (or a shorter tick slice if fine‑grained interruption required).
4. Leg Processor (Queue): on visibility
    - Update player location (or mark in‑transit if using transient state)
    - Emit LegComplete event
    - If next leg needs generation (gap) → emit GenerationRequested, set journey status `waiting_generation`; otherwise enqueue next leg.
5. Completion: all legs done → status `completed`, emit TravelCompleted.
6. Interruption (encounter / cancellation) → status `interrupted`; resumption re‑enqueues remaining leg(s).

No timers or loops live inside a Function host—progress is entirely message‑driven.

### Path Resolution Strategies (Progressive)

| Stage | Strategy                           | Notes                                                                 |
| ----- | ---------------------------------- | --------------------------------------------------------------------- |
| 1     | BFS (unweighted)                   | Depth + node cap to avoid runaway; sufficient for early sparse graph. |
| 2     | Weighted (travelMs / distance)     | Client-side Dijkstra/A\* after pulling bounded neighborhood.          |
| 3     | Landmark overlay / hub contraction | Precompute hub <-> hub macro paths; expand only near endpoints.       |
| 4     | Generation fallback integration    | Missing edge triggers controlled expansion (ties to N4).              |

Route cache (key: origin+target+graphVersionHash) reduces repeat compute; cache invalidated on topology change.

### Generation Fallback

If path search halts at a frontier and expansion is allowed: emit a GenerationRequested (normalization phase N4) and pause (`waiting_generation`). When new EXIT crystallizes, resume with re‑attempted path from the frontier.

### Telemetry (Names Centralized)

Add (via shared telemetry registry – do NOT inline literal strings here; list is descriptive):

- Navigation.Travel.Requested (targetKind, distanceApprox, inputLen)
- Navigation.Travel.PathResolved (legs, strategy, cacheHit, gapsGenerated)
- Navigation.Travel.LegComplete (seq, estMs, actualMs, mode)
- Navigation.Travel.GenerationFallback (reason)
- Navigation.Travel.Completed (totalActualMs, interruptions)
- Navigation.Travel.Interrupted (cause)

Key derived metrics: route cache hit %, fallback rate per 100 journeys, avg leg variance (actual vs est), interruption density per biome.

### Fast Travel (Macro Edges)

Fast travel reuses the Journey flow with a single leg whose `mode = 'fast_travel'`. Macro edges are only created after:

- Player has traversed underlying path end‑to‑end at least once.
- Risk envelope below threshold & gating satisfied.
- (Optional) Faction standing or discovery milestone.

### Failure / Edge Cases

| Case                        | Outcome                                                        |
| --------------------------- | -------------------------------------------------------------- |
| Target == origin            | Return completed journey (no legs).                            |
| No path & gen disabled      | status `unreachable`.                                          |
| Generation fails repeatedly | status `stalled`; surface remediation hint.                    |
| Duplicate concurrent travel | Return existing active journey (idempotency).                  |
| Topology change mid‑journey | Revalidate remaining path on next leg start; reroute or pause. |

### Incremental Delivery Slice

1. Multi-hop BFS planner (no generation, no encounters) + Journey persistence + start/leg/complete events.
2. Route cache + telemetry instrumentation.
3. Generation fallback integration (after N4 live).
4. Fast travel macro edges.
5. Encounter / interruption injection layer.

The above keeps early implementation small while leaving clear extension seams.

## Extension Points and Developer API

- Developers can inject regions, traversal puzzles, and item/quest content.
- Regions are seeded with coordinates, biomes, and vector fields.
- Traversal puzzles include custom conditions, DCs, and narrative hooks.
- Safety checks validate injected content against spatial constraints.
- Contracts support generation, approval, rollback, and versioning.

## Future Expansion: Pre-Generated Quest Paths

Once basic location generation and traversal are complete, the system can support pre-generated quest paths. These are sequences of interconnected locations generated in advance to support narrative arcs, puzzles, or multi-step objectives.

- **Batch Generation**: Multiple locations and connections are created in a single pass.
- **Narrative Continuity**: Prompts are tailored to maintain thematic and biome consistency across the path.
- **Quest Metadata**: Locations and edges are tagged with quest identifiers, objectives, and progression flags.
- **Multiplayer Support**: Paths can be shared or branched based on player decisions.
- **Branching and Re-Stitching**: Alternate routes and re-entry points are supported.
- **Agent Pathing**: NPCs use the same vector topology for goals, patrols, and pursuit.

## System Interaction Overview

### See Also

- **World Rules & Lore** – Biome transitions and environmental logic that inform traversal difficulty (`world-rules-and-lore.md`).
- **AI Prompt Engineering** – How generation prompts are structured for new locations (`ai-prompt-engineering.md`).
- **Multiplayer Mechanics** – Synchronisation of player movement and shared spatial events (`multiplayer-mechanics.md`).
- **Extension Framework** – Injecting custom regions, traversal puzzles, and environmental hooks (`extension-framework.md`).
- **Economy & Trade Systems** – Future tie-ins for trade routes and resource node placement (`economy-and-trade-systems.md`).
