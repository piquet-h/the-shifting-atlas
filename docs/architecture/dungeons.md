<!-- Relocated: Dungeon conceptual model moved to concept facet to avoid duplication. -->

# Dungeon Runs (Relocated Summary)

Authoritative conceptual & narrative design now lives at: `../concept/dungeons.md`.

Architecture summary (implementation-impact only):

- Template structure (rooms + exits) persists in unified Gremlin graph (no per-run vertex cloning).
- Per-run volatile progression stored in SQL document (`dungeonRuns` container) keyed by `dungeonInstanceId`.
- Lifecycle statuses: `active`, `cleared`, `failed`, `expired` (instance TTL cleanup).
- Movement handler overlays instance state (blocked/cleared) without mutating graph edges.
- Telemetry events (to be defined centrally) emit creation, progress, clear/exit; all idempotent.
- Partition strategy unchanged until RU + contention thresholds (see ADR-002) justify segmentation.

For rationale, extended schema, event payload drafts, and roadmap details see the concept doc.

## References

- Concept & full design: `../concept/dungeons.md`
- Partition strategy: `../adr/ADR-002-graph-partition-strategy.md`
- Exit invariants: `./exits.md`
- World event contract base: `./world-event-contract.md`

---

_Stub retained per Facet Segregation Policy (Section 18)._
