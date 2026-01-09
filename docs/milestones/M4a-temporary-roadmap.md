# M4a: AI Infrastructure — Temporary Roadmap / Checklist

> **Purpose**: Day-to-day execution checklist paired with strategic view in `docs/roadmap.md#m4a-ai-infrastructure-sense--decide`.
>
> - **Main roadmap** = strategic overview, dependency graph, exit criteria
> - **This file** = tactical checklist, execution order, progress tracking
>
> Update both when M4a scope changes; update only this file for progress.
>
> Last updated: 2026-01-09

## How to use

- Treat this as the **recommended execution order**.
- Tick items here as you complete them **and** close the corresponding GitHub issues.
- M4a currently contains several loosely-related tracks; the ordering below prioritizes **shared infrastructure that unblocks everything else**.

---

## 1 Prompt Template Registry (primary M4a deliverable)

Epic: **#388 — Prompt Template Registry**

The core dependency chain is: **define schema + storage + hashing/integrity → retrieval API → rollout/experiments + telemetry → migration + docs**.

### 1.1 Establish schema/env alignment and PK correctness (fail fast) ✅

These guardrails prevent drift between infra ↔ code and prevent accidental cross-partition access.

- [x] #699 — Test: Verify Cosmos SQL container partition keys match expected schema ✅ CLOSED
- [x] #624 — Prompt Template Schema & Versioning Model (env var + layers/events container wiring; includes `/locationId` PK requirements) ✅ CLOSED
- [x] #627 — worldEvents scopeKey contract & PK correctness _(enforce `loc:`/`player:` patterns + `/scopeKey` PK correctness + tests)_ ✅ CLOSED

### 1.2 Implement registry storage + loader (source of truth) ✅

- [x] #625 — Prompt Template Storage (FILE-BASED under `shared/src/prompts/` + validation + bundle + loader) ✅ CLOSED

> Migration CLI: #630 expands storage work into dedicated migration script.

### 1.3 Retrieval API for runtime consumers ✅

- [x] #626 — Prompt Template Retrieval API (Backend Function) ✅ CLOSED

### 1.4 Experiments and observability hooks ✅

- [x] #628 — Prompt Template A/B Testing Scaffold (Variant Selection) ✅ CLOSED
- [x] #629 — Prompt Template Cost Telemetry Integration ✅ CLOSED

### 1.5 Migration and documentation (finalization tasks)

- [ ] #630 — Prompt Template Migration Script (Existing → Registry) — _finalization task, not blocking M4a exit_
- [ ] #631 — Prompt Template Documentation & Usage Examples — _finalization task, not blocking M4a exit_

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

## 5) Items moved from M4a (see main roadmap for current homes)

These were previously assigned to M4a in GitHub but are not critical-path dependencies of AI infrastructure. They have been moved to other milestones. See `docs/roadmap.md` for their new locations.

**Moved to M6 Systems:**

- #452-455 — Learn More Page & Automated Content (Epic #52)

**Moved to M4c Agent Sandbox:**

- #472 — Epic: D&D 5e Agent Framework Foundation

**Deferred to M5 or later:**

- #67 — Epic: Ambient Context Registry
- #68 — Epic: Layer Validator & Similarity Guardrails

**Archived/Deprecated:**

- #46 — DEPRECATED: Telemetry MCP Server (Read-Only)
- #77 — [SPLIT] Player SQL Projection (tracking issue)

---

## Milestone exit checks

### Prompt Registry (Core M4a Deliverable) ✅ SUBSTANTIALLY COMPLETE

- [x] Prompt templates authored in-repo (`shared/src/prompts/`), validated in CI, hashed deterministically ✅
- [x] Runtime loader retrieves prompts by id + version + hash ✅
- [x] Container PK checks + env-var validation prevent drift ✅
- [x] Telemetry attributes cost to prompt template version ✅
- [ ] Migration script (#630) + docs (#631) — finalization only, not blocking exit

### MCP Read-Only Infrastructure (Foundation for downstream)

- [ ] World context MCP foundation operational (#514-516)
- [ ] MCP tool surface exposed (#425-427, #430)
- [ ] Authentication + rate limiting configured (#428-429, #580)
- [ ] Telemetry events defined (#432, #577)
- [ ] Documentation complete (#431)

### Validation & Safety Rails

- [ ] AI response validator prevents schema violations (#39)
- [ ] Moderation pipeline blocks unsafe content (#47)
