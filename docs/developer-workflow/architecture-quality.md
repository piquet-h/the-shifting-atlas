## Architecture Quality & DI Review Policy

This document formalizes automated architectural quality gates and the Dependency Injection (DI) suitability review surfaced by `di-suitability.yml`.

### Goals

- Proactively identify when introducing a lightweight DI / inversion-of-control mechanism would reduce coupling and test complexity.
- Keep the codebase simple until structural signals justify the added abstraction.
- Provide a transparent, data-driven rationale before adopting any container framework (or building minimal custom wiring utilities).

### Automated Signal Collection

Workflow: `.github/workflows/di-suitability.yml`

Runs:

- Weekly (Monday 05:00 UTC) scheduled scan.
- On PRs that modify significant source areas (`backend/src`, `frontend/src`, `frontend/api/src`, `shared/src`) or the analyzer script / root `package.json`.
- Manual `workflow_dispatch` for ad‑hoc review.

The script (`scripts/di-suitability.mjs`) emits a machine‑readable JSON block delimited by markers used to extract metrics and (when threshold crossed) it opens/updates an issue titled "DI Suitability Report".

### Current Signals (Heuristics)

| Signal                      | Description                                                      | Rationale                                      |
| --------------------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| `highImportFiles`           | Files exceeding import count threshold                           | Potential god-modules / service aggregators    |
| `complexParamFunctions`     | Functions with parameter length / object nesting above threshold | Implicit service locator / manual wiring smell |
| `contextPatternFiles`       | Count of files importing custom context/provider patterns        | Widening implicit dependency surface           |
| `wrapperUsage`              | Utility wrappers around core services proliferating              | Risk of ad-hoc DI re‑implementation            |
| `manualTelemetryEnrichment` | Repeated manual telemetry enrichment logic                       | Candidate for cross-cutting concern injection  |

Threshold constants live in the script; raise only after persistent false positives.

### Recommendation States

| State              | Meaning                                     | Action                                               |
| ------------------ | ------------------------------------------- | ---------------------------------------------------- |
| `NO_ACTION`        | Signals below early-warning thresholds      | Do nothing                                           |
| `OBSERVE`          | Mild upward trend; consolidation possible   | Track; refactor hotspots opportunistically           |
| `REVIEW_SUGGESTED` | Aggregated score crosses adoption threshold | Create/refresh report issue; follow evaluation steps |

The workflow currently opens/updates an issue only on `REVIEW_SUGGESTED` (to limit noise).

### Evaluation Playbook (When `REVIEW_SUGGESTED`)

1. Identify top 3 coupling hotspots (sort by import fan-in & parameter complexity).
2. Attempt a **minimal interface extraction** in a branch (no container yet) for one hotspot.
3. Re-run analyzer; measure delta. If hotspot complexity drops >30% (imports/params) with simple factoring, prefer continuing tactical refactors.
4. If >2 hotspots resist simplification or duplication of wiring patterns persists, draft a DI introduction ADR:
    - Scope (which layers / functions)
    - Chosen mechanism (light factory map vs minimal container library)
    - Replacement plan (incremental adoption path)
    - Telemetry impact (ensure no regression of correlation IDs)
5. Merge ADR, then implement container in `shared/` with:
    - Pure registration module
    - Deterministic test override pattern
    - No runtime reflection / dynamic require

### Constraints & Guardrails

- Avoid large general-purpose IoC frameworks initially; prefer explicit factories or a ~50 LOC registry.
- Do not hide async initialization (Cosmos / Service Bus) inside constructors—return explicit `init()` promises.
- All injected services must have documented interfaces living in `shared/` (avoid interface drift).
- Telemetry enrichment wrappers should be composable and tested independently.

### Success Criteria Post-Adoption

| Metric                                   | Baseline (Pre)       | Target (Post)    |
| ---------------------------------------- | -------------------- | ---------------- |
| Avg imports in hotspot files             | (Record from report) | -20%             |
| Max function parameter count             | (Record)             | -30%             |
| Manual telemetry enrichment duplication  | N occurrences        | 0 or centralized |
| New services added with tests in same PR | < 60%                | > 90%            |

### Exit / Reversal Plan

If DI layer increases complexity without reducing signals over 3 consecutive weekly scans:

1. Freeze new registrations.
2. Inline container-managed services back into call sites using codemods.
3. Remove container module & update ADR with rollback rationale.

### Roadmap Hooks

When a DI review issue is opened, link it in the roadmap Project and apply labels: `scope:devx` + `enhancement`. Implementation order should NOT automatically jump ahead of core gameplay unless refactor blocks feature velocity (manually adjust if blocking).

### Future Enhancements

- Add cyclomatic complexity & depth-of-call metrics.
- Add temporal coupling analysis (files commonly co‑changed in PRs).
- Integrate simplified architectural decision scoring (cost/benefit) into report.

---

_Last updated: Consolidation of implementation order workflows & formalization of DI policy (2025-10-03)._
