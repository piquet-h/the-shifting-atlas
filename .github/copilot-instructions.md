# The Shifting Atlas – Copilot Operating Guide (Compact)

Source of truth for daily generation. Archived full version: `./copilot-instructions.full.md`. Quick mnemonic: `./copilot-quickref.md`.

---

## 1. Platform Architecture

Frontend: Azure Static Web Apps (React + Vite + Tailwind)
Backend: Azure Functions (HTTP player actions + queue world logic)
API: Azure API Management
Messaging: Azure Service Bus
Data: Cosmos DB (Gremlin) – Vertices: Locations, Players, NPCs, Events (edges for relations)
Observability: Application Insights
Principle: Event‑driven, stateless functions, no polling loops.

---

## 2. Repo Layout (Essentials)

- `frontend/` SWA client
- `backend/` Functions (`functions/`, `shared/` utilities)
- `shared/` Cross‑package domain models + telemetry
- `scripts/` Automation (ordering, labels, seed)
- `roadmap/implementation-order.json` Canonical execution order
- `docs/` Design & narrative sources

---

## 3. Modeling Rules

IDs: GUID always.
Vertex types: Locations, Players, NPCs, Events.
Edges: semantic (e.g., `exit_north`, `owns_item`).
Exits: allowed directions set (north,south,east,west,up,down,in,out).
Player action flow: HTTP validate → persist → enqueue world event.
World evolution: queue triggers only.

---

## 4. Coding Conventions

ES Modules everywhere.
Async/await for all I/O.
Function naming: `<Trigger><Action>` (`HttpMovePlayer`, `QueueProcessNPCStep`).
Single responsibility per Function.
Telemetry event names centralized (no inline literals).
Comment only domain nuance or cross-service contract.

---

## 5. Telemetry

Use shared telemetry helper + constant enum.
Include correlation IDs across chained events.
Avoid noisy high‑cardinality ad‑hoc logs.

---

## 6. AI / Prompts

Store prompts under `shared/src/prompts/`.
Reference doc filenames instead of pasting lore blocks.

---

## 7. Issue & Roadmap Taxonomy

Exactly 1 scope + 1 type label.
Scopes: `scope:core|world|traversal|ai|mcp|systems|observability|devx|security`.
Types: `feature|enhancement|refactor|infra|docs|spike|test`.
Milestones: M0 Foundation → M5 Systems (narrative stages).
Ordering: `roadmap/implementation-order.json` → sync script updates Project + `docs/roadmap.md`.
Status field: `Todo|In progress|Done`.
Never use legacy `area:*`, `phase-*`, `priority:*`.

---

## 8. Implementation Order Commands

```bash
npm run sync:impl-order:validate
npm run sync:impl-order:apply
npm run sync:impl-order:next   # list upcoming (default 3)
npm run sync:labels            # reconcile labels
```

Guidelines: Append when possible; resequence only for narrative clarity; keep integers contiguous.

---

## 9. Code Generation Heuristics

1. Identify trigger (HTTP/Queue) → choose template.
2. Import domain models (don’t redefine shapes).
3. Validate exits via shared direction validator.
4. Use telemetry constants; add new only in shared enumeration.
5. Cosmos ops idempotent where possible; avoid duplicate edges.

---

## 10. Testing Baseline

Provide tests for: happy path, invalid direction, missing player ID.
Run lint + typecheck before commit; CI blocks on ordering drift & labels.

---

## 11. Drift Control

Compact guide stable; long narrative stays in `docs/`.
Any new scope/milestone: update labels + roadmap + this file (minimal diff) + reference ADR.

---

## 12. “Next Up” Algorithm

Filter non-`Done` → lowest Implementation order → earliest milestone → scope priority (`core > world > traversal > ai > others`). Prefer not starting parallel if one `In progress` exists unless asked.

---

## 13. Anti‑Patterns

Polling loops; inline telemetry names; multiple scope labels; lore dumps in code; uncontrolled edge duplication; skipping direction validation.

---

## 14. Glossary (Micro)

Exit: directional traversal edge.
Event vertex: persisted world action for timeline queries.
Implementation order: enforced execution sequence.
Scope label: high-level functional grouping.
Status: lightweight progress state powering “Next Up”.

---

## 15. Update Checklist

1. Change design / ADR.
2. Amend this compact guide & quickref (minimal diff).
3. Sync labels / regenerate roadmap.
4. Note change in PR description.

---

Full historical version: `./copilot-instructions.full.md` | Quick reference: `./copilot-quickref.md`

---

## 16. Agent Commit Policy

Default mode: STAGE ONLY.

The agent may edit files and run tests, then stage changes (git add) but must NOT create a commit or push unless one of the explicit approval signals is present in the most recent user message:

- Phrase contains: `commit now` OR `apply and commit` OR `open PR`.
- Or user requests a "PR" / "pull request" (then create feature branch + open PR, not direct commit to `main`).

Rules:

1. Documentation & refactors: stage only; wait for approval.
2. Failing build or tests caused by prior agent change: the agent may commit a minimal fix (after stating intent) if user is inactive.
3. Security / license / clearly broken hotfix: stage and request confirmation unless user already flagged urgency.
4. Never force‑push; do not amend user commits.
5. If there are staged changes pending >1 user interaction without approval, remind user succinctly.

Branch Strategy on PR request:
`feat/<short-topic>` or `docs/<short-topic>`; open PR with summary + checklist referencing updated sections.

Audit Trail: Include in PR body (or pending message before commit) a short justification list of modified files.

If ambiguous: ask for clarification instead of committing.
