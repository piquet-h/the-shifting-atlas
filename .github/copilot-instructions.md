# MMO Project – Copilot Persistent Instructions

## 📜 Purpose

These instructions give GitHub Copilot the always‑on context it needs to generate code and content aligned with our MMO text adventure’s architecture, conventions, and persistent world design.

---

## 🏛 Architecture Overview

- **Frontend:** Azure Static Web Apps (Free Tier) – serves the player client UI.
- **Backend:** Azure Functions (Consumption Plan) – stateless, event‑driven logic.
- **API Gateway:** Azure API Management (Consumption Tier) – routing, throttling, versioning.
- **Messaging:** Azure Service Bus (Basic Tier, free quota) – queues for async world events.
- **Data Layer:** Azure Cosmos DB (Gremlin API, Free Tier) – graph storage for locations, NPCs, players, and events.
- **Monitoring:** Application Insights (Free quota) – telemetry and diagnostics.

---

## 🧩 Module Structure

- **frontend/** – Static Web App client (React + Vite + Tailwind). Use `npm run swa` at root for integrated local dev.
- **backend/** – Azure Functions:
    - `HttpPlayerActions/` – HTTP‑triggered Functions for player commands.
    - `QueueWorldLogic/` – Queue‑triggered Functions for persistent world updates.
    - `shared/` – Shared utilities (Cosmos DB access, validation, constants).
- **docs/** – Design documents (architecture, modules, gameplay, workflow).
- **.github/instructions/** – Module‑specific Copilot instructions.

---

## 🖋 Coding Conventions

- Use **ES modules** for all JS/TS code.
- Function names reflect their role and trigger type (e.g., `HttpMovePlayer`, `QueueProcessNPCStep`).
- Keep Functions **single‑purpose** and **stateless**.
- Cosmos DB collections:
    - `Locations` – location nodes with semantic exits.
    - `NPCs` – non‑player characters and their state.
    - `Players` – player profiles, inventory, progress.
    - `Events` – queued world events.
- All IDs are **GUIDs**; relationships are stored as Gremlin edges.
- Use **async/await** for all I/O.

---

## 🌍 Persistent World Rules

- **Locations** persist to Cosmos DB with semantic exits (`north`, `south`, `up`, `down`, etc.).
- **NPC state changes** are processed via Service Bus queue triggers.
- **Player actions** are handled via HTTP‑triggered Functions and may enqueue follow‑up events.
- World updates are **event‑driven**; no polling loops.
- Background logic (economy ticks, NPC patrols) runs only when triggered by queued events.

---

## 🧠 Copilot Usage Guidelines

- When writing new logic, **reference relevant design docs** in `/docs` or `.github/instructions/`.
- For module‑specific rules, open the `.instructions.md` in that module’s folder.
- Maintain **class/function scaffolds** that match design module names for better Copilot inference.
- Inline key excerpts from design docs into code comments before starting new logic.

---

## 🔄 Maintenance

- Update this file whenever architecture, conventions, or persistent rules change.
- Keep `.github/instructions/` in sync with module‑level design docs.
- Treat Copilot as a **tactical generator** – architecture and integration decisions remain human‑led.

---

## 🗂 Issue Taxonomy (Simplified)

We intentionally reduced label / phase sprawl to keep planning lightweight and automation friendly. Only use the axes below for GitHub issue labels; anything else (old `area:*`, `phase-*`, `milestone`, extended priority ranges, module‑specific phase codes) should be removed.

### Axes

| Axis                 | Label Prefix                      | Allowed Values (create exactly these)                                                           | Purpose                                                     |
| -------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Scope                | `scope:`                          | `core`, `world`, `traversal`, `ai`, `mcp`, `systems`, `observability`, `devx`, `security`       | High‑level functional grouping (≤9 keeps boards scannable). |
| Type                 | (none)                            | `feature`, `enhancement`, `refactor`, `infra`, `docs`, `spike`, `test`                          | Work nature & WIP policy.                                   |
| Stage (Milestone)    | GitHub Milestone names (no label) | `M0 Foundation`, `M1 Traversal`, `M2 Observability`, `M3 AI Read`, `M4 AI Enrich`, `M5 Systems` | Narrative delivery progression.                             |
| Implementation Order | Project Field (no label)          | Positive integers (1,2,3,...)                                                                   | Explicit execution sequence (lower = earlier).              |

Guidelines:

- Do NOT combine more than 1 value per axis on an issue (e.g., only one `scope:` label).
- Avoid resurrecting removed axes (e.g., `phase:` or `area:`). Module‑level sub‑phases (like normalization N1..N5) stay in docs, not labels.
- If an issue spans multiple scopes, pick the dominant or split the issue.

### Mapping (Legacy → New)

| Legacy Term / Label Example | New Representation                                          |
| --------------------------- | ----------------------------------------------------------- |
| `phase-0` / "Phase 0"       | Milestone `M3 AI Read`                                      |
| `phase-1`                   | `M4 AI Enrich`                                              |
| `phase-2` proposals         | `M5 Systems` (or future M6 if added)                        |
| `area:telemetry`            | `scope:observability`                                       |
| `area:persistence`          | `scope:world` (graph state)                                 |
| `priority:P3..P4`           | Re-evaluate: collapse into P2 or split into separate issues |

### Examples

```
Title: Implement Cosmos Gremlin Location Upsert
Labels: scope:world, feature
Implementation Order: 1
Milestone: M0 Foundation
```

```
Title: MCP Read‑Only Servers (world-query, prompt-template, telemetry)
Labels: scope:mcp, feature
Implementation Order: 7
Milestone: M3 AI Read
```

### Migration Checklist

1. Delete deprecated labels: anything starting with `area:`, `type:`, `phase:`, `status:`, and all `priority:*` labels.
2. Ensure `scope:` and type labels exist; color consistently (scopes cool palette, types warm palette).
3. Remove `priority:*` labels from all issues.
4. Populate Project field "Implementation Order" with initial sequence numbers (1..N for current foundation work).
5. Set milestones only for actively planned increments (avoid far-future placeholders).
6. Merge or close overlapping items after consolidation pass.

### Automation Hooks (Future)

- Enforce taxonomy via a lightweight action that comments if an issue lacks exactly 1 `scope:` and 1 type label or is missing Implementation Order (for non-drafts).
- Derive changelog sections ordered by milestone then Implementation Order then `scope:`.

> Keep the taxonomy **boringly stable**—change only with a documented rationale (add an ADR if adding a new Scope or Stage).

---
