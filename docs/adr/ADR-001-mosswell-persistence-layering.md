# ADR-001: Mosswell Persistence & Tokenless Description Layering

Status: Accepted (2025-10-02)
Decision Drivers:

- Eliminate reseed drift for anchor (hand-authored) locations
- Provide deterministic, auditable narrative evolution (no base rewrites)
- Enable incremental AI adoption after traversal + persistence
- Minimize future refactors when adding hydrology, factions, weather

## Context

Current prototype world ("Mosswell") lives in in-memory structures; descriptions can only evolve by code edits or full regeneration later. Planned systems (AI genesis, faction banners, weather, structural events) require:

1. Immutable canonical base prose per Location
2. Additive layer model (structural events, ambient snippets, enhancements)
3. Attribute map for validator enforcement (prevent silent retcons)
4. Early persistence of Locations & Exits in Cosmos (Gremlin) to anchor IDs and provenance.

Waiting to introduce persistence until after AI increases risk of ID churn and inconsistent references in future layers (ex: faction events referencing transient IDs).

## Decision

Adopt a **tokenless layered description model** with immediate persistence of Mosswell anchor Locations and Exits. Base descriptions are immutable; all variation is additive via layers. No inline template tokens are embedded in stored prose—machine-readable structure lives in a compact `attributes` map. AI generation will only begin after the following phased tasks:

Phase M-P1 (Persistence Bootstrap)

- Define Location/Exit/Layer TypeScript interfaces (shared)
- Implement `LocationRepository` (Cosmos adapter + in-memory fallback) with idempotent create
- Bootstrap script seeds Mosswell if absent (stable UUIDs)

Phase M-P2 (Layer Engine Core)

- Implement `DescriptionComposer` (Base + structural layers)
- Add minimal validator (immutability, length bound, structural contradiction check)
- Structural event layer simulation script (e.g., faction banner)

Phase M-P3 (Ambient Registry)

- Add ambient snippet registry (weather/time) with deterministic selection
- Extend composer ordering (base → structural → ambient → enhancement → personalization)

Phase M-P4 (Telemetry & Integrity)

- Emit `Description.Layer.Generated` & `Description.Composite.Rendered`
- Nightly integrity hash check job (future queue trigger)

Phase M-P5 (AI On-Ramp)

- Ambient layer generation on registry miss (strict schema)
- Structural event proposals (manual approval gate)

Hydrology, faction displays, and quest overlays will consume the same layering and attribute model; no format change expected.

## Alternatives Considered

1. **Prose-first regeneration** (AI describes location each visit): Fails auditability and stability; prone to drift.
2. **Tokenized base with dynamic substitution**: Higher authoring overhead now; adopted later if large-scale substitution or localization is required.
3. **Delay persistence until after AI genesis**: Risks ID churn, non-reproducible history, longer refactor tail.

## Consequences

Positive:

- Stable anchor for subsequent systems (MCP, hydrology, factions)
- Lower AI costs (ambient snippets cached; base never regenerated)
- Clear provenance & rollback scope (deactivate layer vs rewrite)
- Deterministic tests (snapshot composer output)

Negative / Costs:

- Need validator + attribute extraction upfront (manual tagging initially)
- Slight storage overhead for layer history
- Additional composition step on each LOOK (mitigated by lightweight caching)

## Attribute Map (Initial Fields)

```
attributes: {
  settlementType: 'village',
  terrain: 'valley_floor',
  barrierNorth?: { kind: 'palisade', material: 'wood', integrity: 'intact' },
  roadSurface: { type: 'dirt', compaction: 'hard-packed' },
  ambientBiome: 'temperate_forest'
}
```

Future fields: factionControl (guid), hydrologyContext, elevationBand.

## Validator (Phase 1 Rules)

- Base immutability: stored hash unchanged
- Ambient/enhancement length ≤ 50 words
- Non-structural layers may not introduce permanent nouns outside allowlist: `(mist|rain|fog|dust|shadows|breeze|insects)`
- Structural layers specify `kind` and may introduce new permanent nouns

## Telemetry (Initial)

- `Description.Layer.Generated` { layerType, length, model?, rejectedReason? }
- `Description.Composite.Rendered` { locationId, structuralCount, ambientActive, enhancementCount }
- `Description.StructuralEvent.Added` { locationId, kind }

## Migration Steps

1. Commit interfaces + repository
2. Run bootstrap script (dev & staging)
3. Swap movement handlers to repository reads
4. Remove in-memory Mosswell constants
5. Add first structural event layer (manual banner) to validate pipeline

## Rollback Plan

- If persistence adapter fails: fall back to in-memory (feature flag) but preserve generated UUID mapping table.
- If layer model introduces performance regression: temporary cache final composites with short TTL.
- If validator causes false positives: log & downgrade rule severity (warn) while adjusting allowlist.

## Future Revisit Triggers

- Introduction of localization => consider tokenization
- Large-scale environmental transformations (sea-level, seasonal global shifts) => evaluate tokenized or diff-based patching
- Layer storage growth > threshold => move layers to separate collection with paging

## References

- `modules/description-layering-and-variation.md`
- `modules/navigation-and-traversal.md` (LOOK pipeline)
- `modules/ai-prompt-engineering.md` (generation integration)

## Approval

Accepted 2025-10-02; rationale embedded in implementation issues #64–#69 (no standalone ADR tracking issue). Future amendments should update this section with reviewer handles.

---
