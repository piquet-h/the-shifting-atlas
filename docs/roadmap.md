# Roadmap (Milestone Narrative)

This roadmap is organized by **dependency-driven milestones** validated through MECE principles. Each milestone represents a natural cluster of issues with clear boundaries and handoff points, sequenced to deliver MVP incrementally.

## Milestone Overview

| Milestone                  | Objective (Why)                                          | Core Increments                                                                         | Status                            | Exit Criteria                                                                                                                                     |
| -------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M0 Foundation** ✅       | Prove deploy + minimal loop viability                    | Ping, guest GUID bootstrap, telemetry scaffold                                          | **CLOSED** 2025-10-19             | Player gets GUID & receives ping consistently                                                                                                     |
| **M1 Traversal** ✅        | Persistent movement across locations                     | Location persistence, exit model, move/look commands, direction normalization           | **CLOSED** 2025-10-30             | Player can move across ≥3 persisted locations; telemetry for move success/failure                                                                 |
| **M2 Data Foundations** ✅ | Data persistence consolidation + telemetry modernization | SQL API containers, player store cutover (ADR-004), telemetry consolidation             | **CLOSED** 2025-11-23             | Player state authoritative in SQL API (cutover complete); immutable world graph retained; telemetry events enriched & migration artifacts removed |
| **M3 Core Loop**           | Event processing + player UI + time                      | World event processing, frontend game view, command input, temporal reconciliation      | **71 issues** (4 closed, 67 open) | Events process via queue; player can navigate via web UI; telemetry shows end-to-end traces; temporal mechanics operational                       |
| **M4 AI Read**             | Safe advisory AI context only                            | MCP servers (world-query, prompt-template), prompt registry, intent parser foundations  | **32 issues** (8 closed, 24 open) | AI can query world state via MCP; prompts versioned & hashed; intent parser handles basic commands                                                |
| **M5 Quality & Depth**     | Content enrichment + observability                       | Description layering engine, layer validation, dashboards, alerts, integrity monitoring | **30 issues** (5 closed, 25 open) | Layers applied & audited; dashboards show success rates; alerts fire on anomalies                                                                 |
| **M6 Systems**             | Advanced features + episodic content                     | Dungeons, humor layer, entity promotion, Learn More page                                | **25 issues** (0 closed, 25 open) | At least one dungeon traversable; humor feedback captured; emergent entities promoted                                                             |
| **M7 Post-MVP**            | Extensibility + scale                                    | Multiplayer, quests, economy, AI write path, region sharding                            | **TBD**                           | Extensibility hooks functional; multiplayer party coordination prototype                                                                          |

## Dependency Graph (Critical Path to MVP)

The following diagram shows the critical path dependencies between milestone clusters. MVP completion requires M2 → M3 → M4 sequential delivery, while M5 and M6 can proceed in parallel after M4.

```mermaid
graph TD
    M0[M0 Foundation<br/>CLOSED ✅]
    M1[M1 Traversal<br/>CLOSED ✅]
    M2[M2 Data Foundations<br/>17 issues]
    M3[M3 Core Loop<br/>20 issues]
    M4[M4 AI Read<br/>10 issues]
    M5[M5 Quality & Depth<br/>30 issues]
    M6[M6 Systems<br/>25 issues]
    M7[M7 Post-MVP<br/>TBD]

    M0 --> M1
    M1 --> M2
    M2 --> M3
    M2 --> M5A[M5: Dashboards<br/>parallel track]
    M3 --> M4
    M4 --> M5B[M5: Layering<br/>depends on prompts]
    M4 --> M6
    M5A --> M7
    M5B --> M7
    M6 --> M7

    classDef closed fill:#2da44e,stroke:#1a7f37,color:#fff
    classDef active fill:#fb8500,stroke:#d67000,color:#fff
    classDef future fill:#6e7781,stroke:#57606a,color:#fff

    class M0,M1 closed
    class M2 active
    class M3,M4,M5,M6,M7,M5A,M5B future

    subgraph MVP["MVP = M2 + M3 + M4 (47 issues)"]
        M2
        M3
        M4
    end

    subgraph POST["Post-MVP Enhancement"]
        M5A
        M5B
        M6
        M7
    end
```

### Critical Path Analysis

**Bottleneck**: M2 Data Foundations (5 issues remaining) blocks everything downstream

-   **Duration estimate**: 2-3 weeks (most work complete)
-   **Parallelization**: Limited; remaining work is sequential (schema → repositories → migration)
-   **Risk**: Schema changes after M2 are expensive; prioritize correctness over speed

**Parallel work opportunities**:

-   M5 Dashboards can start after M2 telemetry consolidation completes
-   M6 Systems planning/design can start during M4 (no code dependencies)

**MVP Completion Path**: M2 (2-3 weeks) → M3 (5 weeks) → M4 (3 weeks) = **10-11 weeks to MVP**

## M2 Data Foundations (Current Focus)

**Status**: 54 issues (49 closed, 5 open) — 91% complete  
**Goal**: Implement dual persistence (Cosmos SQL API + Gremlin) and modernize telemetry infrastructure  
**Dependencies**: M1 Traversal (CLOSED)  
**Blocks**: M3 Core Loop (#407 World Events Timeline), M5 Dashboards (telemetry complete)  
**Focus**: Remaining issues are atomic player persistence (#517-519) and epic coordination (#69, #310)

### Critical Path Issues

**Cluster A: Dual Persistence Implementation** (5 issues) 🔨 **IN PROGRESS (3 atomic + 2 epics)**

**Player Persistence (3 atomic issues, dependency-driven sequence):**

1. #517 PlayerDoc Schema & Repository Core → Data model + CRUD (PK: `/id`)
2. #518 Player Write-Through Logic (Gremlin → SQL API) → Dual persistence sync
3. #519 Gremlin Player Vertex Feature Flag → Migration cutover control

**Epic Trackers (2 issues, umbrella only):**

-   #69 Epic: Description Telemetry & Integrity Monitoring
-   #310 Epic: Telemetry Consolidation & Event Enrichment

**Completed (49 issues):**

-   #403 ✅ World Event Documentation
-   #404-412 ✅ All SQL API containers implemented
-   #44, #77, #465 ✅ Split into atomic issues (see #517-521 M2/M4)
-   Clusters B (Telemetry), C (AI Cost), D (Dashboards), E (Integrity) — all complete

**Cluster B: Telemetry Consolidation** (11 issues) ✅ **COMPLETE (11/11)**

-   #10 ✅ Event Registry Expansion
-   #11 ✅ Gremlin RU Wrapper
-   #41 ✅ Application Insights + OTel Wiring
-   #79 ✅ Gremlin RU + Latency Telemetry
-   #311 ✅ Backend: Telemetry Consolidation → Remove obsolete tracing module
-   #312 ✅ Backend: Event Attribute Enrichment → Player/Location/Event context
-   #315 ✅ Backend: Sampling Configuration (App Insights) → Control telemetry volume
-   #316 ✅ Backend: Event Correlation (operationId + correlationId) → End-to-end tracing
-   #33 ✅ Semantic Exit Names
-   #71 ✅ Gremlin Health Check
-   #318 Backend: Domain Telemetry Event Naming (optional, deferred)

**Cluster B Issues Moved to M3:**

-   #313 Backend: Queue Message CorrelationId Injection
-   #314 Backend: Error Telemetry Normalization
-   #317 Frontend: Telemetry Correlation Headers

**Cluster C: AI Cost Telemetry** (10 issues) ✅ **COMPLETE (10/10)**

-   #50 ✅ Epic: Pre-AI Cost Framework
-   #299-309 ✅ Event registration, pricing, estimation, calculation, aggregation, guardrails, simulation, docs, tests, audit

**Cluster D: Dashboards & Alerts** (14 issues) ✅ **COMPLETE (14/14)**

-   #228-233 ✅ RESTful API Migration (6 issues)
-   #283, #289-298 ✅ Movement dashboards, Performance Ops, RU correlation, alerts, threshold tuning, workbook export

**Cluster E: Integrity Foundation** (3 issues) ✅ **COMPLETE (3/3)**

-   #69 ✅ Epic: Description Telemetry & Integrity Monitoring (umbrella)
-   #152 ✅ Description telemetry events
-   #153 ✅ Integrity hash computation

**Duplicates Closed:** #395-397 ✅ (duplicates of #154-156 in M5)

**Non-Blocking Issues Deferred to M5:**

-   #256 Relative Direction Support (N3 semantic navigation)
-   #318 Domain Telemetry Event Naming Consistency
-   #347 Account Switching Security (localStorage persistence)
-   #393 Humor Telemetry Enumeration & Emission

### Dependency Chains

```
#517 (PlayerDoc Schema) ──> #518 (Write-Through) ──> #519 (Feature Flag)
                                                   │
                                                   └──> Player migration complete

#10-#316 (Telemetry Complete) ──> M3 #313, #314, #317 (Queue/Error/Frontend) ──> M3 #422 (Frontend Telemetry)

Note: #404-412 (SQL containers) ✅ Complete — all containers provisioned
```

**Sequencing Rationale:**

-   #517 establishes PlayerDoc schema (foundation for dual persistence)
-   #518 adds write-through from Gremlin to SQL (dual writes)
-   #519 provides feature flag to toggle off Gremlin writes (migration cutover)
-   Sequential dependency: each issue builds on the previous

### Exit Criteria

-   ✅ All Cosmos SQL API containers provisioned and accessible
-   🔨 Player state migrated to SQL API (PlayerDoc schema + write-through)
-   ✅ Inventory, Layers, Events already migrated to SQL API
-   🔨 Feature flag enables migration cutover
-   ✅ Telemetry events enriched with operationId + correlationId
-   ✅ Architecture documentation updated with container schemas

### MECE Validation

-   **Mutually Exclusive**: Dual Persistence (A) vs Telemetry (B) vs AI Cost (C) vs Dashboards (D) vs Integrity (E) — no overlap
-   **Collectively Exhaustive**: Covers all mutable data entities + telemetry modernization + cost tracking + observability dashboards + integrity foundation

### Current Status Summary

-   **Complete**: Clusters B (Telemetry), C (AI Cost), D (Dashboards), E (Integrity), SQL Containers — 49 issues ✅
-   **In Progress**: Cluster A (Player Persistence) — 3 atomic issues 🔨
-   **Epic Coordination**: 2 epics remain open (#69, #310) for child issue tracking
-   **Atomicity Refactor**: Split #44, #77, #465 into atomic issues (#517-521)
-   **Deferred to M5**: 4 non-blocking issues (#256, #318, #347, #393)
-   **Duplicates**: #395-397 closed ✅

**M2 Final Sprint: Player Persistence Only**

**Estimated Time to Complete:** 2-3 weeks

-   Week 1: #517 (PlayerDoc schema + repository)
-   Week 2: #518 (write-through logic)
-   Week 3: #519 (feature flag + migration validation)

---

## M3 Core Loop

**Status**: 71 issues (4 closed, 67 open)  
**Goal**: Enable player interaction via web UI with event-driven world processing, plus temporal reconciliation  
**Dependencies**: M2 Data Foundations (Cluster A: #407 World Events Timeline)  
**Blocks**: M4 AI Read

### Critical Path Issues

**Cluster C: World Event Processing** (8 issues)

-   #101 World Event Schema → Define envelope + payload contracts
-   #102 Queue Processor Function → Azure Functions queue trigger
-   #258 World Event Type-Specific Payload Handlers → Registry/factory pattern for domain logic
-   #398 Correlation ID Injection → Ensure trace continuity
-   #399 Telemetry Constants → Centralized event names
-   #400 World Event Idempotency Tracking → Deduplication store
-   #401 World Event Dead-Letter Storage → Failure persistence
-   #402 World Event Replay Tools → Admin replay capability

**Cluster D: Frontend Player Experience** (12 issues)

-   #418 Authentication Flow (SWA Built-in Auth + GitHub) → Identity foundation
-   #413 Game View Component (Location + Exits + Status) → Main UI container
-   #414 Description Rendering with Layer Composition → Composable layers + sanitization
-   #415 Command Input with Autocomplete & Validation → Input component
-   #416 Directional Navigation UI (Exit Buttons + Shortcuts) → Visual navigation
-   #417 Player Status Panel (Health, Location, Inventory Count) → Persistent status display
-   #419 Client-Side Routing & Navigation → React Router setup
-   #422 Frontend Telemetry Integration (App Insights) → Client-side observability
-   #420 Accessibility Compliance (WCAG 2.1 AA) → _(Can defer to M5)_
-   #421 Responsive Layout (Mobile/Tablet/Desktop) → _(Can defer to M5)_
-   #423 Frontend Integration & E2E Tests (Playwright + RTL) → _(Can defer to M5)_
-   #424 Frontend Architecture Documentation → _(Can defer to M5)_

**Cluster E: World Time & Temporal Reconciliation** (10 issues from Epic #497)

-   #498 WorldClockService Implementation → Global tick advancement, query, history
-   #499 PlayerClockAPI Implementation → Advance, drift, reconcile per-player time
-   #500 LocationClockManager Implementation → Temporal anchors for reconciliation points
-   #501 ActionRegistry (Duration Tables) → Time costs for player actions
-   #502 ReconcileEngine (Wait/Slow/Compress Policies) → Timeline alignment algorithms
-   #503 NarrativeLayer Temporal Compression → "Time passes" text generation
-   #504 TemporalLedger Storage & Audit Trail → Immutable temporal event logging
-   #505 Temporal Telemetry Events Enumeration → Clock/drift/reconciliation observability
-   #506 World Time Integration Tests → Multi-player reconciliation validation

**Cluster F: Epic Coordination** (5 epics)

-   #385 Epic: World Event Processing Infrastructure (8 child issues)
-   #386 Epic: Cosmos Dual Persistence Implementation (9 child issues, 100% complete)
-   #387 Epic: MCP Server Implementation (coordination for M4)
-   #388 Epic: Prompt Template Registry (coordination for M4)
-   #389 Epic: Frontend Player Experience (coordination for Cluster D)
-   #322 Epic: Playable MVP Experience Loop (5 child issues)
-   #323 Epic: Humorous DM Interaction Layer (8 child issues)
-   #324 Epic: Emergent Entity Promotion Pipeline (10 child issues)

**Other Issues**

-   #466 Narrative Generator Server (P0, scope:mcp)
-   #240 Reconcile dual WorldEvent models (scope:core, docs)

### Dependency Chains

```
M2:#407 (Events Timeline) ──> #101 (Schema) ──> #102 (Processor) ──> #258 (Handlers)
                                                  │
                                                  └──> #398-#402 (Reliability)

M2:#404 (Player State) ──> #418 (Auth) ──> #413 (Game View) ──> #414-#417, #419 (UI Components)
                                           │
                                           └──> #422 (Telemetry)

#498 (WorldClock) ──┬──> #499 (PlayerClock) ──┬──> #502 (ReconcileEngine) ──> #503 (Narrative)
                    │                          │
                    └──> #500 (LocationClock) ─┘

#501 (ActionRegistry) ──> #499 (PlayerClock)
#504 (TemporalLedger) ── parallel with above
#505 (Temporal Telemetry) ── parallel with above
#506 (Integration Tests) ── after all temporal components
```

### Exit Criteria

-   ✅ World events process via Service Bus queue with idempotency
-   ✅ Player can authenticate via SWA GitHub identity
-   ✅ Game view renders location + exits + player status
-   ✅ Command input accepts player commands with validation
-   ✅ Frontend telemetry shows client → backend correlation
-   ✅ At least one event type (e.g., Player.Move) processes with domain logic
-   🔨 World clock advances and player clocks track action duration
-   🔨 Player timelines reconcile at location entry (wait/slow/compress policies)
-   🔨 Temporal narrative ("time passes" text) generated for drift/reconciliation
-   🔨 Temporal events logged immutably to TemporalLedger container

### MECE Validation

-   **Mutually Exclusive**: Backend event processing (Cluster C) vs Frontend UI (Cluster D) vs Temporal mechanics (Cluster E) vs Epic coordination (Cluster F)
-   **Collectively Exhaustive**: Covers event-driven architecture + player interaction surface + temporal simulation + cross-cutting epics

---

## M4 AI Read

**Status**: 32 issues (8 closed, 24 open)  
**Goal**: Enable AI to query world state and use versioned prompts (read-only)  
**Dependencies**: M2 Data Foundations (#434 needs SQL), M3 Core Loop (UI for testing)  
**Blocks**: M5 Layering (AI generation), M6 Systems (AI-driven content)

**Note**: Issue count increased due to atomicity review — #465 split into #514-516 (World Context MCP)

### Critical Path Issues

**Cluster E1: Prompt Registry** (5 issues)

-   #433 Prompt Template Schema → Define versioned template structure
-   #434 Prompt Storage (SQL API) → Store templates with version + hash
-   #435 Prompt Retrieval API → HTTP endpoint for template access
-   #436 Prompt Hashing & Integrity → Ensure reproducibility
-   #438 Prompt Cost Telemetry → Track AI model invocation costs

**Cluster E2: MCP Servers** (8 issues)

-   #514 World Context MCP Foundation → Server scaffold + routing
-   #515 Location, Player & Atmosphere Context Operations → Core context queries
-   #516 Spatial Graph & Event Timeline Operations → N-hop traversal + event history
-   #425 MCP World Query Tools → Read-only access to locations, exits, players
-   #426 MCP Prompt Template Access → Template retrieval via MCP
-   #427 MCP Telemetry Query → Recent telemetry for AI context
-   #428 MCP Authentication → Identity propagation for auditing
-   #430 MCP Integration Tests → Validate tool contracts

**Cluster E3: Intent Parser** (3 issues)

-   #462 Intent Parser PI-0: Heuristic Baseline Parser → Zero-cost regex/keyword parsing
-   #463 Intent Parser PI-1: Local LLM Enhancement → Client-side WebLLM with entity promotion
-   #464 Intent Parser PI-2: Server-Side LLM Escalation → GPT-4o for ambiguous commands

**Cluster E4: DevX & Learn More** (4 issues)

-   #452 Learn More Page Implementation → Frontend page with dynamic content
-   #453 Weekly Learn More Content Regeneration → Automated content sync
-   #454 Roadmap Embedding Component → Interactive milestone visualization
-   #455 Learn More SEO & Analytics Instrumentation → Indexing + tracking

**Cluster E5: Ambient Context** (2 issues)

-   #449 Ambient Context Registry Fallback Resolution Chain
-   #450 Ambient Registry Benchmark & Coverage Framework

**Epic Coordination** (2 epics)

-   #471 Epic: Intent Parser Phased Implementation → PI-0/PI-1/PI-2 coordination
-   #472 Epic: D&D 5e Agent Framework Foundation → Mechanics Oracle + Entity State Query

### Dependency Chains

```
M2:#403 (SQL Infra) ──> #433 (Schema) ──> #434 (Storage) ──> #435 (API) ──> #436 (Hashing)
                                                              │
                                                              └──> #438 (Cost)

M2:#517-519 (Player) ──> #514 (MCP Foundation) ──> #515 (Location/Player Ops) ──> #516 (Spatial/Events)
                                                   │
                                                   └──> #425 (World Query) ──┬──> #428 (Auth) ──> #430 (Tests)
                                                        #434 (Prompts) ───────┤
                                                        M2:#312 (Telemetry) ──┘

#462 (PI-0 Baseline) ──> #463 (PI-1 Local LLM) ──> #464 (PI-2 Escalation)

#452 (Learn More Page) ──> #453 (Weekly Regen) ──> #454 (Roadmap Embed) ──> #455 (SEO)
```

### Exit Criteria

-   ✅ Prompts stored in SQL with versioning + content hash
-   ✅ MCP world-query tool can retrieve location + exit data
-   ✅ MCP prompt-template tool can retrieve templates by ID + version
-   ✅ AI invocations tracked with cost telemetry (model, tokens, latency)
-   ✅ Authentication propagates identity through MCP calls

### MECE Validation

-   **Mutually Exclusive**: Prompt infrastructure (E1) vs MCP tools (E2) are distinct layers
-   **Collectively Exhaustive**: Covers AI context needs (world state + prompts + observability)

**MVP Complete**: After M4, player can navigate a world with AI-enhanced context (read-only)

---

## M5 Quality & Depth (Post-MVP)

**Status**: 30 issues (5 closed, 25 open)  
**Goal**: Add content enrichment via layering + comprehensive observability  
**Dependencies**: M4 AI Read (prompt registry), M2 Telemetry (enriched events)  
**Parallel Tracks**: Dashboards (depends on M2), Layering (depends on M4)

### Parallel Track A: Dashboards & Monitoring (10 issues)

_Can start after M2 Telemetry Consolidation_

-   #281-#283 Movement & Navigation Dashboards
-   #284-#286 Telemetry Catalog Updates & Deprecation
-   #289 Dashboard: RU Consumption by Operation
-   #291 Workbook: Movement Navigation Dashboard
-   #292-#295 Alerts (RU, Partition Pressure, Success Rate, Latency)
-   #297 Post-Baseline Threshold Tuning

### Parallel Track B: Description Layering (20 issues)

_Depends on M4 Prompt Registry_

**Cluster F1: Core Composer** (8 issues)

-   #65 Description Composer Core → Base + structural layer composition
-   #175 Performance Benchmark → Median latency targets
-   #176 Sentence Splitter Abstraction → Pluggable tokenization
-   #177 Composite Hash Order-Invariance Test → Deterministic hashing
-   #178 Layer Ordering Guard → Prevent duplicate provenance
-   #183 Structural Event Simulation: Dry-Run Mode → Preview tool
-   #184 Structural Event Simulation: JSON Output Flag → Automation support
-   #190 Structural Event Simulation: Help & Usage Docs → Onboarding

**Cluster F2: Validation & Quality** (5 issues)

-   #157 Core Layer Validation Rules → Required fields, max length, patterns
-   #158 Similarity & Duplicate Detection → Near-duplicate prevention
-   #159 Layer Validation Fuzz Test Suite → Edge case coverage
-   #160 Validation Config & Dry-Run Mode → Gradual rollout
-   #161 Validation Telemetry Counters → Observability

**Cluster F3: Integrity Monitoring** (3 issues)

-   #154 Integrity Cache Layer → Performance optimization
-   #155 Corruption Simulation Harness → Test infrastructure
-   #156 Integrity Anomaly Alerting → Automated detection

**Cluster F4: Ambient Context** (4 issues)

-   #162 Ambient Context Registry Core → Reusable fragments
-   #163 Ambient Context Pruning & Metrics → Lifecycle management
-   #164 Fallback Resolution Chain → Hierarchical lookup
-   #165 Ambient Registry Benchmark → Performance baseline

### Exit Criteria

-   ✅ Dashboards show movement success rate, RU consumption, latency distributions
-   ✅ Alerts fire on anomalies (RU spikes, partition pressure, success rate drops)
-   ✅ Description composer handles base + structural layers deterministically
-   ✅ Layer validation prevents duplicate/malformed layers
-   ✅ Integrity monitoring detects corruption via hash validation

---

## M6 Systems (Post-MVP)

**Status**: 25 issues (0 closed, 25 open)  
**Goal**: Advanced features (dungeons, humor, entity promotion, DevX)  
**Dependencies**: M4 AI Read (all), M5 Layering (for entity promotion)

### Feature Clusters

**Cluster G: Dungeon Runs** (8 issues from Epic #219)

-   #220 Dungeon Template Vertex Metadata & Tagging
-   #221 Dungeon Run Instance Document Schema (SQL)
-   #222 Dungeon Lifecycle Event Types
-   #223 Entrance Detection & Instance Bootstrap
-   #224 In-Dungeon Movement State Overlay
-   #225 Exit Handling & Run Finalization
-   #226 Dungeon Run Telemetry Constants
-   #227 Instance TTL & Cleanup Policy

**Cluster H: Humor Layer** (7 issues from Epic #323)

-   #328 Humor Telemetry Enumeration
-   #329 Player Humor Feedback Endpoint
-   #330-#335 Humor generation, contextual extraction, reaction capture

**Cluster I: Entity Promotion** (8 issues from Epic #324)

-   #337-#344 Emergent entity detection, latent candidate tracking, promotion pipeline

**Cluster J: DevX & Documentation** (4 issues from Epic #52)

-   #171 Learn More Page Implementation
-   #172 Weekly Learn More Content Regeneration
-   #173 Roadmap Embedding Component
-   #174 Learn More SEO & Analytics

### Exit Criteria

-   ✅ At least one dungeon template traversable with instance state
-   ✅ Humor feedback captured and associated with content
-   ✅ Emergent entities detected and promoted to canonical
-   ✅ Learn More page deployed with automated updates

---

## M7 Post-MVP Extensibility

**Status**: 0 issues (planning)  
**Goal**: Multiplayer, quests, economy, AI write path  
**Dependencies**: M5 + M6 complete

### Planned Tracks

-   Multiplayer synchronization & party state
-   Quest & dialogue branching engine
-   Economy pricing dynamics + trade routes
-   AI proposal validation & mutation gates (write path)
-   Region sharding (partition evolution) per ADR-002 signals

## Prioritization Principles

1. **Critical Path First**: M2 (Data) → M3 (Loop) → M4 (AI) represents MVP; prioritize unblocking downstream work
2. **Risk Reduction Early**: Schema changes (M2) are expensive later; validate partition strategy before enrichment
3. **Parallel Where Possible**: M5 Dashboards can start after M2; M6 planning can start during M4
4. **Read Before Write**: AI read-only (M4) before any world mutation (M7)
5. **Observability Throughout**: Telemetry instrumentation in every milestone

## MECE Validation Summary

Each milestone passes MECE tests:

-   **M2**: Data persistence (SQL) vs Telemetry (enrichment) — no overlap
-   **M3**: Backend processing (events) vs Frontend UI — clean boundary
-   **M4**: Prompt infrastructure vs MCP tools — distinct layers
-   **M5**: Dashboards (parallel track A) vs Layering (parallel track B) — independent
-   **M6**: Feature epics remain separate (dungeons, humor, promotion, DevX)

## Change Process

Material roadmap shifts require updating: this file + affected ADR cross-links. Milestone assignments are the source of truth; see GitHub issues filtered by milestone for detailed dependencies.

Use GitHub REST API to manage milestone assignments and issue dependencies (MCP does not support milestones).

---

**Last updated**: 2025-11-14 (Atomicity review complete: M2 status: 54 issues, 49 closed, 5 open [91%]; M4 status: 32 issues, 8 closed, 24 open; Issues #44, #77, #465 split into atomic issues #514-521; M3 status: 71 issues, 4 closed, 67 open; World Time framework (#497-506) assigned to M3; All epics properly tracked)
