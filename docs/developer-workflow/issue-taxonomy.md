# Issue Taxonomy (Unified)

> Last updated: 2025-09-27 – Simplified from legacy `area:*`, `phase-*`, extended `priority:*` sets and ad‑hoc milestone naming.

This project uses a **minimal, opinionated label + milestone scheme** to keep boards scannable, automation simple, and cognitive load low. Only four axes exist; resist adding more.

## Axes

| Axis       | Label Prefix             | Allowed Values                                                                                  | Purpose                              |
| ---------- | ------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| Scope      | `scope:`                 | `core`, `world`, `traversal`, `ai`, `mcp`, `systems`, `observability`, `devx`, `security`       | High-level functional grouping (≤9). |
| Type       | (none)                   | `feature`, `enhancement`, `refactor`, `infra`, `docs`, `spike`, `test`, `bug`                   | Nature of work & WIP policy.         |
| Stage      | Milestone (no label)     | `M0 Foundation`, `M1 Traversal`, `M2 Observability`, `M3 AI Read`, `M4 AI Enrich`, `M5 Systems` | Delivery sequence narrative.         |
| Impl Order | Project Field (no label) | Positive integers (1,2,3,...) assigned in Project                                               | Explicit execution sequence.         |

Guidelines:

- Exactly one `scope:` and one `type` label per issue.
- `bug` is allowed but should be used only for defects in existing behavior (regressions or incorrect results) – NOT for missing planned features (use `feature` or `enhancement` instead).
- Implementation Order is managed as a numeric Project custom field (NOT a label). Lower number = earlier execution; gaps allowed for later insertion.
- Stages are GitHub Milestones, not labels.
- No `phase:` / `area:` / `status:` / `priority:` labels; use Project field instead of priority.

## Legacy Mapping

| Legacy                | New                                        |
| --------------------- | ------------------------------------------ |
| `phase-0` / "Phase 0" | Milestone `M3 AI Read`                     |
| `phase-1`             | `M4 AI Enrich`                             |
| `phase-2` proposals   | `M5 Systems` (or future `M6` if needed)    |
| `area:telemetry`      | `scope:observability`                      |
| `area:persistence`    | `scope:world`                              |
| `priority:P3`, `P4`   | (Removed) – use Implementation Order field |

## Examples

```text
Title: Implement Cosmos Gremlin Location Upsert
Labels: scope:world, feature
Implementation Order: 1
Milestone: M0 Foundation
```

```text
Title: MCP Read-Only Servers (world-query, prompt-template, telemetry)
Labels: scope:mcp, feature
Implementation Order: 7
Milestone: M3 AI Read
```

```text
Title: Direction Normalization Utility (N1)
Labels: scope:traversal, feature
Implementation Order: 3
Milestone: M1 Traversal
Internal Sub-Phase: N1 (do NOT label) – basic lexical normalization.
```

Historical Notes:

- 2025-09-27: All labels previously prefixed with `kind:` (e.g. `kind:feature`, `kind:test`) were renamed to bare forms (`feature`, `test`).
- 2025-09-27 (later): Removed `priority:` axis; replaced with Project numeric field "Implementation Order" (lower=earlier). Existing `priority:P0` items assigned initial contiguous order seeds.
- 2025-09-28: Added `bug` to allowed type set (previously used implicitly) and documented usage boundary.
- 2025-10-02: Consolidated legacy `documentation` label into canonical `docs` (one-off via GitHub API; no ongoing script logic required).

## Internal Sub-Phases

Module documents may still reference internal sub-phase codes (e.g., traversal normalization N1..N5). These are **documentation constructs only** and never appear as labels.

## Migration Checklist

1. Delete deprecated labels (`area:*`, `type:*`, `phase:*`, `status:*`, `priority:*`).
2. Ensure bare type labels (`feature`, `enhancement`, `refactor`, `infra`, `docs`, `spike`, `test`) exist (run `npm run sync:labels`).
3. Bulk remove all `priority:*` labels from issues.
4. Add/Populate Project field "Implementation Order" with initial sequence (e.g. order existing foundation work 1..N).
5. Assign milestones only to actively planned work (avoid parking lot milestones).
6. Merge or close duplicate long-tail items; prefer fewer, clearer tickets.

## Automation (Future)

- Lightweight Action validation: exactly one `scope:` + one type label present; Implementation Order field defined (non-empty) for non-draft issues.
- Changelog grouping: order by Milestone then by Implementation Order then by `scope:`.

## Rationale

A constrained taxonomy forces deliberate prioritization, keeps dashboards readable, and lowers onboarding friction. Simplicity compounds: fewer labels → less triage time → more shipping.

> Change this taxonomy only with a documented ADR if a new strategic axis emerges.

## Cross-Cutting Work & Single-Scope Policy

We intentionally enforce **exactly one** `scope:` label and **exactly one** `type` label per issue.

### Why Not Multiple Scopes?

- Priority scoring stays deterministic (no double-count / averaging logic).
- Velocity metrics by scope remain truthful (no inflated counts for shared work).
- Grooming friction avoided (“which 3 scopes apply?” → pick the _dominant_ domain or split work).
- Automation (implementation‑order assignment, dashboards) stays simple and predictable.

### Choosing the Single Scope (Heuristic)

Pick the scope answering: _Where does the primary responsibility for the core change live?_

1. World model / player identity → `scope:world`
2. Movement, exits, direction parsing → `scope:traversal`
3. Prompt assembly / model schema / AI governance → `scope:ai`
4. MCP protocol surface / tool servers → `scope:mcp`
5. Runtime platform, scheduling, queues → `scope:systems`
6. Measurement / structured telemetry → `scope:observability`
7. Developer tooling / build / scripts / DX docs → `scope:devx`
8. Security, validation, rate limits → `scope:security`
9. Truly foundational generic concern (rare) → `scope:core` (add only if unavoidable; prefer splitting otherwise)

If an issue _legitimately_ spans unrelated domains, create thin child issues (each with its own scope) and an optional parent tracking issue (choose the most central scope or `scope:systems`).

### Why One Type Label?

Types anchor WIP policies (e.g., limit concurrent `spike`). Combining (`bug+feature`) dilutes exit criteria and reporting clarity. If a spike becomes delivery work: close the spike (summary in comment) and open a new `feature` issue.

## Validation Rules

Automated validation (script / Action) SHOULD fail an issue when:

1. Not exactly one `scope:` label.
2. Not exactly one allowed `type` label.
3. Uses any deprecated axis (`phase:*`, `area:*`, `priority:*`, `status:*`).

### Skip / Allow List (Non-Enforcing Cases)

Some _ephemeral or auto-generated diagnostic_ issues can be excluded from validation to avoid noise:

Skip Criteria (any true):

- Title matches `/^DI Suitability Report/` (automated scan output).
- Title matches `Only create DI Suitability Issue if needed` (meta follow-up).
- Issue has label `docs` AND title contains `Report` AND was authored by `github-actions` (future pattern).

Even when skipped, adding a canonical scope + type is **recommended** for consistency (we currently backfilled them). If skip patterns become broad, introduce a dedicated non-priority label (e.g. `ephemeral`) via ADR first.

Pseudo-Validation Outline:

```text
if (isSkip(issue)) return PASS (informational);
assert exactlyOne(scopeLabels);
assert exactlyOne(typeLabels ∩ ALLOWED_TYPES);
assert noDeprecatedLabels();
```

> Faceted / secondary labels (e.g. `facet:security`) are intentionally **not** introduced until a sustained filtering need emerges; premature facets reduce signal density.
