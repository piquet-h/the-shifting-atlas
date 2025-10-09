# The Shifting Atlas – Copilot Operating Guide (Compact)

Source of truth for daily generation. Quick mnemonic: `./copilot-quickref.md`. Language/style specifics: `./copilot-language-style.md`.

---

## 0. Interaction & Prompt Patterns

Purpose: Make every agent exchange deterministic: clear goal, bounded scope, explicit success criteria, no hidden assumptions.

### 0.1 Prompt Template (copy/paste)

```
Goal: <single atomic goal>
Context: <only directly relevant files/models>
Constraints: <performance|style|security|latency|size>
Acceptance Criteria:
- [ ] <criterion 1>
- [ ] <criterion 2>
Edge Cases: <bullet 2–3>
Risk: <LOW|DATA-MODEL|RUNTIME-BEHAVIOR|BUILD-SCRIPT|INFRA>
Tests (Given/When/Then):
- Given ... When ... Then ...
Assumptions allowed: <yes/no>
```

### 0.2 Decision Matrix (Trivial vs Non‑Trivial)

Trivial task (any ALL true): ≤1 file touched OR ≤15 LOC net diff, no new dependency, no public API / schema change.
→ Agent may skip formal todo list; apply patch + run tests.

Non‑Trivial: anything else.
→ Agent MUST: (1) create/manage todo list (one item in-progress) (2) state assumptions (3) run build/lint/tests before completion.

### 0.3 Clarification Protocol

If truly blocked by ambiguity after reading workspace:

1. Ask exactly ONE clarifying question.
2. Provide conditional plan branches for plausible answers.
3. Pause for user reply.
   If not blocking → proceed and record assumptions (Section 0.4).

### 0.4 Assumptions Block

Every non-trivial response requiring inference must include:

```
Assumptions:
- A1: <assumption> (confidence: high|med|low) → Mitigation/Test: <how verified>
```

Low confidence assumptions require a guard (runtime check or test case).

### 0.5 Risk Tags

Use the highest applicable:

- LOW – simple/internal edit
- DATA-MODEL – schema, partition key, ID semantics
- RUNTIME-BEHAVIOR – execution flow / side-effects change
- BUILD-SCRIPT – CI / scripts / tooling logic
- INFRA – Bicep, deployment, secret wiring
  Non‑LOW requires at least one additional verification step (extra targeted test or rationale note).

### 0.6 Response Structure (Non‑Trivial)

1. Preamble (1 line: intent + next action)
2. Todo list (states: not-started/in-progress/completed)
3. Actions Taken (concise)
4. Diff Summary (no full code unless requested; refer to files)
5. Verification (build/lint/tests outcomes)
6. Self QA footer
7. Next Steps / Follow‑ups (if any)

### 0.7 Self QA Footer

```
Self QA: Build <PASS/FAIL> | Lint <PASS/FAIL> | Tests <x passed / y run> | Edge Cases Covered <yes/no> | Assumptions Logged <yes/no>
```

### 0.8 Hallucination Guardrails

- Cite file paths for any referenced symbols; if not found: state "Not found in workspace" (do not fabricate).
- Never invent APIs; prefer searching codebase first.

### 0.9 Test Spec Pattern (Inline)

Prefer minimal Given/When/Then bullets for each acceptance criterion; at least 1 happy path + 1 edge/invalid for new logic.

### 0.10 Fast Path vs Full Workflow

- Fast Path (Trivial): direct patch → run tests → summarize
- Full Workflow (Non‑Trivial): follow Section 0.6 sequence.

### 0.11 New Azure Function High‑Level Flow

Use Appendix A checklist before committing: trigger chosen, validation, telemetry constant, idempotency note, tests (happy + invalid), risk tag.

### 0.12 When to Refactor vs Defer

Refactor only if directly enabling the goal OR reducing clear, measured complexity (≥20% LOC reduction or removal of duplication impacting change). Else, defer and note in Next Steps.

---

## 1. Platform Architecture

Frontend: Azure Static Web Apps (React + Vite + Tailwind)
Backend: Azure Functions (HTTP player actions + queue world logic)
API: Azure API Management
Messaging: Azure Service Bus
Data: Dual persistence (ADR-002)

- Cosmos DB Gremlin: World graph (locations, exits, spatial relationships)
- Cosmos DB SQL API: Documents (players, inventory, description layers, events)
  Observability: Application Insights
  Principle: Event‑driven, stateless functions, no polling loops.

---

## 2. Repo Layout (Essentials)

- `frontend/` SWA client
- `backend/` Functions (`functions/`, `shared/` utilities)
- `shared/` Cross‑package domain models + telemetry
- `scripts/` Automation (labels, seed) — legacy ordering/scheduling automation removed
- `docs/` Design & narrative sources

---

## 3. Modeling Rules

IDs: GUID always.
Graph vertex types: Locations, NPCs (edges for spatial relations).
Document types: Players, Inventory items, Description layers, World events.
Edges: semantic (e.g., `exit_north`, `owns_item`).
Exits: allowed directions set (north,south,east,west,up,down,in,out).
Player action flow: HTTP validate → persist (SQL + graph) → enqueue world event.
World evolution: queue triggers only.
Dual persistence (ADR-002): Mutable player data in SQL API; immutable world structure in Gremlin graph.

---

## 4. Coding Conventions

ES Modules everywhere.
Async/await for all I/O.
Function naming: `<Trigger><Action>` (`HttpMovePlayer`, `QueueProcessNPCStep`).
Single responsibility per Function.
Telemetry event names centralized (no inline literals).
Comment only domain nuance or cross-service contract.
Formatting & linting: Prettier (authoritative formatting) + ESLint (correctness & custom domain rules). See `./copilot-language-style.md` for exact Prettier settings; do not handcraft alternative spacing/semicolons.

---

## 5. Cosmos DB SQL API Containers (Dual Persistence)

Environment variables (wired in Bicep, available in Functions):

- `COSMOS_SQL_ENDPOINT` – SQL API account endpoint
- `COSMOS_SQL_DATABASE` – Database name (`game-docs`)
- `COSMOS_SQL_KEY_SECRET_NAME` – Key Vault secret name (`cosmos-sql-primary-key`)
- `COSMOS_SQL_CONTAINER_PLAYERS` – `players` (PK: `/id`)
- `COSMOS_SQL_CONTAINER_INVENTORY` – `inventory` (PK: `/playerId`)
- `COSMOS_SQL_CONTAINER_LAYERS` – `descriptionLayers` (PK: `/locationId`)
- `COSMOS_SQL_CONTAINER_EVENTS` – `worldEvents` (PK: `/scopeKey`)

Access pattern: Use `@azure/cosmos` SDK with Managed Identity or Key Vault secret.
Partition key patterns:

- Players: Use player GUID as PK value.
- Inventory: Use player GUID to colocate all items for a player.
- Layers: Use location GUID to colocate all layers for a location.
- Events: Use scope pattern `loc:<id>` or `player:<id>` for efficient timeline queries.

---

## 6. Telemetry

**CRITICAL SEPARATION**: Build automation and game domain telemetry are strictly separated.

### Build Telemetry (CI/Automation)

- **Module**: `scripts/shared/build-telemetry.mjs`
- **Purpose**: Minimal CI/automation signals (legacy ordering / scheduling / variance events removed)
- **Event prefix**: `build.` (introduce new events only after review; deprecated names must not return)
- **Destination**: GitHub Actions logs + artifacts (NOT Application Insights)
- **Location**: `scripts/` folder ONLY

### Game Telemetry (Domain Events)

- **Module**: `shared/src/telemetry.ts`
- **Purpose**: In-game events (player actions, world generation, navigation)
- **Event format**: `Domain.Subject.Action` (e.g., `Player.Get`, `Location.Move`)
- **Destination**: Application Insights ONLY
- **Location**: `shared/src/` folder ONLY

### Separation Rules (Never Violate)

1. ❌ NEVER add build events to `shared/src/telemetryEvents.ts` (game domain only)
2. ❌ NEVER add game events to `scripts/shared/build-telemetry.mjs` (build automation only)
3. ❌ NEVER use Application Insights for build telemetry (GitHub artifacts only)
4. ❌ NEVER use `build.*` events or import `build-telemetry` in game domain code (backend/, frontend/, shared/src/)
5. ✅ Always use `scripts/shared/build-telemetry.mjs` for ALL CI/automation events
6. ✅ Always use `shared/src/telemetry.ts` for ALL game domain events

**Enforcement**: Automated validation (`npm run validate:telemetry-separation`) runs in CI and scans the entire codebase for violations. The build telemetry guard ensures `build.*` events only appear in `scripts/` directory.

**Rationale**: Prevents pollution of game analytics with infrastructure noise, enables clean separation of concerns, reduces Application Insights costs, allows independent evolution.

See `docs/developer-workflow/build-telemetry.md` for complete documentation.

Include correlation IDs across chained events.
Avoid noisy high‑cardinality ad‑hoc logs.

---

## 7. AI / Prompts

Store prompts under `shared/src/prompts/`.
Reference doc filenames instead of pasting lore blocks.
World content generation: see `.github/instructions/world/.instructions.md`.

---

## 8. Issue & Roadmap Taxonomy

Atomic issues: exactly 1 scope + 1 type label.
Epics: exactly 1 scope label + the coordination label `epic` (no type label applied).
Scopes: `scope:core|world|traversal|ai|mcp|systems|observability|devx|security`.
Types (atomic only): `feature|enhancement|refactor|infra|docs|spike|test`.
Milestones: M0 Foundation → M5 Systems (narrative stages).
Status field: `Todo|In progress|Done`. Legacy predictive scheduling / numeric ordering automation removed; prioritize manually by milestone, dependency readiness, and scope impact.
Never use legacy `area:*`, `phase-*`, `priority:*` (still deprecated).

**Automated Assignment**: (Deprecated) Implementation order automation removed — ignore historical references.

---

## 9. Manual Prioritization

All former ordering / scheduling commands and numeric sequencing fields are retired. Use:

1. Milestone narrative progression (M0→M5)
2. Dependency readiness (unblock critical chains first)
3. Scope impact (`core`, `world`, `systems`, etc.)

No automated provisional ordering or predictive scheduling should be reintroduced without a new ADR.

---

## 10. Code Generation Heuristics

1. Identify trigger (HTTP/Queue) → choose template.
2. Import domain models (don’t redefine shapes).
3. Validate exits via shared direction validator.
4. Use telemetry constants; add new only in shared enumeration.
5. Cosmos ops idempotent where possible; avoid duplicate edges.

Reference: For interaction workflow & templates see Section 0 (patterns) and Appendix A (checklists).

---

## 11. Testing Baseline

Provide tests for: happy path, invalid direction, missing player ID.
Run lint + typecheck before commit; (ordering drift checks removed).

---

## 12. Drift Control

Compact guide stable; long narrative stays in `docs/`.
Any new scope/milestone: update labels + roadmap + this file (minimal diff) + reference ADR.

### Roadmap & Status Guardrails (Do NOT Manual Edit)

`docs/roadmap.md` previously auto-generated via ordering automation; that system is deprecated. Edit roadmap content manually as needed (historical automation references can be ignored).

---

## 13. “Next Up” Algorithm

Filter non-`Done` issues by milestone urgency, dependency readiness, then scope priority (`core > world > traversal > ai > others`). Parallel work minimal unless explicitly requested.

---

## 14. Anti‑Patterns

Polling loops; inline telemetry names; multiple scope labels; lore dumps in code; uncontrolled edge duplication; skipping direction validation.

---

## 15. Glossary (Micro)

Exit: directional traversal edge.
Event vertex: persisted world action for timeline queries.
Implementation order: (Removed) replaced by manual milestone + dependency assessment.
Scope label: high-level functional grouping.
Status: lightweight progress state powering “Next Up”.
Risk tags: LOW (simple), DATA-MODEL (schema/partition), RUNTIME-BEHAVIOR (flow change), BUILD-SCRIPT (CI/tooling), INFRA (deployment/IaC).

---

## 16. Update Checklist

1. Change design / ADR.
2. Amend this compact guide & quickref (minimal diff).
3. Sync labels / regenerate roadmap.
4. Note change in PR description.

---

Quick reference: `./copilot-quickref.md` | Language/style: `./copilot-language-style.md`

---

## Appendix A. Templates & Checklists

### A.1 Prompt Template (canonical)

```
Goal: <single atomic goal>
Context: <minimal relevant files/models>
Constraints: <performance|style|security|latency|size>
Acceptance Criteria:
- [ ] <criterion>
Edge Cases: <2–3 bullets>
Risk: <LOW|DATA-MODEL|RUNTIME-BEHAVIOR|BUILD-SCRIPT|INFRA>
Tests (Given/When/Then):
- Given ... When ... Then ...
Assumptions allowed: <yes/no>
```

### A.2 Success Criteria / Definition of Done Checklist

- All acceptance criteria checkboxes addressed (Done/Deferred noted)
- Risk tag declared (non‑LOW has extra verification)
- Assumptions block present (if any inference)
- Tests: existing pass + new tests for new logic (happy + 1 edge)
- No stray telemetry literals (only enum)
- No roadmap manual edits (Section 12 guardrails)
- Build + lint + typecheck clean

### A.3 Assumptions Block Pattern

```
Assumptions:
- A1: <detail> (confidence: med) → Mitigation: <test name>
```

### A.4 Given / When / Then Example

```
Given a player with no current location
When HttpMovePlayer is invoked with direction "north"
Then it returns 400 (invalid: no starting location) and emits no world event
```

### A.5 New Azure Function Checklist

- Name `<Trigger><Action>` (e.g. `HttpMovePlayer`)
- Trigger binding & auth level appropriate
- Input validation (shared validators) + clear 4xx vs 5xx handling
- Telemetry: existing constants only; new constant added centrally if required
- Cosmos operations idempotent / duplicate-safe
- Queue/event emission includes correlation IDs
- Tests: happy path + invalid input + (if side-effects) idempotency repeat
- Risk tag (likely RUNTIME-BEHAVIOR or INFRA) added in plan

### A.6 Refactor Safety Sequence

1. Snapshot public exports (list)
2. Outline proposed structural changes (bullets)
3. Apply smallest diff
4. Run tests / lint / typecheck
5. Confirm no public export signature drift (unless intentional & documented)

### A.7 Self QA Footer (copy)

```
Self QA: Build PASS | Lint PASS | Tests 12/12 | Edge Cases Covered yes | Assumptions Logged yes
```

### A.8 Risk Tag Quick Reference

LOW | DATA-MODEL | RUNTIME-BEHAVIOR | BUILD-SCRIPT | INFRA

---

## 17. Agent Commit Policy

Default mode: PROPOSE ONLY.

The agent may read & edit files, run tests/lint, and present unified diffs; it must NOT automatically stage (git add), commit, or push unless approval signals appear in the latest user message.

Approval signals (any of):

- Explicit phrase: `stage now`, `commit now`, `apply and commit`, `open PR`.
- User asks for a PR / pull request explicitly.

Behavior by default (no approval present):

1. Generate patch (apply in workspace so tests can run) but leave files UNSTAGED.
2. Run tests / typecheck to validate.
3. Report: changed files list + rationale. No git add.

Escalation exceptions (still require explicit confirmation unless user inactive >1 interaction):

- Hotfix: security/license violation or broken main build introduced by previous agent edit.
- Data loss prevention: revert obviously destructive accidental change (provide diff first if possible).

Prohibited without approval: staging, committing, force-pushing, branch deletion.

On PR request:

1. Create branch `feat/<topic>` or `docs/<topic>`.
2. Stage & commit changes with conventional message.
3. Open PR including: summary, file list, any new policies, test results snippet.

If ambiguous instruction: ask for clarification before staging.

Reminder heuristic: If same unapproved edits persist for >1 user response, include a gentle note offering `stage now` or modification.

---

## 18. Diagnostics & Logs First Policy

Purpose: Eliminate time lost to speculation. Always ground fixes in real, retrieved evidence before proposing or applying changes.

When something fails (CI job, GitHub Action, tests, lint, typecheck, runtime):

1. Acquire Logs Before Hypothesizing
    - GitHub Actions: list workflows -> list recent runs -> fetch failed job logs (prefer `failed_only` view) before editing.
    - Local / tests: run the relevant task (lint, test) to reproduce and capture the exact error output.
    - Do NOT propose a patch based only on memory or guesswork if logs are obtainable.
2. Summarize Evidence
    - Extract the minimal decisive lines (error codes, stack trace root cause, failing command) into the analysis section of the response.
    - Note the run ID / job name for traceability.
3. Formulate Fix
    - Only after steps 1–2, outline the smallest change addressing the concrete error.
4. Apply & Re‑verify
    - Re‑run the same workflow / tests to confirm the specific failing symptom is resolved and no regressions appear.

Unavailable Logs Scenario:
If logs are expired / inaccessible (e.g., artifact retention lapsed), explicitly state this, then: (a) attempt to re‑trigger the workflow to regenerate logs, or (b) construct a minimal local reproduction path. Only proceed with an inferential fix after documenting why direct evidence is unavailable.

Secrets / Tokens:

- Never echo raw secret values.
- Diagnostics must use only: source, preflight result, length (`${#TOK}`), and redacted first/last chars if absolutely necessary (avoid unless explicitly requested for debugging).

Prohibited Without Logs:

- Broad refactors presented as “likely” fixes.
- Multi‑file edits addressing hypothetical causes.

Fast Path Heuristic:

- If an error class is already well‑characterized earlier in the same session (identical signature) and logs were captured, you may reference that prior evidence instead of refetching, but must link to the original run ID.

Rationale:
This codifies a “logs-first, patch-second” discipline prompted by prior wasted cycles where guessing preceded log retrieval.

---

## 19. Active Follow-Up Backlog (Automation & Persistence)

Purpose: Provide the agent with a canonical list of currently open follow-up issues created to close gaps discovered in the closed-issue audit (2025-10-05). Do NOT duplicate scope or create variants; extend or close these in place.

| Issue | Title (abridged)                                    | Scope/Type              | Primary Theme                              | Dependencies / References                       |
| ----- | --------------------------------------------------- | ----------------------- | ------------------------------------------ | ----------------------------------------------- |
| #100  | Location Persistence (Upsert + Revision)            | world / feature         | World data durability                      | Refs closed #4; enables richer traversal & look |
| #101  | World Event Queue Processor                         | systems / feature       | Async world evolution                      | Contract doc, precursor to AI events            |
| #102  | Add Remaining Cosmos SQL Containers                 | core / infra            | Dual persistence completeness              | ADR-002; closed #76 gap                         |
| #103  | Player Persistence Enhancement                      | world / enhancement     | Stable player identity & Gremlin upsert    | Depends on #100 (locations)                     |
| #104  | (Retired) Ordering Telemetry & Metrics              | devx / enhancement      | Removed — predictive automation deprecated | Superseded by manual prioritization             |
| #105  | (Retired) Ordering Assignment Hardening             | devx / enhancement      | Removed — automation path discontinued     | Superseded by manual prioritization             |
| #106  | (Retired) Predictive Scheduling Execution           | devx / enhancement      | Removed provisional scheduling & variance  | Not to be reinstated                            |
| #107  | Secret Helper Tests & Telemetry Constants           | security / test         | Security baseline completeness             | Closed #49 baseline                             |
| #108  | DI Suitability Gating Workflow                      | devx / enhancement      | Noise reduction & quality signals          | Historical #17 #18 #19                          |
| #109  | Ambiguous Relative Direction Telemetry              | traversal / enhancement | Navigation analytics                       | Closed #34 implementation                       |
| #110  | Explorer Bootstrap Regression & Future Creation Doc | world / test            | Onboarding stability                       | Closed #24; relates #7 (#103)                   |
| #111  | Managed API Packaging Regression Test               | devx / test             | Deployment reliability                     | Closed #28                                      |

Prioritization Guidance:

1. Core world data foundations (#100, #103) then asynchronous evolution (#101).
2. Infrastructure correctness (#102) before higher-level event processing (#101).
3. Security & reliability (#107) followed by analytics/telemetry enhancements (#109, #110).
4. Developer experience & quality signals (#108, #111) as capacity allows.

Rules:

- Do not open duplicate issues for the same gap; update these.
- When closing one, ensure acceptance criteria are mirrored in PR description & tests.
- Update this section only when adding or fully retiring a follow-up; keep minimal diff.

NOTE: Former numeric ordering & predictive scheduling systems are removed; sequencing curated manually.

---

## 20. Atomic Issue Generation & Splitting Policy

Purpose: Guarantee every new implementation issue is a small, testable, reviewable unit; large feature requests become an EPIC (coordination shell) plus a generated set of atomic child issues. This section governs how Copilot must respond when the user asks to "create issues", "open an issue for X", or supplies a multi-part feature description.

### 20.1 Definitions

Atomic Issue: Delivers exactly one deployable increment (code, script, doc update, or test harness) with ≤10 acceptance criteria and one clear responsibility.
Epic Issue: Organizational/coordination issue containing no implementation acceptance criteria; instead links to child atomic issues and tracks status.

### 20.2 Atomicity Heuristics (Failing ≥2 ⇒ Split)

- Multiple distinct verbs / artifacts (e.g., "add helper + scanner + telemetry" )
- Contains both design/spec authoring AND implementation acceptance in same body (non‑trivial)
- Follow-up checklist >5 items or mixes runtime + infra + docs
- Mentions “Stage”, “Phase”, “Groundwork”, or “Program” with implementation details
- Requires more than one new Azure Function OR more than one new script
- Adds both telemetry enumeration and feature logic simultaneously

### 20.3 Required Fields (Atomic Issue Template)

```
Summary: <one sentence outcome>
Goal: <explicit end-state user/system value>
Acceptance Criteria:
- [ ] <criterion 1>
- [ ] <criterion 2>
Edge Cases: <2–3 bullets>
Risk: <LOW|DATA-MODEL|RUNTIME-BEHAVIOR|BUILD-SCRIPT|INFRA>
Out of Scope: <concise bullets>
References: #<issue> docs/<path> (only directly relevant)
```

No embedded “Follow-up Task Checklist” inside atomic issues (create new issues instead).

### 20.4 Epic Issue Structure

```
Epic: <Feature / Stage Name>
Context: <why now / linkage>
Child Issues Planned:
- [ ] <Child 1 short title>
- [ ] <Child 2 short title>
Decomposition Rationale: <1–2 sentences>
Non-Goals: <bullets>
```

Epic must NOT contain implementation acceptance criteria; it is closed only when all child issues closed (automation can verify via checklist).

### 20.5 Splitting Algorithm (Pseudo)

```
input = user feature description
if clearly single concern & ≤10 criteria & no multi-scope keywords => create 1 atomic issue
else:
  create Epic (docs or enhancement depending on nature) with coordination checklist
  identify concern clusters by noun/action grouping:
    - persistence / storage
    - telemetry / metrics
    - validation / rules
    - automation / workflow
    - docs / design
  for each cluster:
    generate atomic issue with unique goal, minimal acceptance, single risk tag
  map dependencies: order telemetry after core logic; docs can parallel if spec stable
```

### 20.6 Labeling Rules for Generated Issues

- Exactly one `scope:*` label (reuse existing taxonomy Section 8)
- Exactly one type label (atomic issues only): choose among `feature|enhancement|infra|docs|test|refactor|spike`
- Epics use label `epic` only (no additional type like feature/enhancement) plus exactly one scope label
- Child issues must not reuse “Phase/Stage” wording; keep titles imperative & specific

### 20.7 Prioritization Guidance

- If user does not specify priority, default order: core data → essential logic → instrumentation → docs → optimization.
- Do NOT invent numeric ordering fields; rely on milestone + dependency notes.
- Avoid reshuffling active work unless a dependency block emerges.

### 20.8 Telemetry & Security Separation When Splitting

- Telemetry enumeration (adding event names) is its own issue distinct from feature behavior using them.
- Security hardening (rate limits, secret rules) separated from functional feature increments.

### 20.9 DO / DO NOT

DO: Split “create exit management with scanner + reciprocity + versioning + telemetry” into 4–5 child issues.
DO: Keep a stress test harness separate from core repository implementation.
DO: Place future/optional tasks as new issues referenced from Epic — not a checklist inside each atomic issue.
DO NOT: Add large follow-up checklist items beneath Acceptance Criteria of an atomic issue.
DO NOT: Mix infrastructure provisioning (Bicep) and runtime handler code in one issue unless trivial (≤5 LOC infra change).

### 20.10 Response Behavior (Copilot)

When the user requests issue creation for a broad feature:

1. Parse description; apply heuristics.
2. If splitting: output an Epic body + a numbered list of proposed atomic issue titles with draft acceptance criteria (concise) BEFORE creating them (unless user explicitly says “auto-create now”).
3. Wait for user confirmation if ambiguity exists; otherwise proceed using existing taxonomy.
4. Never create duplicate of any open issue title (case-insensitive); if near-duplicate found, propose augmentation instead.

### 20.11 Quality Gate for Generated Atomic Issues

Each generated issue must:

- Have ≤10 acceptance checkboxes
- Contain ≤1 risk tag
- Contain at least 1 edge case
- Not contain the words “Phase”, “Stage”, “Groundwork”, “Follow-up Task Checklist”
- Not define more than one new function trigger or script

### 20.12 Enforcement Automation (Future)

If implemented, a script may scan new issues and comment when atomicity rules are violated. Until then, Copilot serves as the guardrail by applying this section.

### 20.13 Rationale

Consistent small slices shorten review cycles, reduce merge conflict surface, and keep telemetry noise isolated without any predictive or numeric ordering automation.

### 20.14 Examples

User asks (historical example removed – scheduling & variance workflow deprecated).

Each child then receives its atomic template.

---
