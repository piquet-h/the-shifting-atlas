# Observability & Telemetry (MVP Framework)

This document defines naming, dimensions, and evolution guidelines for telemetry so events stay consistent as features grow.

## Goals

- Provide stable event names early to avoid churn in dashboards.
- Capture enough context for debugging without exceeding free tier quotas.
- Make persistence / mode transitions (in‑memory → Cosmos) visible.

## Event Naming Convention

Format: `<Domain>.<Action><Qualifier?>`

Examples:

- `Onboarding.GuestGuidCreated`
- `Auth.UpgradeSuccess`
- `ping.invoked` (lowercase retained for legacy; new events SHOULD use PascalCase domain prefix)
- `Room.Get` (future replacement for `room.get` once repository abstraction lands)
- `Room.Move`

Legacy lowercase events MAY be refactored to PascalCase once dashboards are minimal (pre-production).

## Standard Dimensions (Keys)

| Key               | Purpose                                                   | Example        |
| ----------------- | --------------------------------------------------------- | -------------- |
| `service`         | Emitting logical service (`backend-functions`, `swa-api`) | `swa-api`      |
| `requestId`       | Correlates to function invocation id                      | `abc123`       |
| `playerGuid`      | Player identity (guest or linked)                         | `9d2f...`      |
| `fromRoom`        | Origin room id for movement                               | `starter-room` |
| `toRoom`          | Destination room id                                       | `antechamber`  |
| `direction`       | Movement direction keyword                                | `north`        |
| `status`          | Numeric or enum outcome (200, 404, `no-exit`)             | `200`          |
| `persistenceMode` | Storage backend (`memory`, `cosmos`)                      | `memory`       |
| `latencyMs`       | Basic measured duration                                   | `17`           |

Add dimensions sparingly; prefer a single event with multiple dimensions over many granular events that fragment analysis.

## Emission Guidelines

1. Emit on boundary decisions (success vs error) rather than every internal step.
2. Include `persistenceMode` once repository abstraction exists.
3. Reserve high-cardinality values (raw descriptions, large GUID sets) for logs—not custom events.
4. Use consistent casing; avoid introducing both `fromRoom` and `from_room`.
5. Failures should share the same event name with a differentiating `status` or `reason` dimension.

## Sampling & Quotas

- Default: no sampling (MVP volume negligible).
- Introduce probabilistic sampling (e.g., 0.5) only if monthly ingestion nears free tier.
- NEVER sample security/audit events (future auth-critical events).

## Roadmap

| Phase | Additions                                                                      |
| ----- | ------------------------------------------------------------------------------ |
| MVP+1 | Repository-backed Room events (`Room.Get`, `Room.Move`) with `persistenceMode` |
| MVP+2 | NPC tick events (`NPC.TickStart`, `NPC.TickResult`)                            |
| MVP+3 | Economy transactions (`Economy.TradeExecuted`)                                 |
| MVP+4 | Dialogue interactions (`Dialogue.BranchChosen`)                                |

## Migration Notes

- When replacing `room.get` with `Room.Get`, emit BOTH for one deployment to bridge dashboards.
- Document deprecations inside this file (append a Deprecated section) with removal date.

## Dashboards (Future)

Proposed starter charts:

- Requests by status over time (split by event name)
- Movement success rate (filter `Room.Move` where `status=200` vs others)
- Top rooms by visits (`Room.Get` count grouped by `roomId`)
- Onboarding conversion (GuestGuidCreated → UpgradeSuccess funnel)

## Open Questions (Track Before Expanding)

- Do we need per-player rate limiting metrics or will Azure front-door metrics suffice?
- Should movement latency be separated from overall request latency? (If queue handoff introduced.)

_Last updated: 2025-09-21_
