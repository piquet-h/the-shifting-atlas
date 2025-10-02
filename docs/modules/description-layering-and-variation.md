# Design Document: Description Layering & Variation (Tokenless Model)

> STATUS: FUTURE / NOT IMPLEMENTED (2025-10-02). No layer composition engine, snippet registry, or structural event validators exist yet. This file defines the cross‑cutting narrative stability + variation model used by Navigation, AI Prompt Engineering, Factions, Events, Weather, and Geospatial context.
>
> Related: [AI Prompt Engineering](ai-prompt-engineering.md) · [Navigation & Traversal](navigation-and-traversal.md) · [World Rules & Lore](world-rules-and-lore.md) · [Factions & Governance](factions-and-governance.md) · [Geospatial & Hydrology](geospatial-and-hydrology.md)

## Summary

A **tokenless layered description system** preserves world continuity (no retcon drift) while supporting ambient variation (weather, time of day, seasonal mood, faction displays, temporary events) without re‑generating or mutating base prose. Creativity remains unconstrained because overlays are free‑form micro‑snippets; deterministic assembly and validators ensure structural facts remain stable.

## Goals

- Immutable **Base Description** for each Location
- Additive **Structural Event Layers** (burned gate, collapsed bridge) without rewriting base
- Reusable **Ambient / Weather / Time** snippets (short, ephemeral, cheap to generate)
- Optional **Enhancement** layers (sensory flourish) and **Personalization** overlays (player‑specific) without polluting shared canon
- Deterministic assembly order → reproducible view snapshots (auditable & testable)
- Retain _machine understanding_ (attribute map) without embedding `{TOKENS}` in prose

## Layer Types

| Layer                         | Mutability                      | Typical Lifetime | Examples                                                           | Persistence                      |
| ----------------------------- | ------------------------------- | ---------------- | ------------------------------------------------------------------ | -------------------------------- |
| Base                          | Immutable                       | Permanent        | "A wooden palisade stands to the north behind a hard-packed road." | Stored once                      |
| Structural Event              | Append-only                     | Long-term        | "Charred stakes mark the ruined section of palisade."              | Stored (versioned)               |
| Ambient (weather/time/season) | Replaceable (context dependent) | Minutes–Hours    | "Fine rain darkens the timber."                                    | Stored snippet registry (reused) |
| Enhancement (flavor)          | Append-only (can deactivate)    | Days–Weeks       | "Resin scent lingers in the warming air."                          | Stored layer                     |
| Personalization               | Ephemeral                       | Request scope    | Class vision hint, alignment aura                                  | Not globally stored              |

## Assembly Order

```
Base → Structural Events (chronological) → Active Ambient (max 1 per category) → Active Enhancements → Exit Summary → Personalization (optional, last)
```

If a Structural Event conceptually supersedes part of the base (e.g. destroys palisade), it lists `supersedes: ["palisade clause"]`. The composer either:

1. Masks the superseded sentence from Base, or
2. Leaves Base intact but relies on later layers to override player perception (config option).

## Attribute Map (Tokenless Structure)

Each Location maintains a small structured map extracted once at genesis or authoring:

```
attributes: {
  barrierNorth: { kind: 'palisade', material: 'wood', integrity: 'intact' },
  roadSurface: { type: 'dirt', compaction: 'hard-packed' },
  ambientBiome: 'temperate_forest'
}
```

Uses:

- Validator: Reject ambient layer turning dirt road into cobbled without a Structural Event layer first.
- Faction / Event logic: Upgrading integrity, adding banners, etc.
- Future analytics & search: find all wooden palisades for decay event.

## Layer Validation Pipeline

| Stage                  | Check                                                                          | Action on Fail      |
| ---------------------- | ------------------------------------------------------------------------------ | ------------------- |
| Safety                 | Content policy (profanity, disallowed themes)                                  | Reject / quarantine |
| Structural Consistency | Does not contradict `attributes` unless structural layer                       | Reject              |
| No Base Mutation       | Base substring unchanged (hash compare)                                        | Reject              |
| Additive Scope         | Word count <= configured limit (e.g. 40) for ambient/enhancement               | Reject / trim       |
| Redundancy             | Similarity to existing layers < threshold (avoid duplicates)                   | Reject / skip       |
| Drift Guard            | No new large permanent nouns (e.g. "tower", "citadel") in non-structural layer | Reject              |

Deterministic hash of each accepted layer (`sha256(minifiedText + sortedFields)`) stored for audit.

## Ambient Snippet Registry

Keyed by `(biome, weatherType, timeBucket)` and possibly `variantIndex`.

- On first miss → AI generates **K** variants (default 3) under strict prompt: _"Return <=25 word ambient snippets; no structural changes; ephemeral effects only."_
- Deterministic variant pick: `variant = hash(locationId + weatherType + timeBucket) % K`.
- Reuse across Locations sharing biome & feature archetype (optional filter).

## Structural Events & Faction Signals

Faction or political visuals (e.g. "A banner of the Miners Guild now flies above the gate") are **Structural Event layers** with metadata:

```
{ layer: 'structural_event', kind: 'faction_display', factionId: 'miners_guild', supersedes: [], adds: ['guild_banner'], createdUtc: ... }
```

Removal (banner taken down) is a new event layer marking banner inactive; history remains intact.

## Weather & Time Activation

Runtime context selects at most one active ambient layer per category:

- `weather`: derived from world state (rain, clear, snow)
- `time`: coarse buckets (dawn, day, dusk, night)
- `season`: optional additive
  Conflict resolution: priority order `structural > weather > season > time > enhancement` for conflicting semantic claims.

## Personalization Layer

Not persisted globally. Composed last (e.g., "Your ranger senses trace faint spoor leading west."). Player receives augmented view; canonical stored layers remain unaffected. Prevents loot/location metadata leakage to others.

## Provenance & Integrity

```
provenance: {
  base: { hash, model?, promptHash?, createdUtc },
  layers: [{ id, hash, layerType, model?, promptHash?, createdUtc, supersedes? }],
  structuralVersion: 3
}
```

A nightly integrity job re-hashes base + layers; mismatches raise alerts.

## Regeneration Policy

| Scenario                               | Allowed?                   | Action                                               |
| -------------------------------------- | -------------------------- | ---------------------------------------------------- |
| Re-style existing base (model upgrade) | No                         | Add enhancement layer                                |
| Weather shift                          | Yes                        | Activate existing ambient snippet; never re-gen base |
| Permanent destruction (gate burns)     | Yes (new structural event) | Add structural layer + attribute map mutation        |
| Attribute correction (author fix)      | Rare (manual)              | New structural version layer referencing rationale   |

## Testing (Planned)

- Unit: Composition order & supersede masking
- Unit: Validator rejects contradictions (dirt→cobbled w/o structure layer)
- Property: Idempotent render given same active context
- Hash Integrity: Tampering simulation
- Snapshot: Golden expected composite for fixed context/time

## Telemetry (Planned Events)

(All centralized—no inline literals.)

- `Description.Layer.Generated` (layerType, kind?, latencyMs, model, length, rejectedReason?)
- `Description.Composite.Rendered` (locationId, layersApplied, weatherType, timeBucket)
- `Description.Structure.ContradictionRejected` (reason)
- `Description.Registry.Miss` (category, biome)

## Interactions With Other Modules

| Module                 | Consumption / Contribution                                                  |
| ---------------------- | --------------------------------------------------------------------------- |
| AI Prompt Engineering  | Supplies generation prompts; records provenance hashes                      |
| Navigation & Traversal | Renders exit summary after composition; avoids mutating layers              |
| World Rules & Lore     | Biome & seasonal context influence ambient selection                        |
| Factions & Governance  | Emits structural event layers for displays / control shifts                 |
| Geospatial & Hydrology | Supplies environmental moisture / elevation modifiers for ambient selection |
| Quest & Dialogue Trees | May request enhancement layers for quest phase flavor                       |

## Open Questions

| Topic                 | Question                                      | Direction                                          |
| --------------------- | --------------------------------------------- | -------------------------------------------------- |
| Supersede Granularity | Sentence vs phrase masking?                   | Start sentence-level (split by `.`, `!`, `?`)      |
| Attribute Extraction  | NLP vs manual initial tagging?                | Start manual (author or genesis schema), NLP later |
| Registry Explosion    | Risk of too many biome-weather-time variants? | Cap variants (K=3) + LRU prune unused              |
| Personalization Cache | Should personalized composites be cached?     | Short-lived per player (few minutes)               |

## Risks & Mitigations

| Risk                      | Mitigation                                                                 |
| ------------------------- | -------------------------------------------------------------------------- |
| Silent Base Drift         | Hash check + immutable flag in DB                                          |
| Layer Spam (bloat)        | Length caps + deactivation on redundancy                                   |
| Creativity Stifled        | Allow rich metaphors in enhancement layers; only restrict structural nouns |
| Validator False Positives | Log & review contradictions; refine attribute schema                       |

---

_Last updated: 2025-10-02 (initial creation)_
