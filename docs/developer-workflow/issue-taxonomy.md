# Issue Taxonomy (Unified)

> Last updated: 2025-09-27 – Simplified from legacy `area:*`, `phase-*`, extended `priority:*` sets and ad‑hoc milestone naming.

This project uses a **minimal, opinionated label + milestone scheme** to keep boards scannable, automation simple, and cognitive load low. Only four axes exist; resist adding more.

## Axes

| Axis     | Label Prefix         | Allowed Values                                                                                  | Purpose                              |
| -------- | -------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------ |
| Scope    | `scope:`             | `core`, `world`, `traversal`, `ai`, `mcp`, `systems`, `observability`, `devx`, `security`       | High-level functional grouping (≤9). |
| Type     | (none)               | `feature`, `enhancement`, `refactor`, `infra`, `docs`, `spike`, `test`                          | Nature of work & WIP policy.         |
| Priority | `priority:`          | `P0`, `P1`, `P2`                                                                                | Urgency: Now / Next / Later.         |
| Stage    | Milestone (no label) | `M0 Foundation`, `M1 Traversal`, `M2 Observability`, `M3 AI Read`, `M4 AI Enrich`, `M5 Systems` | Delivery sequence narrative.         |

Guidelines:

- Exactly one `scope:` and one `type` label per issue.
- One `priority:` per issue; re-evaluate after each release.
- Stages are GitHub Milestones, not labels.
- No `phase:` / `area:` / `status:` labels; use Projects for status tracking.

## Legacy Mapping

| Legacy                | New                                     |
| --------------------- | --------------------------------------- |
| `phase-0` / "Phase 0" | Milestone `M3 AI Read`                  |
| `phase-1`             | `M4 AI Enrich`                          |
| `phase-2` proposals   | `M5 Systems` (or future `M6` if needed) |
| `area:telemetry`      | `scope:observability`                   |
| `area:persistence`    | `scope:world`                           |
| `priority:P3`, `P4`   | Collapse into `P2` or split issue       |

## Examples

```text
Title: Implement Cosmos Gremlin Location Upsert
Labels: scope:world, feature, priority:P0
Milestone: M0 Foundation
```

```text
Title: MCP Read-Only Servers (world-query, prompt-template, telemetry)
Labels: scope:mcp, feature, priority:P1
Milestone: M3 AI Read
```

```text
Title: Direction Normalization Utility (N1)
Labels: scope:traversal, feature, priority:P0
Milestone: M1 Traversal
Internal Sub-Phase: N1 (do NOT label) – basic lexical normalization.
```

Historical Note: All labels previously prefixed with `kind:` (e.g. `kind:feature`, `kind:test`) were renamed on 2025-09-27 to bare forms (`feature`, `test`).

## Internal Sub-Phases

Module documents may still reference internal sub-phase codes (e.g., traversal normalization N1..N5). These are **documentation constructs only** and never appear as labels.

## Migration Checklist

1. Delete deprecated labels (`area:*`, `type:*`, `phase:*`, `status:*`, high-number priorities).
2. Create the new bare type labels (`feature`, `enhancement`, `refactor`, `infra`, `docs`, `spike`, `test`).
3. Bulk edit open issues, applying mapping table above.
4. Assign milestones only to actively planned work (avoid parking lot milestones).
5. Merge or close duplicate long-tail P2 items; prefer fewer, clearer tickets.

## Automation (Future)

- Lightweight Action validation: exactly one `scope:` + one type + one `priority:`.
- Changelog grouping: order by Milestone then by `scope:`.

## Rationale

A constrained taxonomy forces deliberate prioritization, keeps dashboards readable, and lowers onboarding friction. Simplicity compounds: fewer labels → less triage time → more shipping.

> Change this taxonomy only with a documented ADR if a new strategic axis emerges.
