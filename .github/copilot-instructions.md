---
description: Core Copilot operating guide (workflow, taxonomy, risk tags, commitments)
applyTo: '**'
---

# The Shifting Atlas – Copilot Operating Guide (Compact)

Source of truth for daily generation. Quick mnemonic: `./copilot-quickref.md`. Language/style specifics: `./copilot-language-style.md`.

## Where Copilot gets instructions (MECE)

Copilot behavior is shaped by multiple instruction sources:

1. **Repository-wide instructions** (always-on)
    - `.github/copilot-instructions.md` (this file)
2. **Path-specific instructions** (always-on when files match the glob; used by coding agent + code review)
    - `.github/instructions/**/*.instructions.md`
3. **Agent instructions** (nearest `AGENTS.md`; used by agents, not guaranteed for code review)
    - `backend/AGENTS.md`, `frontend/AGENTS.md`, `shared/AGENTS.md`, `infrastructure/AGENTS.md`
4. **Agent Skills** (on-demand; progressive disclosure)
    - `.github/skills/**`

Keep the always-on layers (1–3) concise and directive. Put deep, task-specific procedures into Skills.

---

## ⚠️ CRITICAL: TDD-First Development (Non-Negotiable)

**All code changes MUST follow Test-Driven Development:**

1. **Write failing tests FIRST** — before any implementation
2. **Run tests to confirm RED** (failure) — proves test is valid
3. **Write minimal code to pass** — then confirm GREEN
4. **Refactor if needed** — tests stay GREEN

**This applies to:** Features, bug fixes, API changes, refactors.
**Exceptions only:** Pure docs, config without runtime logic, exploratory spikes (which never merge without tests), and repository scripts.

Script exception scope:

- Files under `scripts/**` and `.github/skills/**/scripts/**` may be written without TDD.
- These scripts MUST still be validated by running them (and documenting how to run them in the relevant Skill).
- If a script impacts CI/build/deploy behavior, treat it as `BUILD-SCRIPT` risk and add extra verification.

See Section 10.1 for full TDD workflow details.

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
Self QA: Build <PASS/FAIL> | Lint <PASS/FAIL> | Typecheck <PASS/FAIL> | Tests <x passed / y run> | Edge Cases Covered <yes/no> | Assumptions Logged <yes/no>
```

### 0.8 Hallucination Guardrails

- Cite file paths for any referenced symbols; if not found: state "Not found in workspace" (do not fabricate).
- Never invent APIs; prefer searching codebase first.

### 0.9 Test Spec Pattern (Inline)

Prefer minimal Given/When/Then bullets for each acceptance criterion; at least 1 happy path + 1 edge/invalid for new logic.

### 0.10 Fast Path vs Full Workflow

- Fast Path (Trivial): direct patch → run tests → summarize
- Full Workflow (Non‑Trivial): follow Section 0.6 sequence.

### 0.15 CI / Lint / Typecheck gate (Non‑negotiable)

When working as a coding agent (including on GitHub.com), you MUST NOT stop after “opening a PR” if required checks are failing.

Rules:

1. Before finishing any change that touches runtime code, ensure **lint** and **typecheck** pass for the affected package(s).
2. If a CI check fails (lint/typecheck/tests), you MUST:
    - read the failure output,
    - apply the smallest fix,
    - push a follow-up commit,
    - repeat until required checks are green.
3. If you cannot run commands locally, treat CI as the source of truth and iterate until green.

Default commands (from repo root):

- `npm run lint` (or `npm run lint:<package>`)
- `npm run typecheck` (or `npm run typecheck:<package>`)
- `npm test` (only when runtime behavior changes; prefer package-scoped tests)

### 0.16 Prettier Formatting Auto-Correction (Non-negotiable)

**Prettier is the authoritative code formatter.** When prettier errors appear in CI (identified as "Delete" or "Add" formatting errors):

**Do NOT manually edit code to fix these errors.** Prettier auto-fixes them:

```bash
# Run from repo root:
npm run format                    # Auto-fix all packages
npm run format:<package>          # Auto-fix specific package (shared/backend/frontend)

# Or from within a package directory:
npm run format
```

After running format, review the diff, stage changes, and push a follow-up commit with message like `fix: prettier formatting`.

**Verification:** After formatting, run `npm run format:check` (or package-specific variant) to confirm prettier passes before considering work done.

### 0.11 New Azure Function High‑Level Flow

Use Appendix A checklist before committing: trigger chosen, validation, telemetry constant, idempotency note, tests (happy + invalid), risk tag.

### 0.12 When to Refactor vs Defer

### 0.13 Workbook Parameter Rules (Dashboards)

Before creating or modifying an Application Insights workbook:

1. Mirror parameters in BOTH root `parameters[]` and any `KqlParameterItem` control (P1).
2. Guard KQL against placeholder tokens (e.g. `{Param:escape}`) AND blank strings before parsing (P2).
3. Provide deploy-time defaults for analytical thresholds (base %, offset) so workbook is immediately usable (P3).
4. Include concise descriptions (calculation, unit) – no narrative – to reduce misconfiguration (P4).
   If baseline missing → emit info banner + null metric (never fabricate 0%). Overlay series only when threshold breached. See `docs/architecture/workbook-parameter-guidelines.md`.

Refactor only if directly enabling the goal OR reducing clear, measured complexity (≥20% LOC reduction or removal of duplication impacting change). Else, defer and note in Next Steps.

### 0.14 Diagnostics-First Debugging Protocol

When investigating **runtime behavior issues** (hanging, performance, memory leaks, unexpected delays):

**MANDATORY: Gather evidence BEFORE hypothesizing**

#### Hanging Process

Use the `test-triage` skill for the full “what’s keeping Node alive?” workflow, including recommended commands and interpretation.

#### Memory Leak

```bash
node --expose-gc --inspect your-script.js
# Then use Chrome DevTools → Memory → Take heap snapshot
```

#### Performance Degradation

```bash
node --prof your-script.js
node --prof-process isolate-*-v8.log
```

**Prohibited without evidence**:

- Implementing architectural changes based solely on keywords in error messages
- "This component is commonly associated with X problem" reasoning
- Assuming previous similar issues have identical root causes without verification

**Required sequence**:

1. **Evidence** (diagnostics output) → 2. **Hypothesis** (based on evidence) → 3. **Minimal fix** → 4. **Verify**

**Exception**: If evidence gathering requires >5 minutes setup, you may attempt ONE quick hypothesis test first, but:

- Document it as speculative in the response
- Revert immediately if it doesn't resolve the symptom
- Then proceed to evidence gathering

**Trigger keywords**: "hanging", "won't exit", "memory leak", "slow", "timeout", "blocked", "frozen", "stuck", "never returns"

---

## 1. Platform Architecture

Frontend: Azure Static Web Apps (React + Vite + Tailwind)
Backend and API: Azure Functions (HTTP player actions + queue world logic)
Messaging: Azure Service Bus
Data: Dual persistence (ADR-002) – UPDATED: Player storage cutover completed (ADR-004). Dual persistence now applies only to the architectural split between immutable world graph (Gremlin) and mutable player/inventory/events state (SQL API); players are no longer written to Gremlin.

- Cosmos DB Gremlin: World graph (locations, exits, spatial relationships)
- Cosmos DB SQL API: Documents (players, inventory, description layers, events)
  Observability: Application Insights
  Principle: Event‑driven, stateless functions, no polling loops.

---

## 2. Repo Layout (Essentials)

- `frontend/` SWA client
- `backend/` Functions
- `shared/` Cross‑package domain models + telemetry
- `docs/` Design & narrative sources

---

## 3. Modeling Rules

IDs: GUID always.
Graph vertex types: Locations, NPCs (edges for spatial relations).
Document types: Players, Inventory items, Description layers, World events.
Edges: semantic (e.g., `exit_north`, `owns_item`).
Exits: allowed directions set (north,south,east,west,up,down,in,out).
Player action flow: ALL HTTP responses return immediately (<500ms p95). Personal state changes (move, get item, inventory) are synchronous SQL/Graph writes within HTTP handler. Shared world effects (fire spreads, NPC spawns, location transforms) enqueue async events to Service Bus for eventual processing. See `docs/architecture/event-classification-matrix.md` for decision tree.
World evolution: queue triggers only (never blocks HTTP response).
Dual persistence (ADR-002 → superseded for player storage by ADR-004): Immutable world structure in Gremlin graph; mutable player/inventory/events data authoritative in SQL API (player vertices removed).

---

## 4. Coding Conventions

ES Modules everywhere.
Async/await for all I/O.
Function naming: `<Trigger><Action>` pattern enforced by ESLint rule `azure-function-naming`:

- HTTP: PascalCase (e.g., `PlayerMove`, `GetExits`)
- Queue/Service Bus: camelCase with prefix (e.g., `queueProcessWorldEvent`, `serviceBusPublish`)
- Timer: camelCase with `timer` prefix (e.g., `timerComputeIntegrityHashes`)
- Run `npm run lint` to validate before committing
  Single responsibility per Function.
  Telemetry event names centralized (no inline literals).
  Comment only domain nuance or cross-service contract.
  Formatting & linting: Prettier (authoritative formatting) + ESLint (correctness & custom domain rules). See `./copilot-language-style.md` for exact Prettier settings. When prettier errors appear in CI, run `npm run format` to auto-fix (do not manually edit spacing/semicolons).

---

## 5. Cosmos DB SQL API Containers (Post Dual Persistence Cutover)

Backend-specific container/env-var mapping now lives closer to the code:

- `backend/AGENTS.md` (quick reference)
- `backend/src/persistenceConfig.ts` (authoritative source)
- `backend/local.settings*.json` (local examples)

Access pattern: use `@azure/cosmos` with Azure AD (Managed Identity in prod; DefaultAzureCredential locally).

---

## 6. Telemetry

- **Module**: `shared/src/telemetryEvents.ts` (authoritative registry)
- **Purpose**: In-game events (player actions, world generation, navigation)
- **Event format**: `Domain.Subject?.Action` (2–3 segments max; PascalCase)
- **Registry rule**: ALL event names added to `GAME_EVENT_NAMES` array; **no inline literals**
- **Destination**: Application Insights ONLY
- **Location**: `shared/src/` folder ONLY

When adding new events: run `npm run lint` (enforces 2-3 segment pattern, PascalCase, and registry membership).
See `docs/observability.md` for detailed telemetry naming guidance and dimensions.
Include correlation IDs across chained events; avoid noisy high-cardinality ad-hoc logs.
Store prompts under `shared/src/prompts/`.
Reference doc filenames instead of pasting lore blocks.
World content generation: use `.github/skills/world-content-generation/` (on-demand).

---

## 8. Issue & Roadmap Taxonomy

Atomic issues: exactly 1 scope + 1 type label.
Epics: exactly 1 scope label + the coordination label `epic` (no type label applied).
Scopes: `scope:core|world|traversal|ai|mcp|systems|observability|devx|security`.
Types (atomic only): `feature|enhancement|refactor|infra|docs|spike|test`.
Milestones: M0 Foundation → M7 Post-MVP (narrative stages). Can add more. If so, add here and to Section 8.1 table
Status field: `Todo|In progress|Done`. Prioritize by milestone, dependency readiness, and scope impact.

### 8.1 Milestone ID vs Name Reference (IMPORTANT)

**Milestones have both a numeric ID ("number") and a display title.**

- **Searching/filtering (GitHub search syntax):** use the milestone _title_ (for example: `milestone:"M1 Traversal"`).
- **Assigning/updating milestones via API:** use the milestone _number_.

| Milestone Name            | Milestone ID | Status   | Focus                                                                 | Search Example                                             |
| ------------------------- | ------------ | -------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| M0 Foundation             | 1            | CLOSED   | Bootstrap, ping, telemetry scaffold                                   | `milestone:"M0 Foundation"` or filter by ID 1              |
| M1 Traversal              | 2            | CLOSED   | Location persistence, exits, move/look                                | `milestone:"M1 Traversal"` or filter by ID 2               |
| M2 Data Foundations       | 3            | CLOSED   | SQL API containers, player cutover (ADR-004), telemetry consolidation | `milestone:"M2 Data Foundations"` or filter by ID 3        |
| M3a Event Backbone        | 11           | CLOSED   | Queue processing, idempotency, DLQ, correlation                       | `milestone:"M3a Event Backbone"` or filter by ID 11        |
| M3b Player UI & Telemetry | 12           | CLOSED   | SWA auth, game view, navigation, frontend↔backend correlation         | `milestone:"M3b Player UI & Telemetry"` or filter by ID 12 |
| M3c Temporal PI-0         | 13           | Active   | WorldClock, PlayerClock, durations, reconcile policies                | `milestone:"M3c Temporal PI-0"` or filter by ID 13         |
| M4 AI Read                | 4            | Active   | MCP read-only, prompt templates, intent parser                        | `milestone:"M4 AI Read"` or filter by ID 4                 |
| M5 Quality & Depth        | 7            | Active   | Layering engine, dashboards, alerts, integrity monitoring             | `milestone:"M5 Quality & Depth"` or filter by ID 7         |
| M6 Systems                | 8            | Active   | Dungeons, humor layer, entity promotion, Learn More                   | `milestone:"M6 Systems"` or filter by ID 8                 |
| M7 Post-MVP Extensibility | 9            | Planning | Multiplayer, quests, economy, AI write path, region sharding          | `milestone:"M7 Post-MVP Extensibility"` or filter by ID 9  |

**Example confusion to avoid:**

- ❌ "Search for M1 issues" → searching for literal string "M1" finds nothing
- ✅ "Search for M1 issues" → use `milestone:"M1 Traversal"` in GitHub search query

**To find milestone ID from API response:**
Milestone objects include both `number` (the ID) and `title` (the display name):

```json
"milestone": {
  "number": 2,  // ← This is the ID
  "title": "M1 Traversal"  // ← This is the display name
}
```

### 8.2 GitHub API Usage for Issues and Milestones

**When working with GitHub issues, milestones, and dependencies, consult `.github/copilot-github-api-guidance.md` for**:

- Tool selection strategy (MCP vs REST API)
- Milestone assignment workflow (requires REST API)
- Issue dependency relationships (REST API preferred, comment fallback if API unavailable)
- Epic sub-issue management
- Authentication and error handling

**Quick reference**:

- ✅ Use MCP tools (`mcp_github-remote_*`) for: reading, creating, updating issues, adding comments, searching
- ✅ Use REST API (`curl` via `run_in_terminal`) for: assigning milestones, adding dependency relationships
- ⚠️ If dependencies API returns 404 (temporary): fall back to structured comment workaround

See detailed workflows and examples in `copilot-github-api-guidance.md`.

---

## 9. Code Generation Heuristics

**Core Tenet**: Deterministic code captures state for repeatable play; AI creates immersion. When implementing player action handlers, prefer AI-driven decision-making over hard-coded business rules (see `docs/tenets.md` #7 Narrative Consistency).

1. Identify trigger (HTTP/Queue) → choose template.
2. Import domain models (don’t redefine shapes).
3. Validate exits via shared direction validator.
4. Use telemetry constants; add new only in shared enumeration.
5. Cosmos ops idempotent where possible; avoid duplicate edges.
6. HTTP handlers MUST return <500ms (p95); personal state changes are synchronous (SQL/Graph); shared world effects enqueue to Service Bus (see event-classification-matrix.md).
7. Never block HTTP response on queue processing, AI generation, or NPC reactions.
8. **AI flexibility**: Don't hard-code "move never triggers events" rules. Let AI/intent parser decide based on narrative context. Capture classification decisions in telemetry.

Reference: For interaction workflow & templates see Section 0 (patterns) and Appendix A (checklists).

---

## 10. Testing Baseline

### 10.1 TDD-First Development (MANDATORY)

All feature development MUST follow Test-Driven Development:

**Red → Green → Refactor Cycle:**

1. **Red**: Write failing test(s) first that define expected behavior
2. **Green**: Write minimal implementation to make tests pass
3. **Refactor**: Clean up code while keeping tests green

**TDD Workflow for Agent:**

```
1. Understand requirement → define acceptance criteria
2. Write test(s) expressing criteria (they MUST fail initially)
3. Run tests → confirm RED (failure)
4. Implement minimal code to pass
5. Run tests → confirm GREEN (passing)
6. Refactor if needed → tests stay GREEN
7. Repeat for next criterion
```

**When to Write Tests First:**

- ✅ New features (handlers, services, utilities)
- ✅ Bug fixes (reproduce bug as failing test first)
- ✅ API contract changes (test new contract shape)
- ✅ Refactors affecting behavior (lock in current behavior first)

**Exceptions (test-after acceptable):**

- Pure documentation changes
- Config/infrastructure with no runtime logic
- Exploratory spikes (but spike code never merges without tests)

**TDD Anti-Patterns:**

- ❌ Writing implementation then retrofitting tests
- ❌ Skipping the RED phase (tests must fail first)
- ❌ Writing tests that pass immediately (not testing anything)
- ❌ Testing implementation details instead of behavior

### 10.2 Test Layer Separation

Three-tier approach (unit/integration/e2e). See `backend/test/TEST_FIXTURE_GUIDE.md` for:

- Decision matrix (what to test → which fixture → which directory)
- Anti-patterns (no fake clients in unit tests, no direct repo instantiation)
- Migration checklist (moving tests between layers)

**Quick rules:**

- Unit tests: Pure logic + interface contracts only (`UnitTestFixture`, all mocked)
- Integration tests: Repository implementations (`IntegrationTestFixture`, use `describeForBothModes()`)
- E2E tests: Full system + performance (`E2ETestFixture`, cosmos only, post-merge)

**Test requirements:** Provide tests for happy path + edge cases. Run lint + typecheck before commit.

---

## 11. Drift Control

Compact guide stable; long narrative stays in `docs/`.
Any new scope/milestone: update labels + roadmap + this file (minimal diff) + reference ADR.

---

## 12. Anti‑Patterns

Polling loops; inline telemetry names; multiple scope labels; lore dumps in code; uncontrolled edge duplication; skipping direction validation; **file-based shared package references (use registry)**; **long-running timers without `.unref()`**; **HTTP handlers blocking on queue event processing**; **synchronous AI generation in HTTP response path**.

### Timer/Interval Anti-Pattern

Any `setTimeout` or `setInterval` in production code with TTL > 1 minute MUST use `.unref()` unless explicitly required to keep process alive.

**Why**: Unreferenced timers prevent Node.js from exiting even after all meaningful work is done. This causes tests to hang and prevents clean process shutdown.

**Pattern**:

```typescript
const timer = setTimeout(() => {
    // cleanup logic
}, longDelayMs)
timer.unref() // REQUIRED for background cleanup timers
```

**Common culprits**: Memory repository implementations with hour/day TTL cleanup timers.

**Test symptom**: Tests pass but `npm test` never returns to prompt (requires Ctrl+C).

---

## 12.1. Cross-Package Changes Constraint (GitHub.com agents)

**When working from GitHub.com (not local environment):**

If a task requires modifying BOTH `shared/` AND (`backend/` OR `frontend/`):

1. **Stop** — You cannot complete this task from GitHub.com
2. **Create an issue** describing the required changes:
    - Title: "Shared package update needed for [feature]"
    - Body: List what needs to change in shared/ and what needs to change in backend/frontend
    - Label: `scope:shared` + affected scope
3. **Respond to user**: "This requires sequential PRs (shared must publish first). Created issue #[number] for local coordination."

**Why:** Shared package must publish to GitHub Packages registry before backend/frontend can consume it. GitHub.com agents cannot execute multi-stage sequential PRs.

**Local agents:** Can use `file:../shared` temporarily during development, but must restore registry reference (`^0.3.x`) before committing.

---

## 13. Glossary (Micro)

Exit: directional traversal edge.
Event vertex: persisted world action for timeline queries.
Scope label: high-level functional grouping.
Risk tags: LOW (simple), DATA-MODEL (schema/partition), RUNTIME-BEHAVIOR (flow change), BUILD-SCRIPT (CI/tooling), INFRA (deployment/IaC).

---

## 14. Update Checklist

1. Change design / ADR.
2. Amend this compact guide & quickref (minimal diff).
3. Note change in PR description.
4. Update docs/roadmap.md if scope/milestone affected or new milestone added.

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
Self QA: Build PASS | Lint PASS | Typecheck PASS | Tests 12/12 | Edge Cases Covered yes | Assumptions Logged yes
```

### A.8 Risk Tag Quick Reference

LOW | DATA-MODEL | RUNTIME-BEHAVIOR | BUILD-SCRIPT | INFRA

---

## 15. Agent Commit Policy

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

## 16. Diagnostics & Logs First Policy

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
- Diagnostics must use only: source, preflight result, length (redacted), and optionally first/last chars redacted if absolutely necessary (avoid unless explicitly requested for debugging).

Prohibited Without Logs:

- Broad refactors presented as “likely” fixes.
- Multi‑file edits addressing hypothetical causes.

Fast Path Heuristic:

- If an error class is already well‑characterized earlier in the same session (identical signature) and logs were captured, you may reference that prior evidence instead of refetching, but must link to the original run ID.

Rationale:
This codifies a “logs-first, patch-second” discipline prompted by prior wasted cycles where guessing preceded log retrieval.

---

## 17. Atomic Issue Generation & Splitting Policy

Purpose: Guarantee every new implementation issue is a small, testable, reviewable unit; large feature requests become an EPIC (coordination shell) plus a generated set of atomic child issues. This section governs how Copilot must respond when the user asks to "create issues", "open an issue for X", or supplies a multi-part feature description.

### 17.1 Definitions

Atomic Issue: Delivers exactly one deployable increment (code, script, doc update, or test harness) with ≤10 acceptance criteria and one clear responsibility.
Epic Issue: Organizational/coordination issue containing no implementation acceptance criteria; instead links to child atomic issues and tracks status.

### 17.2 Atomicity Heuristics (Failing ≥2 ⇒ Split)

- Multiple distinct verbs / artifacts (e.g., "add helper + scanner + telemetry" )
- Contains both design/spec authoring AND implementation acceptance in same body (non‑trivial)
- Follow-up checklist >5 items or mixes runtime + infra + docs
- Mentions “Stage”, “Phase”, “Groundwork”, or “Program” with implementation details
- Requires more than one new Azure Function OR more than one new script
- Adds both telemetry enumeration and feature logic simultaneously

### 17.3 Required Fields (Atomic Issue Template)

```
Summary: <one sentence outcome>
Goal: <explicit end-state user/system value>
Acceptance Criteria:
- [ ] <criterion 1>
- [ ] <criterion 2>
Edge Cases: <2–3 bullets>
Risk: <LOW|DATA-MODEL|RUNTIME-BEHAVIOR|BUILD-SCRIPT|INFRA>
Out of Scope: <concise bullets>
References: include one issue reference and minimal docs/<path> links
```

No embedded “Follow-up Task Checklist” inside atomic issues (create new issues instead).

### 17.4 Epic Issue Structure

```
Epic: <Feature / Stage Name>
Context: <why now / linkage>
Child Issues Planned:
- [ ] <Child 1 short title>
- [ ] <Child 2 short title>
Decomposition Rationale: <1–2 sentences>
Non-Goals: <bullets>
```

Epic must NOT contain implementation acceptance criteria; it is closed only when all child issues closed (automation can verify via checklist). Child issues must be created separately with their own templates and attached to the Epic as sub-issues.

### 17.5 Splitting Algorithm (Pseudo)

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

### 17.6 Labeling Rules for Generated Issues

- Exactly one `scope:*` label (reuse existing taxonomy Section 8)
- Exactly one type label (atomic issues only): choose among `feature|enhancement|infra|docs|test|refactor|spike`
- Epics use label `epic` only (no additional type like feature/enhancement) plus exactly one scope label
- Child issues must not reuse “Phase/Stage” wording; keep titles imperative & specific

### 17.7 Prioritization Guidance

- If user does not specify priority, default order: core data → essential logic → instrumentation → docs → optimization.
- Do NOT invent numeric ordering fields; rely on milestone + dependency notes.
- Avoid reshuffling active work unless a dependency block emerges.
- If user specifies priority (e.g., “high priority telemetry”), reflect in Epic child checklist order.
- If an issue blocks or is blocked by another issue, you must create that blocking relationship via GitHub API (see Section 8.2).

### 17.8 Telemetry & Security Separation When Splitting

- Telemetry enumeration (adding event names) is its own issue distinct from feature behavior using them.
- Security hardening (rate limits, secret rules) separated from functional feature increments.

### 17.9 DO / DO NOT

DO: Split “create exit management with scanner + reciprocity + versioning + telemetry” into 4–5 child issues.
DO: Keep a stress test harness separate from core repository implementation.
DO: Place future/optional tasks as new issues referenced from Epic — not a checklist inside each atomic issue.
DO NOT: Add large follow-up checklist items beneath Acceptance Criteria of an atomic issue.
DO NOT: Mix infrastructure provisioning (Bicep) and runtime handler code in one issue unless trivial (≤5 LOC infra change).

### 17.10 Response Behavior (Copilot)

When the user requests issue creation for a broad feature:

1. Parse description; apply heuristics.
2. If splitting: output an Epic body + a numbered list of proposed atomic issue titles with draft acceptance criteria (concise) BEFORE creating them (unless user explicitly says “auto-create now”).
3. Wait for user confirmation if ambiguity exists; otherwise proceed using existing taxonomy.
4. Never create duplicate of any open issue title (case-insensitive); if near-duplicate found, propose augmentation instead.

### 17.11 Quality Gate for Generated Atomic Issues

Each generated issue must:

- Have ≤10 acceptance checkboxes
- Contain ≤1 risk tag
- Contain at least 1 edge case
- Not contain the words “Phase”, “Stage”, “Groundwork”, “Follow-up Task Checklist”
- Not define more than one new function trigger or script

### 17.13 Rationale

Consistent small slices shorten review cycles, reduce merge conflict surface, and keep telemetry noise isolated without any predictive or numeric ordering automation.

### 17.14 Examples

User asks (historical example removed – scheduling & variance workflow deprecated).

Each child then receives its atomic template.

---

Last reviewed: 2026-01-15

---

## 18. Documentation guidance

Docs-specific authoring rules (MECE hierarchy, cross-layer linking, and planning-leakage guardrails) live in:

- `.github/instructions/docs.instructions.md` (authoritative for `docs/` edits)

This file applies automatically to `docs/**` paths.

Keep this file focused on cross-cutting engineering workflow and runtime constraints.
