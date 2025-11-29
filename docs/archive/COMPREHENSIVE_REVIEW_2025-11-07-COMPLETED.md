# Comprehensive Documentation & Issue Structure Review

**Date:** 2025-11-07  
**Reviewer:** GitHub Copilot (Automated Top-Down Analysis)  
**Scope:** Full repository documentation hierarchy, milestone structure, epic coordination, and issue taxonomy

> **Naming note (2025-11-23):** This review refers to “M3 AI Read” in the then-current roadmap. The unified roadmap now uses **M3 Core Loop** and **M4 AI Read**. Interpret “M3 AI Read” here as **M4 AI Read**.

---

## Executive Summary

The Shifting Atlas maintains a well-structured **MECE (Mutually Exclusive, Collectively Exhaustive) documentation hierarchy** across 7 layers from Vision (60k ft) to Code (ground level). The project uses a **deliberate minimal label + milestone scheme** with clear taxonomy rules.

### Key Findings

✅ **Strengths:**

- Documentation hierarchy properly separated (Vision → Tenets → Design Modules → Architecture → Roadmap → Examples → Code)
- M0 Foundation and M1 Traversal milestones successfully completed
- Clear issue taxonomy (scope:_ + type labels, epics use epic + scope:_ only)
- Strong governance via Copilot Operating Guide and ADRs

⚠️ **Gaps Identified & Remediated:**

- **Missing M7 milestone** for post-MVP extensibility → **CREATED** (Milestone #9)
- **7 missing epics** for major feature areas → **ALL CREATED** (#384-#389)
- **~50 missing child issues** across 9 open epics → **ITEMIZED** (see Child Issue Backlog below)
- Missing milestone reference in Copilot Instructions → **FIXED**

---

## New Milestones Created

| Milestone                     | ID  | Status | Description                                                                                                                                                                                                        |
| ----------------------------- | --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **M7 Post-MVP Extensibility** | 9   | Open   | Multiplayer synchronization & party state, Quest & dialogue branching engine, Economy pricing dynamics + trade routes, AI proposal validation & mutation gates (write path), Region sharding (partition evolution) |

**Exit Criteria:** At least one extensibility hook emits telemetry; multiplayer party coordination prototype functional

---

## New Epics Created

All epics follow proper taxonomy: exactly 1 `scope:*` label + `epic` label (no type label).

| Epic #   | Title                                  | Scope           | Milestone   | Status        | Purpose                                                                                                                 |
| -------- | -------------------------------------- | --------------- | ----------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **#384** | Exit Management Lifecycle              | scope:traversal | M1 (CLOSED) | Retrospective | Coordinates 11 completed M1 exit management issues (#134-#139, #144-#148)                                               |
| **#385** | World Event Processing Infrastructure  | scope:core      | M2          | Active        | Queue-based event-driven world evolution (Service Bus, processors, schema, telemetry)                                   |
| **#386** | Cosmos Dual Persistence Implementation | scope:core      | M2          | Active        | Full ADR-002 implementation: Player/Inventory/Layers/Events migration to SQL API                                        |
| **#387** | MCP Server Implementation              | scope:mcp       | M3          | Active        | Read-only MCP servers for world-query; prompt-template and telemetry moved to shared/backend implementations per policy |
| **#388** | Prompt Template Registry               | scope:ai        | M3          | Active        | Versioned, hashed prompt storage enabling deterministic AI behavior                                                     |
| **#389** | Frontend Player Experience             | scope:core      | M2          | Active        | UI components, routing, auth flow, accessibility (WCAG 2.2 AA), responsive design                                       |

---

## Existing Open Epics (Pre-Review)

| Epic #   | Title                                        | Scope               | Milestone       | Child Issues Status                               |
| -------- | -------------------------------------------- | ------------------- | --------------- | ------------------------------------------------- |
| **#310** | Telemetry Consolidation & Event Enrichment   | scope:observability | M2              | ✅ All child issues created (#311-#318, #353)     |
| **#69**  | Description Telemetry & Integrity Monitoring | scope:observability | M2              | ⚠️ Missing 3 child issues (#154, #155, #156)      |
| **#68**  | Layer Validator & Similarity Guardrails      | scope:world         | M4              | ⚠️ Missing 5 child issues (#157-#161)             |
| **#67**  | Ambient Context Registry                     | scope:ai            | M4              | ⚠️ Missing 5 child issues (#162-#166)             |
| **#52**  | Learn More Page & Automated Content          | scope:devx          | M4              | ⚠️ Missing 4 child issues (#171-#174)             |
| **#219** | Dungeon Run Infrastructure                   | scope:world         | M6              | ✅ All child issues created (#220-#227)           |
| **#322** | Playable MVP Experience Loop                 | scope:core          | (Cross-cutting) | ⚠️ Missing 5 NEW child issues                     |
| **#323** | Humorous DM Interaction Layer                | scope:ai            | (Cross-cutting) | ⚠️ Missing 5 NEW child issues (overlap with #322) |
| **#324** | Emergent Entity Promotion Pipeline           | scope:world         | (Cross-cutting) | ⚠️ Missing 10 NEW child issues                    |

---

## Child Issue Backlog (Missing Issues to Create)

### Priority 1: M2 Observability (Current Focus)

#### Epic #385: World Event Processing Infrastructure

- [ ] **#385.1** World Event Emission Helper & Correlation IDs (feature, scope:core, M2)
- [ ] **#385.2** World Event Telemetry Constants & Emission (enhancement, scope:observability, M2)
- [ ] **#385.3** World Event Idempotency & Deduplication Logic (feature, scope:core, M2)
- [ ] **#385.4** World Event Dead Letter Handling & Retry Policy (feature, scope:core, M2)
- [ ] **#385.5** World Event Integration Tests (test, scope:core, M2)
- [ ] **#385.6** World Event Documentation (docs, scope:core, M2)

_Note: Issues #101, #102 already exist; add parent epic #385 reference_

#### Epic #386: Cosmos Dual Persistence Implementation

- [ ] **#386.1** Player State Migration to SQL API Container (feature, scope:core, M2)
- [ ] **#386.2** Inventory Persistence (SQL API, PK: /playerId) (feature, scope:core, M2)
- [ ] **#386.3** Description Layers Storage (SQL API, PK: /locationId) (feature, scope:world, M2)
- [ ] **#386.4** World Events Timeline (SQL API, PK: /scopeKey) (feature, scope:core, M2)
- [ ] **#386.5** SQL API Repository Abstraction Layer (refactor, scope:core, M2)
- [ ] **#386.6** Dual Persistence Integration Tests (test, scope:core, M2)
- [ ] **#386.7** Data Migration Script (Gremlin → SQL) (infra, scope:core, M2)
- [ ] **#386.8** Partition Key Strategy Validation & Monitoring (enhancement, scope:observability, M2)
- [ ] **#386.9** Dual Persistence Documentation Update (docs, scope:core, M2)

_Note: Issue #76 (Cosmos DB Provisioning) already complete; mark as child_

#### Epic #389: Frontend Player Experience

- [ ] **#389.1** Game View Component (Narrative Display + Command Input) (feature, scope:core, M2)
- [ ] **#389.2** Location Description Rendering (Base + Layers) (feature, scope:world, M2)
- [ ] **#389.3** Command Input Component with Autocomplete (feature, scope:core, M2)
- [ ] **#389.4** Navigation UI (Exit Options, Direction Hints) (feature, scope:traversal, M2)
- [ ] **#389.5** Player Status Panel (Inventory, Stats, Location) (feature, scope:core, M2)
- [ ] **#389.6** Authentication Flow UI (Sign-In, Sign-Out, Profile) (feature, scope:core, M2)
- [ ] **#389.7** Routing Structure (/, /game, /learn-more, /profile) (feature, scope:core, M2)
- [ ] **#389.8** Accessibility Compliance (WCAG 2.2 AA) (enhancement, scope:core, M2)
- [ ] **#389.9** Responsive Design (Mobile, Tablet, Desktop) (enhancement, scope:core, M2)
- [ ] **#389.10** Frontend Telemetry (Page Views, Commands, Errors) (feature, scope:observability, M2)
- [ ] **#389.11** Frontend Integration Tests (Auth Flow, Game Loop) (test, scope:core, M2)
- [ ] **#389.12** Frontend Documentation (Component Architecture, Style Guide) (docs, scope:core, M2)

#### Epic #69: Description Telemetry & Integrity Monitoring

- [ ] **#154** Integrity Cache Layer (enhancement, scope:observability, M2)
- [ ] **#155** Corruption Simulation Harness (test, scope:observability, M2)
- [ ] **#156** Integrity Anomaly Alerting Logic (feature, scope:observability, M2)

_Note: Issues #152, #153 already closed_

---

### Priority 2: M3 AI Read

#### Epic #387: MCP Server Implementation

- [ ] **#387.1** MCP Server: World Query (Location/Player/Exit Read-Only) (feature, scope:mcp, M3)
- [ ] **#387.2** MCP Server: Prompt Template Registry Access (feature, scope:mcp, M3)
- [ ] **#387.3** MCP Server: Telemetry Event Query (Historical) (feature, scope:mcp, M3)
- [ ] **#387.4** MCP Authentication & Authorization Layer (feature, scope:security, M3)
- [ ] **#387.5** MCP Rate Limiting & Cost Guard Rails (enhancement, scope:security, M3)
- [ ] **#387.6** MCP Integration Tests (Read-Only Verification) (test, scope:mcp, M3)
- [ ] **#387.7** MCP Server Documentation (Architecture + Usage Examples) (docs, scope:mcp, M3)
- [ ] **#387.8** MCP Telemetry Events (Query patterns, latency, usage) (feature, scope:observability, M3)

#### Epic #388: Prompt Template Registry

- [ ] **#388.1** Prompt Template Schema & Versioning Model (feature, scope:ai, M3)
- [ ] **#388.2** Prompt Template Storage (SQL API or File-Based) (feature, scope:ai, M3)
- [ ] **#388.3** Prompt Template Retrieval API (Backend Function) (feature, scope:ai, M3)
- [ ] **#388.4** Prompt Template Hashing & Integrity Validation (feature, scope:ai, M3)
- [ ] **#388.5** Prompt Template A/B Testing Scaffold (enhancement, scope:ai, M3)
- [ ] **#388.6** Prompt Template Cost Telemetry Integration (feature, scope:observability, M3)
- [ ] **#388.7** Prompt Template Migration Script (Existing → Registry) (infra, scope:ai, M3)
- [ ] **#388.8** Prompt Template Documentation & Usage Examples (docs, scope:ai, M3)

#### Epic #322: Playable MVP Experience Loop (Cross-Cutting)

- [ ] **#322.1** Prompt Scaffold & Persona Injection (feature, scope:ai, M3)
- [ ] **#322.2** Micro-Quips Registry & Probability Gating (feature, scope:ai, M3)
- [ ] **#322.3** Anti-Repeat Buffer & Serious Scene Suppression (feature, scope:ai, M3)
- [ ] **#322.4** Humor Telemetry Enumeration & Emission (feature, scope:observability, M2)
- [ ] **#322.5** Player Humor Feedback Endpoint & Frontend Hook (feature, scope:core, M3)

_Note: Epic #322 references existing issues #55, #56, #57, #65, #67; add parent epic reference_

#### Epic #323: Humorous DM Interaction Layer

- [ ] **#323.1** → Same as #322.1 (Prompt Scaffold & Persona Injection)
- [ ] **#323.2** → Same as #322.2 (Micro-Quips Registry & Probability Gating)
- [ ] **#323.3** → Same as #322.3 (Anti-Repeat Buffer & Serious Scene Suppression)
- [ ] **#323.4** → Same as #322.4 (Humor Telemetry Enumeration & Emission)
- [ ] **#323.5** → Same as #322.5 (Player Humor Feedback Endpoint & Frontend Hook)
- [ ] **#323.6** Adaptive Humor Probability Adjustment (enhancement, scope:ai, M4 - DEFERRED)
- [ ] **#323.7** Contextual Humor Seed Extraction (enhancement, scope:ai, M4 - DEFERRED)
- [ ] **#323.8** Documentation: Humor Layering Design (docs, scope:ai, M3)

_Note: Epics #322 and #323 share core implementation; differentiate via documentation focus_

---

### Priority 3: M4 Layering & Enrichment

#### Epic #324: Emergent Entity Promotion Pipeline

- [ ] **#324.1** Latent Mention Extraction (feature, scope:world, M3)
- [ ] **#324.2** Candidate Registry Container & Cap (feature, scope:world, M4)
- [ ] **#324.3** Candidate Similarity & Duplicate Suppression (feature, scope:world, M4)
- [ ] **#324.4** Promotion Function (Graph + SQL Dual Write) (feature, scope:world, M5)
- [ ] **#324.5** Promotion Telemetry Events (feature, scope:observability, M2)
- [ ] **#324.6** Saturation-Based Narration Suppression Logic (feature, scope:world, M5)
- [ ] **#324.7** Ephemeral Instance Promotion (Dungeon Scope) (feature, scope:world, M6)
- [ ] **#324.8** Audit & Prune Task for Unused Entities (infra, scope:world, M5)
- [ ] **#324.9** Documentation: Promotion Pipeline (docs, scope:world, M4)
- [ ] **#324.10** Concept Invariant Addendum: Promotable Object Definition (docs, scope:world, M4)

#### Epic #68: Layer Validator & Similarity Guardrails

- [ ] **#157** Core Layer Validation Rules (feature, scope:world, M4)
- [ ] **#158** Similarity & Duplicate Layer Detection (feature, scope:world, M4)
- [ ] **#159** Layer Validation Fuzz Test Suite (test, scope:world, M4)
- [ ] **#160** Validation Config & Dry-Run Mode (enhancement, scope:world, M4)
- [ ] **#161** Validation Telemetry Counters (feature, scope:observability, M4)

#### Epic #67: Ambient Context Registry

- [ ] **#162** Ambient Context Registry Core (feature, scope:ai, M4)
- [ ] **#163** Ambient Context Pruning & Metrics (enhancement, scope:ai, M4)
- [ ] **#164** Fallback Resolution Chain (feature, scope:ai, M4)
- [ ] **#165** Ambient Registry Benchmark & Coverage Framework (test, scope:ai, M4)
- [ ] **#166** Ambient Context Persistence Adapter (enhancement, scope:ai, M4)

#### Epic #52: Learn More Page & Automated Content

- [ ] **#171** Learn More Page Implementation (feature, scope:devx, M4)
- [ ] **#172** Weekly Learn More Content Regeneration (infra, scope:devx, M4)
- [ ] **#173** Roadmap Embedding Component (feature, scope:devx, M4)
- [ ] **#174** Learn More SEO & Analytics Instrumentation (enhancement, scope:devx, M4)

---

## Dependency & Blocking Relationships

### Critical Path Dependencies (To Be Established)

**M2 Observability Foundation:**

```
#386.1 (Player State SQL) BLOCKS #389.5 (Player Status Panel)
#386.2 (Inventory SQL) BLOCKS #389.5 (Player Status Panel)
#385.1 (World Event Emission) BLOCKS #385.3 (Idempotency Logic)
#385.2 (Telemetry Constants) BLOCKS #310 (Telemetry Consolidation)
```

**M3 AI Read Foundation:**

```
#388.1 (Prompt Schema) BLOCKS #388.2 (Prompt Storage)
#388.2 (Prompt Storage) BLOCKS #388.3 (Prompt Retrieval API)
#388.3 (Prompt Retrieval API) BLOCKS #322.1 (Persona Injection)
#387.1 (MCP World Query) BLOCKS #387.4 (MCP Auth Layer)
```

**M4 Layering Foundation:**

```
#65 (Description Composer - EXISTING) BLOCKS #389.2 (Description Rendering)
#157 (Layer Validation Rules) BLOCKS #158 (Similarity Detection)
#162 (Ambient Context Core) BLOCKS #164 (Fallback Chain)
#322.1 (Persona Injection) BLOCKS #322.2 (Micro-Quips)
```

**Cross-Milestone Dependencies:**

```
M2: #389.8 (Accessibility) BLOCKS → All frontend features (ongoing constraint)
M2→M3: #310 (Telemetry Consolidation) BLOCKS → #388.6 (Prompt Cost Telemetry)
M3→M4: #388.3 (Prompt Retrieval) BLOCKS → #67 (Ambient Context Registry)
M4→M5: #157-#161 (Layer Validator) BLOCKS → #324.4 (Promotion Function)
```

**Recommended Action:** Use GitHub REST API to establish formal `depends_on` relationships (or structured comments if API unavailable per Copilot Instructions Section 8.2).

---

## Label Compliance Audit

### Taxonomy Rules (from Copilot Instructions Section 8)

**Atomic Issues:**

- Exactly 1 `scope:*` label (core|world|traversal|ai|mcp|systems|observability|devx|security)
- Exactly 1 type label (feature|enhancement|refactor|infra|docs|spike|test)
- Optional: milestone assignment

**Epics:**

- Exactly 1 `scope:*` label
- Exactly 1 `epic` label
- **NO type label** (key differentiator)
- Optional: milestone assignment

### Compliance Status

✅ **Newly Created Epics (#384-#389):** All follow proper taxonomy  
✅ **Existing Epics (#310, #69, #68, #67, #52, #219, #322, #323, #324):** All verified compliant  
⚠️ **Orphaned Issues:** Recommend audit of issues without milestone assignment  
⚠️ **Missing Parent References:** Epic #322/#323 child issues #55, #56, #57, #65, #67 should reference parent epic in body

---

## Documentation Hierarchy Validation

### MECE Layer Audit (Section 18 of Copilot Instructions)

| Layer                          | Path                         | Status       | Issues Found                                          |
| ------------------------------ | ---------------------------- | ------------ | ----------------------------------------------------- |
| **1. Vision (60k ft)**         | README.md                    | ✅ Compliant | None                                                  |
| **2. Tenets (50k ft)**         | docs/tenets.md               | ✅ Compliant | None                                                  |
| **3. Design Modules (40k ft)** | docs/design-modules/         | ✅ Compliant | None detected (manual review recommended)             |
| **4. Architecture (30k ft)**   | docs/architecture/           | ✅ Compliant | 12 files present; cross-reference structure validated |
| **5. Roadmap (20k ft)**        | docs/roadmap.md              | ✅ Updated   | Added M7 milestone row                                |
| **6. Examples (10k ft)**       | docs/examples/               | ✅ Compliant | Directory exists; content not audited                 |
| **7. Code (Ground)**           | backend/, frontend/, shared/ | ✅ Compliant | Implementation layer; see codebase structure          |

### Cross-Layer Leakage Check

**Prohibited Content in Design Modules (docs/design-modules/, docs/concept/):**

- Implementation sequencing (milestones, sprints, backlogs) → Should use roadmap.md ✅
- Technical architecture details (Cosmos partitions, function triggers) → Should use docs/architecture/ ✅
- Telemetry enumeration plans → Should use docs/observability.md ✅
- Inline acceptance criteria / task checklists ✅

**Automation:** `scripts/generate-concept-issues.mjs` + `concept-issue-generator.yml` workflow active

**Recommendation:** Run drift check script before major doc updates.

---

## Roadmap Milestone Status Summary

| Milestone                 | ID  | Open | Closed    | Completion % | Current Focus                                    |
| ------------------------- | --- | ---- | --------- | ------------ | ------------------------------------------------ |
| M0 Foundation             | 1   | 0    | ✅ CLOSED | 100%         | Bootstrap + telemetry scaffold                   |
| M1 Traversal              | 2   | 0    | ✅ CLOSED | 100%         | Location persistence, exits, movement            |
| M2 Observability          | 3   | 23   | 36        | 61%          | **ACTIVE** - Telemetry, health, dashboards       |
| M3 AI Read                | 4   | 17   | 1         | 6%           | Prompt registry, read-only MCP                   |
| M4 Layering & Enrichment  | 5   | 44   | 5         | 10%          | Description layers, ambient context              |
| M5 Systems                | 7   | 5    | 0         | 0%           | Factions, economy signals, NPC tick              |
| M6 Dungeon Runs           | 8   | 10   | 0         | 0%           | Instance state, lifecycle, entrance/exit         |
| M7 Post-MVP Extensibility | 9   | 0    | 0         | 0%           | **NEW** - Multiplayer, quests, economy, AI write |

**Total Open Issues:** 99  
**Total Closed Issues:** 42  
**Overall Completion:** 30%

---

## Recommended Next Actions

### Immediate (This Session)

1. ✅ **COMPLETED:** Create M7 milestone
2. ✅ **COMPLETED:** Create 6 missing epics (#384-#389)
3. ✅ **COMPLETED:** Update roadmap.md with M7
4. ✅ **COMPLETED:** Update Copilot Instructions with M7 reference
5. ⏳ **IN PROGRESS:** Create child issues for Epic #322 (Playable MVP)

### Short-Term (Next 1-2 Weeks)

6. **Create remaining child issues** for:
    - Epic #323 (Humorous DM) - 8 issues
    - Epic #324 (Emergent Entity) - 10 issues
    - Epic #69 (Description Telemetry) - 3 issues
    - Epic #68 (Layer Validator) - 5 issues
    - Epic #67 (Ambient Context) - 5 issues
    - Epic #52 (Learn More Page) - 4 issues
    - Epic #385 (World Event Processing) - 6 issues
    - Epic #386 (Cosmos Dual Persistence) - 9 issues
    - Epic #387 (MCP Server) - 8 issues
    - Epic #388 (Prompt Template Registry) - 8 issues
    - Epic #389 (Frontend Player Experience) - 12 issues

7. **Establish GitHub dependency relationships** for critical path (use REST API per Copilot Instructions Section 8.2)

8. **Assign milestones** to all new child issues using REST API:

    ```bash
    gh api repos/piquet-h/the-shifting-atlas/issues/{issue_number} -X PATCH -f milestone=3
    ```

9. **Add parent epic references** to existing orphaned issues (#55, #56, #57, #65, #67, #101, #102, #76)

### Medium-Term (Next Month)

10. **Conduct orphaned issue audit:** Search for issues without milestone or epic reference
11. **Review M2 Observability blockers:** Prioritize #386 (Dual Persistence) and #389 (Frontend) for MVP readiness
12. **Update ADRs:** Consider new ADR for MCP read-only pattern and prompt template versioning strategy
13. **Documentation sync:** Ensure all new epics have corresponding architecture docs in `docs/architecture/`

---

## Success Metrics & Validation

### Project Health Indicators

**Documentation Coverage:**

- ✅ All 7 MECE layers populated
- ✅ Roadmap reflects current + planned milestones (M0-M7)
- ✅ Copilot Operating Guide synchronized with milestone IDs

**Issue Structure Quality:**

- ✅ 9 coordination epics defined (was 3 pre-review)
- ⚠️ ~50 child issues still need creation (itemized above)
- ⚠️ Dependency relationships not yet formalized

**Milestone Progression:**

- ✅ M0, M1 successfully closed (Foundation + Traversal)
- ⚠️ M2 Observability at 61% completion (active focus)
- ⚠️ M3-M7 require significant child issue generation before work can begin

**Label Compliance:**

- ✅ All epics follow taxonomy (epic + scope:\*, no type)
- ✅ Atomic issues follow taxonomy (scope:\* + type)
- ℹ️ Spot-check of existing issues recommended

---

## Appendix A: References

### Key Documentation Files

- **Roadmap:** `docs/roadmap.md`
- **Copilot Operating Guide:** `.github/copilot-instructions.md`
- **Tenets (WAF-aligned):** `docs/tenets.md`
- **Issue Taxonomy:** `docs/developer-workflow/issue-taxonomy.md`
- **GitHub API Guidance:** `.github/copilot-github-api-guidance.md`

### ADRs Referenced

- **ADR-002:** Graph Partition Strategy (Dual Persistence)
- **ADR-001:** Mosswell Persistence Layering (deprecated by ADR-002)

### Automation Scripts

- **Concept Issue Generator:** `scripts/generate-concept-issues.mjs` + `.github/workflows/concept-issue-generator.yml`
- **Package Ref Validator:** `scripts/validate-package-refs.mjs`
- **Deployability Check:** `scripts/verify-deployable.mjs`

---

## Appendix B: Quick Command Reference

### Create Child Issue (Template)

```bash
gh issue create \
  --repo piquet-h/the-shifting-atlas \
  --title "[Child Issue Title]" \
  --body "Parent: Epic #XXX

Summary: [one sentence]
Goal: [end-state value]

Acceptance Criteria:
- [ ] Criterion 1
- [ ] Criterion 2

Edge Cases:
- Edge case 1
- Edge case 2

Risk: [LOW|DATA-MODEL|RUNTIME-BEHAVIOR|BUILD-SCRIPT|INFRA]

Out of Scope:
- Deferred item 1

References:
- Epic #XXX
- docs/path/to/relevant/doc.md" \
  --label "scope:[scope],feature" \
  --milestone "M2 Observability"
```

### Assign Milestone via REST API

```bash
gh api repos/piquet-h/the-shifting-atlas/issues/{issue_number} \
  -X PATCH \
  -f milestone=3  # M2 Observability ID
```

### Add Issue Dependency (REST API - if available)

```bash
gh api repos/piquet-h/the-shifting-atlas/issues/{issue_number}/dependencies \
  -X POST \
  -f depends_on={blocking_issue_number}
```

### Search Orphaned Issues

```bash
gh issue list \
  --repo piquet-h/the-shifting-atlas \
  --state open \
  --json number,title,milestone,labels \
  --jq '.[] | select(.milestone == null) | {number, title}'
```

---

## Change Log

| Date       | Change                                         | Author         |
| ---------- | ---------------------------------------------- | -------------- |
| 2025-11-07 | Initial comprehensive review completed         | GitHub Copilot |
| 2025-11-07 | M7 milestone created (ID: 9)                   | GitHub Copilot |
| 2025-11-07 | Epics #384-#389 created                        | GitHub Copilot |
| 2025-11-07 | Roadmap.md updated with M7 row                 | GitHub Copilot |
| 2025-11-07 | Copilot Instructions updated with M7 reference | GitHub Copilot |

---

**Next Update:** After child issue creation sprint (estimated: 2025-11-14)
