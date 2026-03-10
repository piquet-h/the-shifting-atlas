# Design Clarification: Intent (State) vs Narration

> **Type**: Design clarification — quick reference  
> **Relates to**: `docs/architecture/action-intent-persistence.md` (player actions),  
> `docs/architecture/exit-language-contract.md` (exit edge narration),  
> `docs/architecture/narration-governance.md` (output classification)

---

## Core Principle

The game world has two fundamentally different kinds of data:

| Kind | Role | Persistence | Examples |
|------|------|-------------|---------|
| **State** (intent / spatial truth) | What is true about the world | Persisted, canonical, deterministic | `travelDurationMs`, `direction`, `pathKind`, `grade`, `transitionKind` |
| **Narration** | How the world is described in prose | Ephemeral, generated, not canonical | `"A worn track stretches west."`, `"The door opens into shadow."` |

These two kinds of data must never be conflated. State is ground truth; narration is a rendering of that truth.

---

## Why the Split Matters

### State Must Be Persisted and Deterministic

Spatial facts on a world graph edge — which direction it faces, how long it takes to traverse, what structural features it has — must be stored as discrete typed properties. They:

- Drive game mechanics (map rendering, proximity calculations, travel time)
- Enable reproducible generation (same state → consistent narrative)
- Must remain stable when the prose description is regenerated, changed, or layered over
- Are the ground truth for validators, tests, and audit jobs

### Narration Must Not Become State

If prose text is stored as the source of truth for spatial facts, the system becomes fragile:

- Prose is ambiguous: "a steep path climbs north" implies `grade=ascending` but doesn't formally encode it
- AI generation can produce subtly inconsistent prose on re-generation
- Text length limits (EL-01: 120 chars) prevent encoding complex spatial relationships
- Adding ambient layers (fog, season, faction context) to the prose would corrupt the spatial facts

Narration is instead generated **from** state, subject to validation (EL-01–EL-09), and discarded or replaced without touching the underlying spatial record.

---

## Applied to Exit Edges

For a world graph exit edge, the split looks like this:

**State (persisted on the edge, never inferred from prose):**
```
direction:        "west"
travelDurationMs: 1_800_000          → bucket: "far"
pathKind:         "track"            → advisory hint to generator
grade:            "ascending"        → advisory hint to generator
transitionKind:   "open-air"         → advisory hint to generator
```

**Narration (generated from state, validated, ephemeral):**
```
forward:   "A worn track climbs westward."
backward:  "A worn track slopes back east."
```

The narration is derived from state at generation time. It may be regenerated, updated with a garnish clause, or replaced entirely without modifying the underlying spatial facts.

---

## Generation Contract

> Exit text is the label on the spatial graph edge. Layers paint the scene around it.  
> Exit text must remain true when the ambient layer is "midday sun" and equally true when it is "dense fog". Write accordingly.

— `docs/architecture/exit-language-contract.md` §4

When a new exit edge is materialised:

1. Persist the spatial facts (`direction`, `travelDurationMs`, spatial hints).
2. Derive `durationBucket` from `travelDurationMs` (deterministic function — no AI).
3. Generate a scaffold description from bucket + hints (deterministic — no AI).
4. Optionally append an AI garnish clause (bounded, destination-facing, falls back gracefully).
5. Validate the output (EL-01–EL-09) before use.

The scaffold is always available. The AI garnish is optional and never required for correctness.

---

## Common Mistakes to Avoid

| Mistake | Why It Violates the Split |
|---------|---------------------------|
| Storing the prose text as the authoritative source of direction/grade | Text is narration; direction and grade are state |
| Inferring `travelDurationMs` by parsing prose | Prose may be vague or regenerated; duration must be explicit |
| Embedding faction context or weather in exit text | Those belong in ambient layers, not the stable edge label |
| Omitting `travelDurationMs` on new edges and using prose register as a proxy | Downstream systems (proximity, maps, narration pacing) need explicit durations |

---

## Relationship to Other Docs

- `docs/architecture/action-intent-persistence.md` — same split applied to player actions ("intent" vs "narrative response")
- `docs/architecture/exit-language-contract.md` — bounded contract for the narration side of exits
- `docs/architecture/narration-governance.md` — output classifications, validator pipeline, and drift audit for all narration
- `docs/design-modules/description-layering-and-variation.md` — how narration layers stack on top of the base exit label

---

_Last updated: 2026-03-09_
