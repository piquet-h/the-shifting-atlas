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
- `scripts/` Automation (ordering, labels, seed)
- GitHub Project (v2) numeric field `Implementation order` – canonical execution sequence (single source of truth; any JSON snapshots are auxiliary only)
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

Use shared telemetry helper + constant enum.
Include correlation IDs across chained events.
Avoid noisy high‑cardinality ad‑hoc logs.

---

## 7. AI / Prompts

Store prompts under `shared/src/prompts/`.
Reference doc filenames instead of pasting lore blocks.
World content generation: see `.github/instructions/world/.instructions.md`.

---

## 8. Issue & Roadmap Taxonomy

Exactly 1 scope + 1 type label.
Scopes: `scope:core|world|traversal|ai|mcp|systems|observability|devx|security`.
Types: `feature|enhancement|refactor|infra|docs|spike|test`.
Milestones: M0 Foundation → M5 Systems (narrative stages).
Ordering: Project v2 field `Implementation order` (numeric) → sync script regenerates `docs/roadmap.md`.
Status field: `Todo|In progress|Done`.
Never use legacy `area:*`, `phase-*`, `priority:*`.

**Automated Assignment**: New issues automatically receive implementation order based on Copilot analysis of labels, milestones, and content. See `docs/developer-workflow/implementation-order-automation.md` for details.

---

## 9. Implementation Order Commands

```bash
npm run sync:impl-order:validate
npm run sync:impl-order:apply
npm run sync:impl-order:next   # list upcoming (default 3)
npm run sync:labels            # reconcile labels
```

Guidelines: Append when possible; resequence only for narrative clarity; keep integers contiguous.

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
Run lint + typecheck before commit; CI blocks on ordering drift & labels.

---

## 12. Drift Control

Compact guide stable; long narrative stays in `docs/`.
Any new scope/milestone: update labels + roadmap + this file (minimal diff) + reference ADR.

### Roadmap & Status Guardrails (Do NOT Manual Edit)

`docs/roadmap.md` is an auto-generated artifact. Its single source of truth is the **GitHub Project v2 numeric field** `Implementation order` plus live issue labels/status. A scheduled GitHub Action (`roadmap-scheduler.yml`) and the sync scripts (`npm run sync:impl-order:*`) rebuild it. **Agents and contributors must not manually modify**:

- The ordering numbers in `docs/roadmap.md`
- Status values (Todo/In progress/Done) inside `docs/roadmap.md`
- The file header comment indicating it is auto-generated

Instead:

1. Adjust labels (scope / type) or issue status in GitHub for status changes.
2. Change ordering by editing the Project field directly (inline edit or bulk). The next sync will refresh artifacts.
3. Run `npm run sync:impl-order:validate` locally if needed; let CI / the scheduled workflow publish the rendered `docs/roadmap.md`.

If a user explicitly asks to “edit roadmap.md” or to change a status directly, respond by proposing the change to ordering file or labels and DO NOT patch `docs/roadmap.md` manually. Only proceed with a manual diff to that file if the user includes an explicit override phrase: `override roadmap manually`.

Automation will treat any unapproved manual diff to `docs/roadmap.md` as drift and may overwrite it; avoid churn.

---

## 13. “Next Up” Algorithm

Filter non-`Done` → lowest Implementation order → earliest milestone → scope priority (`core > world > traversal > ai > others`). Prefer not starting parallel if one `In progress` exists unless asked.

---

## 14. Anti‑Patterns

Polling loops; inline telemetry names; multiple scope labels; lore dumps in code; uncontrolled edge duplication; skipping direction validation.

---

## 15. Glossary (Micro)

Exit: directional traversal edge.
Event vertex: persisted world action for timeline queries.
Implementation order: enforced execution sequence (stored in Project field, not JSON file).
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
