---
description: Core Copilot operating guide (workflow, taxonomy, risk tags, commitments)
applyTo: '**'
---

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
Backend and API: Azure Functions (HTTP player actions + queue world logic)
Messaging: Azure Service Bus
Data: Dual persistence (ADR-002)

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
- `COSMOS_SQL_DATABASE` – Database name (`game`)
- `COSMOS_SQL_KEY_SECRET_NAME` – Key Vault secret name (`cosmos-sql-primary-key`)
- `COSMOS_SQL_CONTAINER_PLAYERS` – `players` (PK: `/id`)
- `COSMOS_SQL_CONTAINER_INVENTORY` – `inventory` (PK: `/playerId`)
- `COSMOS_SQL_CONTAINER_LAYERS` – `descriptionLayers` (PK: `/locationId`)
- `COSMOS_SQL_CONTAINER_EVENTS` – `worldEvents` (PK: `/scopeKey`)

Access pattern: Use `@azure/cosmos` SDK with Managed Identity (preferred) or Key Vault secret.
Partition key patterns:

- Players: Use player GUID as PK value.
- Inventory: Use player GUID to colocate all items for a player.
- Layers: Use location GUID to colocate all layers for a location.
- Events: Use scope pattern `loc:<id>` or `player:<id>` for efficient timeline queries.

---

## 6. Telemetry

- **Module**: `shared/src/telemetry.ts`
- **Purpose**: In-game events (player actions, world generation, navigation)
- **Event format**: `Domain.Subject.Action` (e.g., `Player.Get`, `Location.Move`)
- **Destination**: Application Insights ONLY
- **Location**: `shared/src/` folder ONLY

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
Milestones: M0 Foundation → M6 Dungeon Runs (narrative stages). Can add more. If so, add here and to Section 8.1 table
Status field: `Todo|In progress|Done`. Prioritize by milestone, dependency readiness, and scope impact.

### 8.1 Milestone ID vs Name Reference (IMPORTANT)

**When searching/filtering issues by milestone, use the milestone ID number, not the name.**

GitHub milestones have both a numeric ID and a display name. The GitHub MCP search tools require the ID.

| Milestone Name           | Milestone ID | Search Example                                           |
| ------------------------ | ------------ | -------------------------------------------------------- |
| M0 Foundation            | 1            | `milestone:"M0 Foundation"` or filter by ID 1            |
| M1 Traversal             | 2            | `milestone:"M1 Traversal"` or filter by ID 2             |
| M2 Observability         | 3            | `milestone:"M2 Observability"` or filter by ID 3         |
| M3 AI Read               | 4            | `milestone:"M3 AI Read"` or filter by ID 4               |
| M4 Layering & Enrichment | 5            | `milestone:"M4 Layering & Enrichment"` or filter by ID 5 |
| M5 Systems               | 7            | `milestone:"M5 Systems"` or filter by ID 7               |
| M6 Dungeon Runs          | 8            | `milestone:"M6 Dungeon Runs"` or filter by ID 8          |

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

---

## 9. Code Generation Heuristics

1. Identify trigger (HTTP/Queue) → choose template.
2. Import domain models (don’t redefine shapes).
3. Validate exits via shared direction validator.
4. Use telemetry constants; add new only in shared enumeration.
5. Cosmos ops idempotent where possible; avoid duplicate edges.

Reference: For interaction workflow & templates see Section 0 (patterns) and Appendix A (checklists).

---

## 10. Testing Baseline

Provide tests for: happy path, invalid direction, missing player ID.
Run lint + typecheck before commit; (ordering drift checks removed).

---

## 11. Drift Control

Compact guide stable; long narrative stays in `docs/`.
Any new scope/milestone: update labels + roadmap + this file (minimal diff) + reference ADR.

---

## 12. Anti‑Patterns

Polling loops; inline telemetry names; multiple scope labels; lore dumps in code; uncontrolled edge duplication; skipping direction validation; **file-based shared package references (use registry)**.

---

## 12.1. Package Dependency Rules (CRITICAL)

**The shared package is published to GitHub Packages registry and MUST be referenced via registry, NOT via file path.**

### Correct Pattern (backend/package.json):

```json
{
    "dependencies": {
        "@piquet-h/shared": "^0.3.x"
    }
}
```

### FORBIDDEN Pattern (breaks CI/CD):

```json
{
    "dependencies": {
        "@piquet-h/shared": "file:../shared"
    }
}
```

### Why This Matters:

- **File-based references (`file:../shared`)**: Only work locally; break in CI/deployment where the shared package directory doesn't exist
- **Registry references (`^0.3.x`)**: Pull from GitHub Packages; work everywhere (local dev, CI, production)
- **Historical problem**: Copilot coding agent has repeatedly reverted correct registry references to file-based references in PRs, breaking builds

### Agent Rules:

1. **NEVER** change `@piquet-h/shared` dependency in backend/package.json to `file:../shared`
2. **ALWAYS** use semver range like `^0.3.x` to reference the published package from GitHub Packages
3. When adding imports from `@piquet-h/shared` in backend code:
    - Import the module normally: `import { Direction } from '@piquet-h/shared'`
    - Do NOT modify backend/package.json unless bumping to a new version
    - Verify the dependency already exists before assuming it needs to be added
4. If you need a newer version of shared:
    - Check shared/package.json for current version
    - Update backend/package.json with the correct semver range (e.g., `^0.4.0`)
    - Do NOT use file paths

### Verification:

- CI validation script checks for `file:` patterns in backend/package.json
- Pre-commit hook can catch this locally (see scripts/verify-deployable.mjs)
- Backend tests will fail if file-based reference is used in a clean CI environment

---

## 12.2. Cross-Package PR Splitting (Shared + Backend Changes)

**When changes affect both `shared/` and `backend/` packages, they MUST be split into sequential PRs.**

### Problem

Backend code cannot import from a shared package version that doesn't exist in GitHub Packages yet. If both are in one PR:

- CI tries to `npm install` backend dependencies
- Shared version X doesn't exist in registry yet
- Build fails with "package not found"

### Required Pattern: Two-Stage Merge

#### Stage 1: Shared Package Changes Only

1. **Create PR with ONLY shared/ changes:**
    - New utilities, types, or functions
    - Version bump in `shared/package.json`
    - Tests in `shared/test/`
    - NO backend integration code

2. **Merge to main**
    - CI automatically publishes new version to GitHub Packages
    - Wait ~5 minutes for publish workflow to complete

3. **Verify publication:**
    ```bash
    # Check that version exists in registry
    npm view @piquet-h/shared@0.3.6
    ```

#### Stage 2: Backend Integration

4. **Create follow-up PR with backend changes:**
    - Update `backend/package.json` to reference new shared version
    - Add backend code using new shared utilities
    - Integration tests

5. **Merge backend PR**
    - Now backend can successfully install shared package from registry

### Agent Automation Rules

When the coding agent creates a PR that touches both `shared/` and `backend/`:

1. **Detect cross-package change:**

    ```bash
    git diff main..HEAD --name-only | grep -q '^shared/' && \
    git diff main..HEAD --name-only | grep -q '^backend/' && \
    echo "CROSS-PACKAGE DETECTED"
    ```

2. **Automatically split into two branches:**

    ```bash
    # Stage 1: Shared-only branch (current PR)
    git checkout <current-branch>
    git reset --soft <first-shared-commit>
    # Keep only shared/ changes

    # Stage 2: Backend integration branch
    git checkout -b feat/<name>-backend-integration
    # Rebase backend commits onto main
    # Update backend/package.json to reference new shared version
    ```

3. **Update PR descriptions:**
    - Stage 1 PR: Mark as "Part 1: Shared package changes"
    - Add note: "Backend integration will follow in separate PR after publish"
    - Stage 2 PR: Reference stage 1 PR number, note dependency on published version

4. **Prevent merge until ready:**
    - Stage 2 PR stays as draft until stage 1 is merged + published
    - Add comment with command to verify publication

### Manual Split Process (User-Initiated)

If agent creates combined PR before automation:

```bash
# 1. Save backend work
git checkout -b feat/<name>-backend-integration origin/<pr-branch>

# 2. Reset original branch to remove backend
git checkout <pr-branch>
git reset --soft <last-shared-commit>
git restore --staged backend/

# 3. Force-push shared-only PR
git push --force-with-lease

# 4. Prepare backend branch
git checkout feat/<name>-backend-integration
git rebase --onto main <last-shared-commit>
# Update backend/package.json version reference
git add backend/package.json && git commit --amend --no-edit
```

### Exceptions

Single PR acceptable only if:

- Shared changes are trivial hotfix (typo, comment)
- No version bump required
- Backend already compatible with current shared version

### Detection Heuristics

Agent should split when PR includes:

- ✅ New exports in `shared/src/index.ts`
- ✅ Version bump in `shared/package.json`
- ✅ New imports in backend from `@piquet-h/shared`
- ✅ Backend code using newly-added shared functions

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
Self QA: Build PASS | Lint PASS | Tests 12/12 | Edge Cases Covered yes | Assumptions Logged yes
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

Epic must NOT contain implementation acceptance criteria; it is closed only when all child issues closed (automation can verify via checklist).

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

Last reviewed: 2025-10-29

---

## 18. Facet Segregation Policy (Authoritative)

Purpose: Enforce durable separation between immutable player experience semantics (Concept), technical mechanics (Architecture), mutable planning (Execution), and guiding rationale (Vision & Tenets). Prevent leakage that couples long‑term invariants with short‑term implementation detail.

### 18.1 Facet Taxonomy & Directories

| Facet           | Directory / File            | Core Intent                                           | Mutation Frequency |
| --------------- | --------------------------- | ----------------------------------------------------- | ------------------ |
| Concept         | `docs/concept/`             | Invariants, tone, systemic truths                     | Low                |
| Architecture    | `docs/architecture/`        | Technical design, persistence, integration flows      | Medium             |
| Execution       | `docs/execution/`           | Milestones, issue clusters, implementation sequencing | High               |
| Vision & Tenets | `docs/vision-and-tenets.md` | Product purpose, decision tenets, experience pillars  | Very low           |

### 18.2 Allowed vs Prohibited Content (Concept Facet)

Allowed (Concept):

- Player‑facing systemic invariants (e.g. exit directions, dungeon episodic logic)
- Tone/style guidelines (narration voice, persona interpretation boundaries)
- Normalization rules (direction resolution semantics)
- Rationale for immutable experiential constraints

Prohibited (Concept):

- Implementation sequencing (milestones, sprints, backlog lists)
- Architecture mechanics (Cosmos partition details, function trigger bindings)
- Telemetry enumeration plans
- Performance tuning notes
- Unvalidated speculative future systems (archive separately)
- Inline acceptance criteria / task checklists

Planning / leakage indicator verbs (blockers if appearing in Concept docs): `implement`, `sequence`, `schedule`, `sprint`, `backlog`, `dependency`, `milestone`, `roadmap`, `optimize`, `telemetry task`, `story points`, `spike`.

### 18.3 Mutation Rules

1. Concept changes must reflect real shifts (not aspirational speculation).
2. If a Concept change alters contracts or persistence assumptions → add/update ADR and cross‑link.
3. Vision & Tenets updates require explicit justification referencing an external driver (user feedback, design review). Avoid churn.
4. Execution facet may restructure freely WITHOUT modifying Concept wording for sequencing convenience.
5. Architecture docs may link to Concept docs by filename ONLY (no content duplication).

### 18.4 Cross‑Facet Linking Guidelines

Use relative links referencing filenames; never paste large blocks across facets. Example:
`See gameplay invariants in ../concept/exits.md` (✔) vs copying the exit direction table (✘).

### 18.5 Agent Workflow Before Editing Docs

```
Facet Decision Flow:
Input path →
    if path starts with docs/concept/ → apply Concept rules (reject planning leakage)
    else if path starts with docs/execution/ → ensure no invariants duplicated from concept
    else if path starts with docs/architecture/ → ensure technical detail only, add ADR link if changing structure
    else if path == docs/vision-and-tenets.md → require justification & minimal diff
```

PRE‑EDIT CHECKLIST (Agent):

- Identify facet from path.
- Search for prohibited verbs (case‑insensitive) if Concept.
- Confirm no milestone tables inside Concept.
- If adding new invariant heading in Concept → prepare atomic issue (script will also detect).
- If editing Tenets → run dry diff to ensure only intended lines change.

### 18.6 Automation Integration

The script `scripts/generate-concept-issues.mjs` + workflow `concept-issue-generator.yml` enforce detection for:

- InvariantAdded / InvariantRemoved
- SystemScopeExpanded (new headings)
- TenetAddedOrModified
- CrossFacetLeak (planning verbs)

Opt‑out for benign editorial edits: add `<!-- concept-automation:ignore -->` to the changed line.

### 18.7 ADR Escalation Triggers

Create / update an ADR when a Concept change:

- Alters persistence schema expectations (e.g., introducing new vertex/edge category).
- Modifies traversal rules impacting existing function validation.
- Introduces cross‑system dependency (e.g., economy influencing dungeon seed logic).

### 18.8 Review Heuristics (PR Level)

Reviewer / Agent should confirm:

- Concept diff contains no planning verbs or issue sequencing.
- Execution changes do not re‑declare invariants (link instead).
- Architecture additions reference Concept but do not restate narrative tone.
- Tenet modifications include rationale line in PR description.
- No duplication: same invariant table exists only once (Concept).

### 18.9 Common Violations & Remedies

| Violation                                    | Remedy                                                                  |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Milestone list added to Concept doc          | Move to `docs/execution/` and replace with invariant rationale sentence |
| Partition key detail placed in Concept       | Relocate to `docs/architecture/persistence` document                    |
| Tone guide pasted into Architecture overview | Replace with single link to `../concept/dungeon-master-style-guide.md`  |
| Tenet weakened without rationale             | Add PR comment referencing user need or design principle                |

### 18.10 Agent Enforcement Summary

When editing any doc within `docs/concept/`:

- Abort adding implementation checklists.
- Suggest relocation for any architecture or execution fragment detected.
- Provide a dry run of concept issue generation (optional) if invariants change.

### 18.11 Definition of Done (Facet Change)

- Facet identification logged in response.
- No prohibited verbs (Concept facet).
- ADR linked if contract/persistence changed.
- Automation script would classify change correctly (manual dry run optional).
- Diff minimal (only lines requiring semantic update).

### 18.12 Future Enhancements (Non‑Blocking)

- Semantic similarity scan to prevent partial invariant duplication.
- Automatic ADR stub creation when new vertex/edge pattern introduced.
- Epic bundling if >3 related headings added in one PR.

---

Last reviewed (Facet Policy section): 2025-10-31
