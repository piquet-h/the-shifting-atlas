# World Event Contract (Draft Spec)

> Status (2025-10-03): DRAFT. No queue-triggered processors exist yet. This contract SHOULD guide any interim HTTP-based simulations so the eventual queue cutover is mechanical.

## Purpose

Provide a stable envelope + minimal semantic fields for all asynchronous world evolution operations (player actions, NPC ticks, system timers, AI proposals accepted after validation). Ensures idempotency, traceability, and correlation across processors.

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

-   Should we encode shard / partition hints in the envelope for future horizontal scaling?
-   Need a policy for redaction of sensitive player data before dead-letter storage.

## Related Documentation

-   [Architecture Overview](./overview.md) – High-level event-driven architecture context
-   [Agentic AI & MCP Architecture](./agentic-ai-and-mcp.md) – AI proposal flow through world events
-   [M0 Closure Summary](../milestones/M0-closure-summary.md) – World Event Queue Processor implementation (#101)
-   [Ambiguities](../ambiguities.md) – World Event Queue Cutover timeline and triggers

---

This draft will graduate to STABLE once the first queue-triggered processor lands and at least two distinct `type` schemas are exercised end-to-end.
