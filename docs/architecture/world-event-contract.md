# World Event Contract

> Status (2025-10-22): IMPLEMENTED. Queue-triggered processor, envelope validation, and idempotency handling are now operational. See Implementation section below for code references.

## Purpose

Provide a stable envelope + minimal semantic fields for all asynchronous world evolution operations (player actions, NPC ticks, system timers, AI proposals accepted after validation). Ensures idempotency, traceability, and correlation across processors.

## Implementation

The World Event Contract is now implemented with full queue processing capabilities:

-   **Schema Validation**: [`shared/src/events/worldEventSchema.ts`](../../shared/src/events/worldEventSchema.ts) — Zod schemas for envelope validation, actor types, and event type namespace
-   **Queue Processor**: [`backend/src/functions/queueProcessWorldEvent.ts`](../../backend/src/functions/queueProcessWorldEvent.ts) — Async world event processor with idempotency enforcement and telemetry
-   **Test Coverage**: [`backend/test/worldEventProcessor.test.ts`](../../backend/test/worldEventProcessor.test.ts) — Comprehensive tests covering valid events, schema validation, idempotency, and edge cases

**Telemetry Events Emitted:**

-   `World.Event.Processed` — Emitted when event is successfully processed (includes latency, correlation/causation IDs)
-   `World.Event.Duplicate` — Emitted when duplicate event is detected via idempotency key (skip processing)

See [`shared/src/telemetryEvents.ts`](../../shared/src/telemetryEvents.ts) for canonical event name definitions.

**M0 Foundation Milestone**: This implementation completed the core event processing infrastructure, documented in the M0 closure summary (Epic [#89](https://github.com/piquet-h/the-shifting-atlas/issues/89)).

## Envelope Shape

```jsonc
{
    "eventId": "uuid-v4", // Globally unique identifier
    "type": "Player.Move", // Namespaced type token (PascalCase segments)
    "occurredUtc": "2025-10-03T12:34:56.789Z", // ISO 8601 timestamp (producer clock)
    "ingestedUtc": "2025-10-03T12:34:57.012Z", // Set by first processor/ingestor
    "actor": {
        "kind": "player|npc|system|ai", // Controlled vocabulary
        "id": "uuid-v4" // Actor GUID if applicable
    },
    "correlationId": "uuid-v4", // Correlates to originating request / command
    "causationId": "uuid-v4", // (Optional) Upstream eventId for causal chains
    "idempotencyKey": "string", // Stable key for at-least-once delivery collapse
    "version": 1, // Schema major version
    "payload": {
        /* type-specific fields */
    }
}
```

## Required Fields

| Field          | Rule                    | Notes                                                                                     |
| -------------- | ----------------------- | ----------------------------------------------------------------------------------------- | --- | ------ | ---- |
| eventId        | UUID v4                 | Never reused.                                                                             |
| type           | 2-3 PascalCase segments | `Domain.Action` or `Domain.Subject.Action` mirroring telemetry style.                     |
| occurredUtc    | ISO timestamp           | Producer's notion of event creation.                                                      |
| actor.kind     | Enum                    | One of `player                                                                            | npc | system | ai`. |
| correlationId  | UUID v4                 | Propagated from HTTP request or upstream event.                                           |
| idempotencyKey | Non-empty string        | Deterministic for logical action (e.g., `playerGuid:fromLoc:toLoc:timestampFloorMinute`). |
| version        | Positive integer        | Increment only on breaking envelope change.                                               |
| payload        | Object                  | Must validate against type-specific schema.                                               |

## Optional Fields

| Field       | When Present              | Purpose                          |
| ----------- | ------------------------- | -------------------------------- |
| ingestedUtc | After first queue dequeue | Latency + ordering analysis.     |
| causationId | Derived events            | Build causal chains / timelines. |

## Type Namespace (Initial)

| Type                       | Payload Sketch                                          | Idempotency Guidance               |
| -------------------------- | ------------------------------------------------------- | ---------------------------------- |
| `Player.Move`              | `{ playerId, fromLocationId, toLocationId, direction }` | `playerId:from:to` + minute bucket |
| `Player.Look`              | `{ playerId, locationId }`                              | `playerId:locationId:minute`       |
| `NPC.Tick`                 | `{ npcId, locationId }`                                 | `npcId:tickWindow`                 |
| `World.Ambience.Generated` | `{ locationId, layerId, hash }`                         | `layerId`                          |
| `World.Exit.Create`        | `{ fromLocationId, toLocationId, direction }`           | `from:direction`                   |
| `Quest.Proposed`           | `{ questId, seedHash }`                                 | `questId`                          |

(Expand in future docs; do not overload `Player.Move` for teleportation—define a distinct `Player.Teleport` if invariants differ.)

## Validation Flow

1. **Envelope Validation** – Enforce presence + basic types.
2. **Type Schema Validation** – Zod/JSON Schema per `type`.
3. **Idempotency Check** – Consult durable store for processed `idempotencyKey`; skip if already finalized.
4. **Invariant Checks** – Domain-specific (exit exists, movement allowed).
5. **Persistence / Side Effects** – Apply graph mutations or append layers.
6. **Telemetry Emission** – Emit corresponding canonical event name aligned with `type`.

## Idempotency Strategy

-   Maintain a processed key store (e.g., Cosmos container or table) keyed by `idempotencyKey` → `eventId` + status.
-   Time-to-live for keys depends on action semantics (movement may expire sooner than structural changes).
-   **Never** mutate or delete completed entries except via administrative repair tooling.

## Error & Retry Semantics

| Failure Class                | Action                                            | Telemetry Dimension                   |
| ---------------------------- | ------------------------------------------------- | ------------------------------------- |
| Transient (e.g., rate limit) | Retry with exponential backoff (bounded attempts) | `status=transient-retry`              |
| Permanent Validation         | Dead-letter (store reason)                        | `status=validation-failed` + `reason` |
| Idempotent Duplicate         | Ack & Skip                                        | `status=duplicate`                    |

Dead-letter payloads MUST include original envelope plus validation error summary.

## Correlation & Tracing

-   `correlationId` links back to originating HTTP request or player session command.
-   Append `eventId` to telemetry dimensions of downstream AI or mutation proposals referencing the event.

## Versioning

-   Bump `version` only when envelope structure changes in a breaking way (field removal or semantic shift).
-   Additive payload fields within a `type` use separate **type schema versions** (maintained outside the envelope; optional `payloadVersion` can be added if needed later).

## Security Considerations

-   All externally influenced fields (notably `payload`) must be revalidated server-side; never trust client-provided `idempotencyKey` if reconstructable.
-   Reject events where `occurredUtc` drifts excessively (> configurable threshold) from `ingestedUtc` to mitigate replay.

## Open Questions

-   Should we encode shard / partition hints in the envelope for future horizontal scaling?
-   Need a policy for redaction of sensitive player data before dead-letter storage.

**Resolved (implemented in current code):**

-   ✅ Envelope structure — Now defined in Zod schema (`worldEventSchema.ts`)
-   ✅ Idempotency strategy — In-memory cache with TTL and FIFO eviction implemented
-   ✅ Error handling — Validation failures logged; placeholder for future dead-letter mode
-   ✅ Telemetry correlation — `correlationId` and `causationId` propagated through processing

## Queue Cutover Checklist (Direct Writes → Event Processing)

Mechanical steps to transition from synchronous HTTP persistence to queued world event processing without semantic drift:

1. Introduce envelope builder in HTTP handlers (produce full `WorldEvent` but still apply effects inline + persist event log record).
2. Add idempotency key store writes (record key before mutation); on duplicate skip mutation branch.
3. Stand up queue + processor Function(s) that consume events emitted by a feature‑flagged path (dual write: inline + enqueue).
4. Enable processor in shadow mode (processor re-validates but does not persist) and compare telemetry (`World.Event.Duplicate` vs processed).
5. Flip feature flag: HTTP handler stops applying mutation; only enqueues. Processor becomes authoritative.
6. Remove inline mutation code + dual write branch after stability window (>= one full playtest day) passes with no divergence.

Rollback: Re-enable inline apply path; processor continues (duplicate detection collapses replays).

Success Criteria: Zero drift events (no mismatched mutations), latency impact acceptable (< predefined threshold), and idempotency duplicates below target rate.

## Related Documentation

-   [Architecture Overview](./overview.md) – High-level architecture context and implementation mapping
-   [Agentic AI & Model Context Protocol](./agentic-ai-and-mcp.md) – AI integration using MCP tooling with world events
-   [M0 Closure Summary](../milestones/M0-closure-summary.md) – M0 Foundation milestone completion (world event infrastructure)
-   [ADR-001: Mosswell Persistence & Layering](../adr/ADR-001-mosswell-persistence-layering.md) – Base persistence model
-   [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) – Dual persistence (graph vs SQL)
-   [Observability](../observability.md) – Telemetry framework and event tracking

---

**Status Evolution**: This contract graduated from DRAFT to IMPLEMENTED (2025-10-22) with the landing of the queue-triggered processor supporting multiple event type validations (6 initial types in schema) and end-to-end processing with idempotency and telemetry.
