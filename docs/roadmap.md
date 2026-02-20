# Roadmap (Milestone Narrative)

This roadmap is organized by **dependency-driven milestones** validated through MECE principles. Each milestone represents a natural cluster of issues with clear boundaries and handoff points, sequenced to deliver MVP incrementally.

## Milestone Overview

| Milestone                                   | Objective (Why)                                          | Core Increments                                                                                                                                                                       | Status                            | Exit Criteria                                                                                                                                     |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 Foundation** ✅                        | Prove deploy + minimal loop viability                    | Ping, guest GUID bootstrap, telemetry scaffold                                                                                                                                        | **CLOSED** 2025-10-19             | Player gets GUID & receives ping consistently                                                                                                     |
| **M1 Traversal** ✅                         | Persistent movement across locations                     | Location persistence, exit model, move/look commands, direction normalization                                                                                                         | **CLOSED** 2025-10-30             | Player can move across ≥3 persisted locations; telemetry for move success/failure                                                                 |
| **M2 Data Foundations** ✅                  | Data persistence consolidation + telemetry modernization | SQL API containers, player store cutover (ADR-004), telemetry consolidation                                                                                                           | **CLOSED** 2025-11-23             | Player state authoritative in SQL API (cutover complete); immutable world graph retained; telemetry events enriched & migration artifacts removed |
| **M3 Core Loop (Umbrella)**                 | Event processing + player UI + time                      | Split into M3a/M3b/M3c slices (see below)                                                                                                                                             | **Split** (see slices)            | Events process via queue; player can navigate via web UI; telemetry shows end-to-end traces; temporal mechanics operational                       |
| **M3a Event Backbone**                      | Queue + contracts + reliability                          | Event schema, processor, idempotency, DLQ, telemetry                                                                                                                                  | **CLOSED** 2025-11-30             | Queue processor, idempotency, DLQ/replay, correlated telemetry                                                                                    |
| **M3b Player UI & Telemetry**               | SWA auth, game view, navigation, telemetry               | Auth, game view, command input, nav UI, routing, telemetry, UI tests/docs                                                                                                             | **CLOSED** 2025-12-11             | Player can log in, see location/exits/status, navigate; frontend↔backend telemetry correlated                                                     |
| **M3c Temporal PI-0**                       | World time fundamentals                                  | WorldClock, PlayerClock, LocationClock, durations, reconcile policies, ledger, tests                                                                                                  | **CLOSED** (see GitHub milestone) | Temporal clocks advance; reconcile policies applied; ledger + telemetry; integration tests                                                        |
| **M4a: AI Infrastructure (Sense + Decide)** | Safe advisory AI context + shadow decisions              | WorldContext-\* (MCP read-only). Prompt templates, prompt registry, and telemetry live in `shared/` and backend helper endpoints; intent parser foundations                           | **CLOSED** (see GitHub milestone) | AI can query world state via MCP; prompts versioned & hashed; intent parser emits _shadow_ event-classification/proposals telemetry               |
| **M4b: World Generation**                   | World enrichment that persists safely                    | Batch generation events, narrative generation server, persistence of generated description layers (bounded + validated), hero prose cache on first look (bounded blocking + fallback) | See GitHub milestone              | At least one world generation loop persists validated layers and is observable/replayable                                                         |
| **M4c: Agent Sandbox (Write-lite)**         | First agentic loops with strict gates                    | Constrained agent runtime (queue-only). Proposal → validate → apply pattern. Allow-listed world effects + promotion pipeline hooks                                                    | See GitHub milestone              | At least one autonomous agent can act safely (bounded write scope), with replayability and observability                                          |
| **M5 Quality & Depth**                      | Content enrichment + observability                       | Description layering engine, layer validation, dashboards, alerts, integrity monitoring                                                                                               | See GitHub milestone              | Layers applied & audited; dashboards show success rates; alerts fire on anomalies                                                                 |
| **M6 Systems**                              | Advanced features + episodic content                     | Dungeons, humor layer, entity promotion, Learn More page                                                                                                                              | See GitHub milestone              | At least one dungeon traversable; humor feedback captured; emergent entities promoted                                                             |
| **M7 Post-MVP Extensibility**               | Extensibility + scale                                    | Multiplayer, quests, economy, AI write path, region sharding                                                                                                                          | See GitHub milestone              | Extensibility hooks functional; multiplayer party coordination prototype                                                                          |

> Milestone assignments are the source of truth. Do not hard-code issue counts or statuses in documentation — query GitHub Milestones or the repository milestone view for current values. `M3 Core Loop` is an **umbrella**; use **M3a/M3b/M3c** for slices. Milestone `M7 Dungeon Runs` has been deprecated; use `M6 Systems` for dungeon work and `M7 Post-MVP Extensibility` for post-MVP items.

## Milestone description format (delivery order)

GitHub milestone descriptions are treated as a **single concise source of truth** for delivery sequencing, using `## Delivery slices` and per-slice `Order:` lists.

GitHub does **not** have a native “milestone template” feature; we enforce the format via repo automation and a small backfill script.

Reference template: `examples/milestone-description-template.md`

## Dependency Graph (Critical Path to MVP)

The following diagram shows the critical path dependencies between milestone clusters. MVP completion requires M2 → M3 → M4 sequential delivery, while M5 and M6 can proceed in parallel after M4.

```mermaid
graph TD
    M0[M0 Foundation<br/>CLOSED ✅]
    M1[M1 Traversal<br/>CLOSED ✅]
    M2[M2 Data Foundations<br/>CLOSED]
    M3[M3 Core Loop<br/>Closed via slices]
    M3a[M3a Event Backbone]
    M3b[M3b Player UI & Telemetry]
    M3c[M3c Temporal PI-0<br/>CLOSED]
    M4a[M4a: AI Infrastructure<br/>CLOSED]
    M4b[M4b: World Generation]
    M4c[M4c: Agent Sandbox (Write-lite)]
    M5[M5 Quality & Depth]
    M6[M6 Systems]
    M7[M7 Post-MVP Extensibility]

    M0 --> M1
    M1 --> M2
    M2 --> M3
    M3 --> M3a
    M3 --> M3b
    M3 --> M3c
    M2 --> M5A[M5: Dashboards<br/>parallel track]
    M3 --> M4a
    M4a --> M4b
    M4a --> M4c
    M4b --> M5B[M5: Layering<br/>depends on prompts]
    M4c --> M6
    M5A --> M7
    M5B --> M7
    M6 --> M7

    classDef closed fill:#2da44e,stroke:#1a7f37,color:#fff
    classDef active fill:#fb8500,stroke:#d67000,color:#fff
    classDef future fill:#6e7781,stroke:#57606a,color:#fff

    class M0,M1,M2,M3,M3a,M3b,M3c,M4a closed
    class M4b,M4c,M5,M6,M7,M5A,M5B future

    subgraph MVP["MVP = M2 + M3 + M4a"]
        M2
        M3
        M4a
    end

    subgraph POST["Post-MVP Enhancement"]
        M5A
        M5B
        M6
        M7
    end

    subgraph AGENTS["Immersive MCP + Agents"]
        M4a
        M4c
    end
```

### Critical Path Analysis

**Bottleneck (resolved)**: **M3a Event Backbone** — completed 2025-11-30.

- **Risk**: Event schema churn and telemetry correlation gaps; prioritize contract tests and correlation propagation.

**Parallel work opportunities**:

- M5 Dashboards can start after M2 telemetry consolidation completes
- M6 Systems planning/design can start during M4 (no code dependencies)

**Agentic Validation Path (recommended)**: M4a → M4c provides the earliest point where you can observe a closed-loop agent behavior (sense → decide → act → observe) with strict safety gates.

## M2 Data Foundations (Closed)

**Status**: CLOSED (see GitHub Milestone view)

**What this milestone established (stable takeaway)**:

- SQL API is authoritative for player state (ADR-004) and related mutable documents.
- Telemetry correlation and event backbone foundations exist.

**Source of truth** for exact issue membership/status is GitHub Milestones; this doc intentionally avoids hard-coded issue lists, counts, and “current sprint” narratives.

---

## M3 Core Loop

**Status**: See GitHub milestone

**Stable outcome (why M3 exists)**: a player can authenticate, issue commands, and receive fast (<500ms) deterministic results while shared world evolution runs asynchronously via the queue/event backbone.

**Exit criteria (high signal)**:

- ✅ World events process via Service Bus queue with idempotency
- ✅ Game UI shows location + exits + player status; command input works
- ✅ Frontend↔backend telemetry correlation is visible end-to-end

**Note on temporal mechanics (M3c)**: time can improve immersion, but it is not required to prove the agentic loop. Treat M3c as “world coherence depth,” not a prerequisite for the first playable agentic MVP.

References:

- `docs/architecture/world-event-contract.md`
- `docs/architecture/overview.md`
- GitHub Milestone: M3 Core Loop / M3c

---

## Milestone details live in GitHub (anti-drift rule)

From this point onward, treat this doc as a **milestone narrative and dependency map**. Use GitHub Milestones for the live, authoritative issue list.

Recommended workflow:

- If you need “what is implemented today?” → read `docs/architecture/overview.md`.
- If you need “what are we doing next?” → open the relevant GitHub Milestone.
- If you need “how does the agentic loop work?” → read `docs/architecture/agentic-ai-and-mcp.md` and `docs/workflows/foundry/resolve-player-command.md`.

## M4a: AI Infrastructure (Sense + Decide)

**Status**: See GitHub milestone

**Playable agentic MVP definition (MVP-first)**:

- A “DM narrator” (hosted agent runtime) can **read** world/player context via **read-only MCP tools** (`WorldContext-*`, `Lore-*`).
- The narrator returns player-facing text that is consistent with canonical state.
- The core loop remains playable even if narration is degraded (timeouts, throttling) — deterministic handlers still return correct state.

**Northstar definition (after MVP)**:

- Agents can run **closed loops** in the background (sense → decide → propose → validate → apply) via queue-only write-lite/proposal events (see M4c).

References:

- `docs/architecture/agentic-ai-and-mcp.md`
- `docs/workflows/foundry/resolve-player-command.md`
- `backend/src/mcp/` (source of truth for registered tool names)

Notes:

- Intent parsing beyond trivial heuristics is treated as post-MVP unless it is strictly required for an immersive loop.
- Ambient context enrichment and dashboards can parallelize after the read-only tool surface is stable.
- D&D 5e specialization work should land only after the core “read → narrate → (optionally) propose” loop is proven.

---

## M4c: Agent Sandbox (Write-lite)

**Status**: See GitHub milestone

**Goal**: Introduce the first **autonomous agent loops** that can safely create emergent behavior by acting on the world through strict, observable gates.

**Design constraint**: This milestone does **not** introduce a full “AI write path” for arbitrary mutations. It introduces a **bounded write scope** with allow-listed actions, validators, and replay.

**Core idea**: **Proposal → Validate → Apply**

- **Proposal**: Agents generate _proposed_ world effects (events, layers, NPC steps) using MCP for context.
- **Validate**: Deterministic code validates proposals against invariants (schema, safety rules, scope rules).
- **Apply**: Only validated proposals are applied (typically via queue processing). Invalid proposals are stored for analysis, not executed.

### Candidate Clusters (high-level)

**Cluster S1: Agent Runtime (Queue-only)**

- A minimal queue-driven “agent step” event type (NPC/world steward) that can run repeatedly without blocking any HTTP handler.
- Agents use MCP tools to fetch context (world/query, prompts, telemetry summaries) and emit proposed actions.

**Cluster S2: Proposal Governance & Replay**

- Proposal envelope + validators (allow-list actions, bounded parameters, idempotency keys)
- Replay tooling to reproduce an emergent incident from stored proposals + event logs

**Cluster S3: First Emergent Loop (MVP)**

- At least one autonomous agent that performs a safe behavior loop (e.g., roaming NPC, caretaker agent that adjusts ambience layers, simple rumor propagation).

### Exit Criteria

- ✅ At least one autonomous agent loop runs end-to-end: **sense → decide → act → observe**
- ✅ Agent actions are limited to an allow-listed, validated mutation scope (no arbitrary writes)
- ✅ Every agent decision and action is observable (correlationId/causationId, cost, latency)
- ✅ Replay can reproduce an agent run from stored proposals and event logs
- ✅ Failure modes are safe: invalid proposals are rejected + stored; processing is idempotent; DLQ path exists

### MECE Validation

- **Mutually Exclusive**: Prompt infrastructure (E1) vs MCP tools (E2) are distinct layers
- **Collectively Exhaustive**: Covers AI context needs (world state + prompts + observability)

**MVP Complete**: After M4, player can navigate a world with AI-enhanced context (read-only)

---

## Hero narration evolution map (agentic alignment)

Purpose: evolve current hero-prose generation into full narrator-orchestrated agentic behavior without violating the authority boundary (deterministic canon first, narration second).

This map is intentionally milestone + issue anchored; use linked issues as the live source of truth for status/details.

| Phase                                          | Milestone anchor               | Evolution step                                                                                                            | Primary issue anchors                                |
| ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **P0 – Bounded hero prose (current baseline)** | M4b World Generation           | Keep first-look hero prose as bounded, cache-first enrichment on perception actions only                                  | #822 (epic), #823 (telemetry constants), #829, #830  |
| **P1 – Narrator runtime + proposal contracts** | M4c Agent Sandbox (Write-lite) | Shift from single-service prose generation toward narrator-driven sense→decide→propose loop with validation gates         | #700 (epic), #701, #703, #705, #762, #763, #764      |
| **P2 – Unified scene synthesis layer**         | M5b Layering                   | Merge hero-prose, ambient layers, and narrative synthesis behind explicit latency contracts and deterministic composition | #765 (epic), #767, #768, #769, #442, #443, #445      |
| **P3 – External narrator boundary hardening**  | M5a Observability + M6c DevX   | Enforce gateway-first auth/quotas and operational runbooks for external narrator callers                                  | #774, #428, #429, #427, #707, #708, #709, #710, #711 |
| **P4 – Post-MVP specialization**               | M7 Post-MVP Extensibility      | Add deeper retrieval + parser sophistication while preserving Proposal→Validate→Apply                                     | #471 (epic), #462, #463, #464, #727                  |

### Drift guardrails for this map

- Hero prose remains a **narration layer**, not a canonical mutation path.
- Any autonomous write path must stay behind **Proposal → Validate → Apply**.
- Narrator/bestiary/specialists may explain outcomes, but canonical state stays deterministic and validator-enforced.
- Keep timeout/latency behavior anchored to code (`locationLook.ts`, `heroProseGenerator.ts`) rather than duplicating constants across docs.

---

## M5 Quality & Depth (Post-MVP)

**Status**: See GitHub milestone
**Goal**: Add content enrichment via layering + comprehensive observability  
**Dependencies**: M4 AI Read (prompt registry), M2 Telemetry (enriched events)  
**Parallel Tracks**: Dashboards (depends on M2), Layering (depends on M4)

### Parallel Track A: Dashboards & Monitoring

_Can start after M2 Telemetry Consolidation_

- #281-#283 Movement & Navigation Dashboards
- #284-#286 Telemetry Catalog Updates & Deprecation
- #289 Dashboard: RU Consumption by Operation
- #291 Workbook: Movement Navigation Dashboard
- #292-#295 Alerts (RU, Partition Pressure, Success Rate, Latency)
- #297 Post-Baseline Threshold Tuning

### Parallel Track B: Description Layering

_Depends on M4 Prompt Registry_

**Cluster F1: Core Composer**

- #65 Description Composer Core → Base + structural layer composition
- #175 Performance Benchmark → Median latency targets
- #176 Sentence Splitter Abstraction → Pluggable tokenization
- #177 Composite Hash Order-Invariance Test → Deterministic hashing
- #178 Layer Ordering Guard → Prevent duplicate provenance
- #183 Structural Event Simulation: Dry-Run Mode → Preview tool
- #184 Structural Event Simulation: JSON Output Flag → Automation support
- #190 Structural Event Simulation: Help & Usage Docs → Onboarding

**Cluster F2: Validation & Quality**

- #157 Core Layer Validation Rules → Required fields, max length, patterns
- #158 Similarity & Duplicate Detection → Near-duplicate prevention
- #159 Layer Validation Fuzz Test Suite → Edge case coverage
- #160 Validation Config & Dry-Run Mode → Gradual rollout
- #161 Validation Telemetry Counters → Observability

**Cluster F3: Integrity Monitoring**

- #154 Integrity Cache Layer → Performance optimization
- #155 Corruption Simulation Harness → Test infrastructure
- #156 Integrity Anomaly Alerting → Automated detection

**Cluster F4: Ambient Context**

- #162 Ambient Context Registry Core → Reusable fragments
- #163 Ambient Context Pruning & Metrics → Lifecycle management
- #164 Fallback Resolution Chain → Hierarchical lookup
- #165 Ambient Registry Benchmark → Performance baseline

### Exit Criteria

- ✅ Dashboards show movement success rate, RU consumption, latency distributions
- ✅ Alerts fire on anomalies (RU spikes, partition pressure, success rate drops)
- ✅ Description composer handles base + structural layers deterministically
- ✅ Layer validation prevents duplicate/malformed layers
- ✅ Integrity monitoring detects corruption via hash validation

---

## M6 Systems (Post-MVP)

**Status**: See GitHub milestone
**Goal**: Advanced features (dungeons, humor, entity promotion, DevX)  
**Dependencies**: M4 AI Read (all), M5 Layering (for entity promotion)

### Feature Clusters

**Cluster G: Dungeon Runs**

- #220 Dungeon Template Vertex Metadata & Tagging
- #221 Dungeon Run Instance Document Schema (SQL)
- #222 Dungeon Lifecycle Event Types
- #223 Entrance Detection & Instance Bootstrap
- #224 In-Dungeon Movement State Overlay
- #225 Exit Handling & Run Finalization
- #226 Dungeon Run Telemetry Constants
- #227 Instance TTL & Cleanup Policy

**Cluster H: Humor Layer**

- #328 Humor Telemetry Enumeration
- #329 Player Humor Feedback Endpoint
- #330-#335 Humor generation, contextual extraction, reaction capture

**Cluster I: Entity Promotion**

- #337-#344 Emergent entity detection, latent candidate tracking, promotion pipeline

**Cluster J: DevX & Documentation**

- #452 Learn More Page Implementation (moved from M4a)
- #453 Weekly Learn More Content Regeneration (moved from M4a)
- #454 Roadmap Embedding Component (moved from M4a)
- #455 Learn More SEO & Analytics Instrumentation (moved from M4a)

_Epic #52 (Learn More Page & Automated Content) coordinates these issues._

### Exit Criteria

- ✅ At least one dungeon template traversable with instance state
- ✅ Humor feedback captured and associated with content
- ✅ Emergent entities detected and promoted to canonical
- ✅ Learn More page deployed with automated updates

---

## M7 Post-MVP Extensibility

**Status**: See GitHub milestone  
**Goal**: Multiplayer, quests, economy, AI write path, advanced player interaction  
**Dependencies**: M5 + M6 complete

### Planned Tracks

**Intent Parser (Progressive Enhancement)**

- #462 Intent Parser PI-0: Heuristic Baseline Parser → Zero-cost regex/keyword parsing
- #463 Intent Parser PI-1: Local LLM Enhancement → Client-side WebLLM with entity promotion
- #464 Intent Parser PI-2: Server-Side LLM Escalation → GPT-4o for ambiguous commands
- #471 Epic: Intent Parser Phased Implementation → PI-0/PI-1/PI-2 coordination

**Multiplayer & Social**

- Multiplayer synchronization & party state
- Quest & dialogue branching engine

**Economy & Systems**

- Economy pricing dynamics + trade routes
- Region sharding (partition evolution) per ADR-002 signals

**AI Write Path**

- AI proposal validation & mutation gates (full write path beyond M4c sandbox)

## Prioritization Principles

1. **Critical Path First**: M2 (Data) → M3 (Loop) → M4 (AI) represents MVP; prioritize unblocking downstream work
2. **Risk Reduction Early**: Schema changes (M2) are expensive later; validate partition strategy before enrichment
3. **Parallel Where Possible**: M5 Dashboards can start after M2; M6 planning can start during M4
4. **Read Before Write**: AI read-only (M4) before any world mutation (M7)
5. **Observability Throughout**: Telemetry instrumentation in every milestone

## MECE Validation Summary

Each milestone passes MECE tests:

- **M2**: Data persistence (SQL) vs Telemetry (enrichment) — no overlap
- **M3**: Backend processing (events) vs Frontend UI — clean boundary
- **M4**: Prompt infrastructure vs MCP tools — distinct layers
- **M5**: Dashboards (parallel track A) vs Layering (parallel track B) — independent
- **M6**: Feature epics remain separate (dungeons, humor, promotion, DevX)

## Change Process

Material roadmap shifts require updating: this file + affected ADR cross-links. Milestone assignments are the source of truth; see GitHub issues filtered by milestone for detailed dependencies.

Use GitHub REST API to manage milestone assignments and issue dependencies (MCP does not support milestones).

---

**Last updated**: 2026-01-05
