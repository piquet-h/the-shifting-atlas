<!-- Relocated: Detailed exit invariants moved to concept facet to prevent duplication. -->

# Exit Edge Invariants (Relocated)

Authoritative invariants now live in: `../concept/exits.md`.

Architecture facet summary (implementation-impact only):

1. Canonical direction uniqueness enforced per (fromLocationId, direction).
2. Reciprocity is optional; no implicit reverse creation.
3. Exit mutations do not affect location version counters.
4. Idempotent create/remove (no telemetry on no‑op).
5. Telemetry events: `World.Exit.Created`, `World.Exit.Removed` (only on state change).
6. Directions normalized prior to persistence (see concept doc for full normalization + relative rules).
7. Destination existence validated; scanners report anomalies only.
8. Description layers unaffected by exit CRUD.

For data shape, creation/removal flows, and roadmap items refer to concept doc and developer workflow guide.

## References

- Concept invariants: `../concept/exits.md`
- Edge Management Guide: `../developer-workflow/edge-management.md`
- Player Location Edge ADR: `../adr/ADR-003-player-location-edge-groundwork.md`
- Navigation Semantics: `../modules/navigation-and-traversal.md`

---

_Stub retained to comply with Facet Segregation Policy (Section 18) and avoid broken historical links._

## Purpose

Guarantee traversal integrity, idempotent creation/removal, and clear semantics for movement logic & future AI generation.
