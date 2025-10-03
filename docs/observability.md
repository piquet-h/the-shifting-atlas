# Observability & Telemetry (MVP Framework)

This document defines naming, dimensions, and evolution guidelines for telemetry so events stay consistent as features grow.

## Goals

- Provide stable event names early to avoid churn in dashboards.
- Capture enough context for debugging without exceeding free tier quotas.
- Make persistence / mode transitions (in‑memory → Cosmos) visible.

## Event Naming Convention (Unified)

No legacy compatibility required; ALL events adopt the same structure immediately.

Pattern: `<Domain>.<Subject?>.<Action>` (segments separated by `.`; each segment in PascalCase)

Rules:

1. Minimum two segments (`Domain.Action`) – add `Subject` only when it materially disambiguates.
2. Use PascalCase for every segment; no lowercase or snake_case.
3. Prefer singular nouns (`Location`, `Player`, `NPC`).
4. Actions are verbs in Past tense for completed facts (`Created`, `Upgraded`, `Moved`) or Present tense for instantaneous queries (`Get`, `List`). Be consistent within a domain.
5. Avoid encoding outcome or status in the name; use dimensions (`status`, `reason`).
6. Do not append "Event" or duplicate context (no `Location.LocationMoved`).
7. Stick to three segments maximum for MVP unless a truly separate facet is needed (e.g., `Economy.Trade.Executed`).

Approved Domains (initial):
| Domain | Scope |
| -------- | ------------------------------------------ |
| Onboarding | Guest GUID issuance & session bootstrap |
| Auth | Account / identity upgrades |
| Location | Location retrieval & traversal |
| Ping | Diagnostic latency / echo |
| NPC | (Future) autonomous character ticks |
| Economy | (Future) trade / currency operations |
| Dialogue | (Future) branching narrative interactions |

Examples (canonical):

- `Onboarding.GuestGuid.Created`
- `Onboarding.GuestGuid.Started`
- `Auth.Player.Upgraded`
- `Location.Get` (idempotent fetch)
- `Location.Move` (attempted traversal; success/failure in `status`)
- `Ping.Invoked`

Reserved Suffixes:

- `Started`, `Completed` for lifecycle flows.
- `Get`, `List` for read-only operations.
- `Created`, `Deleted`, `Updated` for CRUD writes.
- `Move` (domain-specific action – movement attempt).

Anti-Patterns (DO NOT):

- `room.get` (wrong casing)
- `Room.Get.200` (status baked into name)
- `OnboardingGuestGuidCreated` (no dots)
- `AuthUpgradeSuccess` (no segmentation, inconsistent verb form)

Decision Matrix:

- If action mutates: Past tense (`Created`, `Upgraded`).
- If action queries: Base verb (`Get`, `List`).
- If action may fail but we always want a single series: Keep one name; differentiate with `status` and optional `reason` dimension.

Event Name Grammar Quick Sheet:

```
<Domain>[.<Subject>].<Action>
Domain: PascalCase noun grouping.
Subject (optional): Specific entity category inside domain.
Action: Verb (Get/List) or Past-tense result (Created/Upgraded/Moved).
```

## Standard Dimensions (Keys)

| Key               | Purpose                                                   | Example   |
| ----------------- | --------------------------------------------------------- | --------- |
| `service`         | Emitting logical service (`backend-functions`, `swa-api`) | `swa-api` |
| `requestId`       | Correlates to function invocation id                      | `abc123`  |
| `playerGuid`      | Player identity (guest or linked)                         | `9d2f...` |
| `fromLocation`    | Origin location id for movement                           | (UUID)    |
| `toLocation`      | Destination location id                                   | (UUID)    |
| `direction`       | Movement direction keyword                                | `north`   |
| `status`          | Numeric or enum outcome (200, 404, `no-exit`)             | `200`     |
| `persistenceMode` | Storage backend (`memory`, `cosmos`)                      | `memory`  |
| `latencyMs`       | Basic measured duration                                   | `17`      |

Add dimensions sparingly; prefer a single event with multiple dimensions over many granular events that fragment analysis.

## Current Canonical Event Set (Week 1 Post-Refactor)

| Event Name                                  | Purpose                                           |
| ------------------------------------------- | ------------------------------------------------- |
| `Ping.Invoked`                              | Health / latency probe                            |
| `Onboarding.GuestGuid.Started`              | Begin guest bootstrap attempt                     |
| `Onboarding.GuestGuid.Created`              | New guest GUID allocated                          |
| `Auth.Player.Upgraded`                      | Guest upgraded / linked identity                  |
| `Location.Get`                              | Location fetch (status dimension for 200/404)     |
| `Location.Move`                             | Movement attempt outcome                          |
| `Command.Executed`                          | Frontend command lifecycle (ad-hoc CLI)           |
| `World.Location.Generated`                  | AI genesis accepted (future)                      |
| `World.Location.Rejected`                   | AI genesis rejected (future)                      |
| `World.Layer.Added`                         | Description / ambience layer persisted (future)   |
| `World.Exit.Created`                        | Exit creation (manual or AI)                      |
| `Prompt.Genesis.Issued`                     | Prompt sent to model (future)                     |
| `Prompt.Genesis.Rejected`                   | Prompt output rejected during validation (future) |
| `Prompt.Genesis.Crystallized`               | Accepted prompt output stored                     |
| `Prompt.Layer.Generated`                    | Non-structural layer generation event             |
| `Prompt.Cost.BudgetThreshold`               | Cost budget threshold crossed                     |
| `Extension.Hook.Invoked`                    | Extension hook invocation                         |
| `Extension.Hook.Veto`                       | Extension prevented operation                     |
| `Extension.Hook.Mutation`                   | Extension mutated draft entity                    |
| `Multiplayer.LayerDelta.Sent`               | Multiplayer layer diff broadcast (future)         |
| `Multiplayer.LocationSnapshot.HashMismatch` | Client/server snapshot divergence                 |
| `Multiplayer.Movement.Latency`              | Movement latency decomposition (future)           |
| `Telemetry.EventName.Invalid`               | Guard rail emission for invalid names             |

## Emission Guidelines

1. Emit on boundary decisions (success vs error) rather than every internal step.
2. Include `persistenceMode` once repository abstraction exists.
3. Reserve high-cardinality values (raw descriptions, large GUID sets) for logs—not custom events.
4. Use consistent casing; avoid introducing both `fromLocation` and `from_location`.
5. Failures should share the same event name with a differentiating `status` or `reason` dimension.

## Sampling & Quotas

- Default: no sampling (MVP volume negligible).
- Introduce probabilistic sampling (e.g., 0.5) only if monthly ingestion nears free tier.
- NEVER sample security/audit events (future auth-critical events).

## Current Event Mapping (Old → New)

| Old                           | New                            | Notes                                  |
| ----------------------------- | ------------------------------ | -------------------------------------- |
| `Onboarding.GuestGuidCreated` | `Onboarding.GuestGuid.Created` | Adds Subject segment for clarity       |
| `Onboarding.Start`            | `Onboarding.GuestGuid.Started` | Clarifies what started                 |
| `Auth.UpgradeSuccess`         | `Auth.Player.Upgraded`         | Standard Past-tense verb; adds Subject |
| `ping.invoked`                | `Ping.Invoked`                 | Casing + Domain normalization          |
| `room.get`                    | `Location.Get`                 | Terminology + casing normalized        |
| `room.move`                   | `Location.Move`                | Terminology + casing normalized        |

All old names are to be replaced in a single refactor (no dual emission mandated).

## Roadmap

| Phase | Additions                                                                                  |
| ----- | ------------------------------------------------------------------------------------------ |
| MVP+1 | Repository-backed Location events (`Location.Get`, `Location.Move`) with `persistenceMode` |
| MVP+2 | NPC tick events (`NPC.TickStart`, `NPC.TickResult`)                                        |
| MVP+3 | Economy transactions (`Economy.TradeExecuted`)                                             |
| MVP+4 | Dialogue interactions (`Dialogue.BranchChosen`)                                            |

## Migration Notes (Refactor Plan)

Since backward compatibility is not required:

1. Rename constants inline where passed to `trackEvent`.
2. Run a global search for each old literal; replace with new form.
3. Add a temporary type guard (optional) that rejects lowercase names during development (lint rule suggestion below).
4. Rebuild & smoke-test telemetry emission locally (Application Insights ingestion optional).

Suggested ESLint Custom Rule (future): ensure event names match regex `^[A-Z][A-Za-z]+(\.[A-Z][A-Za-z]+){1,2}$`.

Deprecated Names: none retained; removal is immediate.

## Dashboards (Future)

Proposed starter charts:

- Requests by status over time (split by event name)
- Movement success rate (filter `Location.Move` where `status=200` vs others)
- Top locations by visits (`Location.Get` count grouped by `locationId`)
- Onboarding conversion (GuestGuidCreated → UpgradeSuccess funnel)

## Open Questions (Track Before Expanding)

- Do we need per-player rate limiting metrics or will Azure front-door metrics suffice?
- Should movement latency be separated from overall request latency? (If queue handoff introduced.)

_Last updated: 2025-09-25_

---

## AI Telemetry Pointer (Stage M3+)

AI / MCP specific event emissions and required dimensions are defined in `architecture/agentic-ai-and-mcp.md` (section: _AI Telemetry Implementation_). Do **not** invent ad-hoc AI event names outside the canonical enumeration in `shared/src/telemetryEvents.ts`; propose additions via PR updating that file + this doc if classification changes are needed.

Canonical enumeration source of truth:

- `shared/src/telemetryEvents.ts` – `GAME_EVENT_NAMES`

Planned lint rule: enforce membership & regex validation for any string literal passed to telemetry helpers.
