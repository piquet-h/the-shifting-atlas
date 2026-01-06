# M4a: AI Infrastructure — Temporary Roadmap / Checklist

> **Temporary**: This is a working checklist meant for day-to-day progress. When M4a closes, either delete this file or replace it with a proper closure summary.
>
> Last updated: 2026-01-07

## How to use

- Treat this as the **recommended execution order**.
- Tick items here as you complete them **and** close the corresponding GitHub issues.
- M4a currently contains several loosely-related tracks; the ordering below prioritizes **shared infrastructure that unblocks everything else**.

---

## 1 Prompt Template Registry (primary M4a deliverable)

Epic: **#388 — Prompt Template Registry**

The core dependency chain is: **define schema + storage + hashing/integrity → retrieval API → rollout/experiments + telemetry → migration + docs**.

### 1.1 Establish schema/env alignment and PK correctness (fail fast)

These guardrails prevent drift between infra ↔ code and prevent accidental cross-partition access.

- [x] #699 — Test: Verify Cosmos SQL container partition keys match expected schema
- [x] #624 — Prompt Template Schema & Versioning Model (env var + layers/events container wiring; includes `/locationId` PK requirements)
- [x] #627 — worldEvents scopeKey contract & PK correctness _(enforce `loc:`/`player:` patterns + `/scopeKey` PK correctness + tests)_

### 1.2 Implement registry storage + loader (source of truth)

- [x] #625 — Prompt Template Storage (FILE-BASED under `shared/src/prompts/` + validation + bundle + loader)

> Note: #625 also references a migration CLI; #630 expands that into a dedicated migration script.

### 1.3 Retrieval API for runtime consumers

- [ ] #626 — Prompt Template Retrieval API (Backend Function)

### 1.4 Experiments and observability hooks

- [ ] #628 — Prompt Template A/B Testing Scaffold (Variant Selection)
- [ ] #629 — Prompt Template Cost Telemetry Integration

### 1.5 Migration and documentation

- [ ] #630 — Prompt Template Migration Script (Existing → Registry)
- [ ] #631 — Prompt Template Documentation & Usage Examples

---

## 2) MCP read-only infrastructure (often paired with AI infrastructure)

Epic: **#387 — Epic: MCP Server Implementation**

The core dependency chain is:

**foundation → context ops → graph/timeline ops → tool surface + tests → docs/telemetry/security rails**

### 2.1 Core server + world context operations (read-only)

- [ ] #38 — MCP Read-Only Servers: world-query & lore-memory _(scaffold)_
- [ ] #514 — [MCP] World Context Server Foundation
- [ ] #515 — [MCP] Location, Player & Atmosphere Context Operations _(depends on #514)_
- [ ] #516 — [MCP] Spatial Graph & Event Timeline Operations _(depends on #514, #515)_

### 2.2 MCP tool surface (consumer-facing operations)

- [ ] #425 — MCP World Query Tools (Read-Only Location/Exit/Player) _(depends on #514+)_
- [ ] #426 — MCP Prompt Template Access Tools _(depends on Prompt Template Registry track)_
- [ ] #427 — MCP Telemetry Query Tools (App Insights)
- [ ] #430 — MCP Server Integration Tests

### 2.3 Documentation + telemetry + security rails

- [ ] #431 — MCP Server Documentation (Architecture + Client Guide)
- [ ] #432 — MCP Server Telemetry Events
- [ ] #428 — MCP Server Authentication (API Key-Based)
- [ ] #429 — MCP Server Rate Limiting (Token Bucket)
- [ ] #580 — enhancement(security): MCP rate limiting interface placeholder

### 2.4 Observability follow-through (supports MCP + AI)

- [ ] #577 — enhancement(observability): Stage M3 MCP telemetry event constants _(observability-owned; used by dashboards/workbooks)_
- [ ] #570 — infra(observability): AI usage workbook stub _(blocked by #577)_

> Note: There are overlapping prompt/schema utilities between MCP and the prompt registry track (e.g., #575 vs #624). Prefer merging or closing duplicates rather than implementing parallel paths.

> Heads-up: Several of these are labeled “M3 AI Read” in their bodies, but are currently assigned to M4a. This file keeps them here as long as the milestone does.

---

## 3) Validation + safety rails for AI outputs (recommended early)

These reduce risk of persisting bad AI outputs (schema-violations or unsafe text) and tend to be reusable across multiple features.

- [ ] #39 — AI Structured Response Validator & Schema Gate
- [ ] #47 — AI Moderation Pipeline Phase 1

---

## 4) Supporting registries / prompt scaffolds

These are “boring but powerful”: they keep taxonomy stable and stop drift across prompts and content generation.

- [ ] #36 — Biome & Environmental Tag Registry Scaffold
- [ ] #325 — Prompt Scaffold & Persona Injection

---

## 5) Items de-scoped from M4a (removed from the milestone)

These were previously assigned to M4a in GitHub, but they are not dependencies of AI infrastructure. They have been removed from the M4a milestone so this checklist remains a dependency-ordered execution plan.

- #472 — Epic: D&D 5e Agent Framework Foundation _(now in M4c Agent Sandbox; depends on MCP context)_
- #322 — Epic: Playable MVP Experience Loop _(cross-cutting coordination epic)_
- #68 — Epic: Layer Validator & Similarity Guardrails _(likely aligns with M5 Quality & Depth)_
- #67 — Epic: Ambient Context Registry _(likely aligns with M5 or a later AI milestone depending on usage)_
- #52 — Epic: Learn More Page & Automated Content _(scope:devx/docs)_
- #53 — Rooms discovered should be dynamic and renamed _(frontend UX enhancement)_
- #46 — DEPRECATED: Telemetry MCP Server (Read-Only)
- #77 — [SPLIT] Player SQL Projection (tracking issue)
- #138/#139/#140/#141 — DevX anomaly/suppression tooling

---

## Milestone exit checks (manual)

When you think M4a is “done”, sanity-check:

- [ ] Prompt templates can be authored in-repo, validated in CI, hashed deterministically, and loaded at runtime.
- [ ] A consumer can retrieve prompts by id + version (and optionally by hash), with ETag/304 behavior.
- [ ] Drift guards are in place (container PK checks + env-var validation) to prevent runtime surprises.
- [ ] At least one AI call path can attribute telemetry to a prompt template version (even if partial coverage initially).
