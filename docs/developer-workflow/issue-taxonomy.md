# Issue Taxonomy

This project uses a **minimal, opinionated label + milestone scheme** to keep boards scannable, automation simple, and cognitive load low. Only four axes exist; resist adding more.

## Axes

| Axis  | Label Prefix         | Allowed Values                                                                                                                                        | Purpose                              |
| ----- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Scope | `scope:`             | `core`, `world`, `traversal`, `ai`, `mcp`, `systems`, `observability`, `devx`, `security`                                                             | High-level functional grouping (≤9). |
| Type  | (none)               | `feature`, `enhancement`, `refactor`, `infra`, `docs`, `spike`, `test`, `bug`                                                                         | Nature of work & WIP policy.         |
| Stage | Milestone (no label) | `M0 Foundation`, `M1 Traversal`, `M2 Data Foundations`, `M3 Core Loop`, `M4 AI Read`, `M5 Quality & Depth`, `M6 Systems`, `M7 Post-MVP Extensibility` | Delivery sequence narrative.         |

Guidelines:

- Exactly one `scope:` and one `type` label per issue.
- `bug` is allowed but should be used only for defects in existing behavior (regressions or incorrect results) – NOT for missing planned features (use `feature` or `enhancement` instead).
- (Removed) Implementation Order numeric field — use milestone + dependency + scope impact instead.
- Stages are GitHub Milestones, not labels.
- No `phase:` / `area:` / `status:` / `priority:` labels; use Project field instead of priority.

## Examples

```text
Title: Implement Cosmos Gremlin Location Upsert
Labels: scope:world, feature
Priority Basis: Milestone (M0) + dependency (blocks player traversal)
Milestone: M0 Foundation
```

```text
Title: MCP Read-Only Servers (WorldContext, Lore, classification)
Labels: scope:mcp, feature
Priority Basis: Milestone (M4) + enables AI read capabilities
Milestone: M4 AI Read
```

```text
Title: Direction Normalization Utility (N1)
Labels: scope:traversal, feature
Priority Basis: Milestone (M1) + foundational normalization utility
Milestone: M1 Traversal
Internal Sub-Phase: N1 (do NOT label) – basic lexical normalization.
```

## Internal Sub-Phases

Module documents may still reference internal sub-phase codes (e.g., traversal normalization N1..N5). These are **documentation constructs only** and never appear as labels.

## Maintenance Checklist

1. Keep exactly one `scope:` and one type label per issue.
2. Use milestones only for actively planned work.
3. Consolidate or close duplicate long-tail items promptly.

## Automation (Future)

- Lightweight Action validation: exactly one `scope:` + one type label present.
- Changelog grouping: order by Milestone then by `scope:` (no numeric ordering field).

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
3. Uses any non-standard axis labels (anything outside the defined scope/type sets).

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
assert noUnexpectedLabels();
```

> Faceted / secondary labels (e.g. `facet:security`) are intentionally **not** introduced until a sustained filtering need emerges; premature facets reduce signal density.
