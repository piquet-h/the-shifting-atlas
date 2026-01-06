# M4b World Generation — Temporary Roadmap / Checklist

> **Temporary**: This is a working checklist meant for day-to-day progress. When M4b closes, either delete this file or replace it with a proper closure summary.
>
> Last updated: 2026-01-05

## How to use

- Treat this as the **recommended execution order**.
- When you complete an item, tick the box here **and** close the corresponding GitHub issue.

> Related: **M4a AI Infrastructure** checklist lives in `docs/milestones/M4a-temporary-roadmap.md` (prompt template registry, MCP infra, and AI safety rails). If an item here appears “blocked by AI infra”, check M4a first.

---

## 0) External prerequisites (not in M4b, but block it)

These should be done _first_ because they harden the Cosmos SQL contract and prevent doing world-gen work on a drifting schema.

- [x] #699 — Test: Verify Cosmos SQL container partition keys match expected schema  
       Blocks: #624, #627, #698  
       Outcome: a repeatable check that prevents PK drift (players `/id`, inventory `/playerId`, layers `/locationId`, events `/scopeKey`).

- [ ] #624 — Cosmos SQL env/schema alignment (layers + events env vars + layer PK correctness)
- [ ] #627 — worldEvents scopeKey contract & PK correctness

> Notes:
>
> - These are “fail fast” guardrails. If they’re not done, you risk building world generation against a container that later forces cross-partition queries or fails at runtime.

---

## 1) World generation pipeline (core M4b deliverable)

### 1.1 Data model: make base descriptions first-class layers

- [ ] #698 — Persist base location description as `DescriptionLayer` (SQL API)
    - Depends on: #624
    - Outcome: each location gets exactly one `base` layer item in `descriptionLayers` (PK `/locationId`) and reruns are idempotent.

### 1.2 Shared configuration: terrain guidance

This can be done in parallel with AI batching work, but you’ll want it available before finalizing prompts and neighbor selection logic.

- [ ] #585 — Terrain Guidance Configuration System

### 1.3 AI batching: generate descriptions in bulk

- [ ] #582 — AI Description Batch Generation Service
    - Strongly benefits from: #585 (terrain prompt hints)

### 1.4 Exit inference: turn descriptions into topology

- [ ] #583 — Exit Inference from AI-Generated Descriptions
    - Strongly benefits from: #585 (typical exit count + patterns)

### 1.5 Orchestration: batch generation event handler

Do this after (or at least alongside) #582 and #698, because the handler’s “happy path” is mostly plumbing those pieces together.

- [ ] #584 — `World.Location.BatchGenerate` Event Handler
    - Depends on: #582, #698
    - Uses: #585, #583
    - Note: World event handler registry foundation (#258) is already complete.

---

## 2) M4b “read operations” track (currently in the milestone)

M4b is focused on world-generation. The MCP foundation / read operations previously listed here have been moved to **M4a**.

What remains in M4b is the narrative generator server, which is optional for the core world-gen pipeline but often paired with it.

### 2.1 Narrative generation server (optional, but enables richer world-gen loops)

- [ ] #466 — [MCP] Implement Narrative Generator Server (P0)
    - Depends on: M4a MCP world context servers (#514, #515, #516)
    - Typically depends on: Prompt Template Registry (Epic #388) for versioned prompts

---

## Milestone exit checks (manual)

When you think you’re “done”, verify these end-to-end behaviors (this isn’t a new issue; it’s just the finish line):

- [ ] A world expansion run produces new locations **and** base description layers in `descriptionLayers` (PK `/locationId`).
- [ ] Exits created match inferred topology and do not require cross-partition Cosmos queries.
- [ ] Batch generation is idempotent under retries (no duplicate base layers, no duplicate exits).
