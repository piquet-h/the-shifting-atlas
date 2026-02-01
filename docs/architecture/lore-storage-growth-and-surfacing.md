# How to Store, Grow, and Surface Lore in a Living Game World

> Status: PROPOSED (2026-02-01)
>
> This document describes a **two-layer lore system**: authoritative, queryable canon (Cosmos SQL) plus a narrative corpus suitable for retrieval (RAG). It is a design target; implementation may arrive incrementally.

## Why two layers exist

The Shifting Atlas runs on a split responsibility model:

- **Deterministic state capture** persists only what must be consistent.
- **AI-driven immersion** adds voice, myth, and ambiguity without violating canon.

This is a direct application of the **Narrative Consistency** tenet: deterministic storage is authoritative, while narration may speculate until it crosses a validation boundary and becomes canon.

References:

- Tenet: `../tenets.md` ("Persistence Ratchet" and narrative constraints)
- Event boundary: `./event-classification-matrix.md`
- Async event contract: `./world-event-contract.md`

## Layer 1: Structured Canon (Cosmos SQL)

**Purpose**: store _facts the game must treat as authoritative_.

Examples:

- Factions: creation/disbanding, leadership, territory claims
- NPC metadata: identity, role, affiliations, relationship anchors
- Timelines / world-state changes that must be queryable
- Mechanics, rules, stats

### Canon is facts, not prose

Canon documents should be:

- **Small** (keep below Cosmos item limits)
- **Structured** (fields you can query deterministically)
- **Versioned** (auditability; immutable-per-version)

In this repo, canonical facts are already modeled as versioned documents in the `loreFacts` container.

Reference:

- Authoring + versioning: `../developer-workflow/lore-authoring.md`

### Canon partitioning note

Partition keys must support access patterns and avoid hot partitions. The current `loreFacts` design partitions by type (see the authoring doc). As lore volume grows, treat partition strategy as a _measured_ architecture constraint (RU/latency telemetry), not an ideological one.

(Details belong in the container catalog; see `./cosmos-sql-containers.md`.)

## Layer 2: Narrative Lore Corpus (Text + Retrieval)

**Purpose**: store _human-shaped_ world memory that should feel mythic, biased, and story-like.

Examples:

- Legends, rumours, cultural memory
- Eyewitness accounts
- Place descriptions and artefact histories
- Player-driven history retold as story

### Corpus chunks are immutable artifacts

A narrative chunk is best treated as an immutable artifact with metadata, e.g.:

- `title`
- `voice` (bardic, clerical, soldier, scholar)
- `scope` (location, faction, region)
- `timeRange` (when it’s "about")
- `sources` (which canonical facts/events it was derived from)
- `reliability` (diegetic confidence; not "truth")

The important distinction:

- **Corpus is allowed to be wrong** (by bias, distortion, rumor).
- **Canon is not allowed to be wrong** (it is the game’s source of truth).

### Where the corpus lives

This repo’s preference is text that can be reviewed like code. A corpus can live as Markdown files under a docs path (for example, a future `docs/lore-corpus/` folder), and be indexed by whatever retrieval layer is used later.

This keeps narrative memory:

- diffable
- attributable
- reviewable
- decoupled from runtime deployments until you opt in

## Treat lore as evolving history (event backbone)

Instead of treating lore as a static encyclopedia, treat it as a **history of events**.

Events should be:

- timestamped (at least `occurredUtc`)
- typed (namespaced type token)
- structured (payload for deterministic queries)
- replayable (to regenerate projections and narrative)

In this repo, the async evolution boundary already uses `WorldEventEnvelope`.

Reference:

- Contract + semantics: `./world-event-contract.md`

### Canonicalization: event → fact

Many events are _about_ the world; only some events become canonical facts.

Rule of thumb:

- **Event** records that something happened.
- **Fact** records the durable resulting truth.

Example:

- `FactionCreated` (event) occurs once.
- `faction_<id>` (fact) is the durable record you query for current faction properties.

### Narrativization: event → story

Separately, some events become narrative material:

- not to change the authoritative world state,
- but to enrich how the world is remembered and spoken about.

Example output chunks:

- “The Rise of the Azure Dominion”
- “Whispers in Stoneford”
- “The Fall of the Dominion”

A faction can disappear in canon while its story remains in the corpus.

## Auto-generate narrative from meaningful events

When significant events occur, the world can synthesize narrative artifacts.

Important boundaries:

- Generation should be **async** (never block player HTTP responses).
- The resulting prose is **non-canonical by default**.
- Provenance metadata must include which events/facts it was derived from.

This aligns with the repo’s event-driven architecture:

- personal state changes happen synchronously
- shared/world evolution happens via queued events

Reference:

- Classification and latency philosophy: `./event-classification-matrix.md`

## NPCs remember differently (subjective views)

A living world is more believable when NPCs do not share a single omniscient truth.

Model NPC recollection as a **view** over the same underlying substrates:

- canonical facts (shared, authoritative)
- event history (shared, queryable)
- narrative corpus (shared artifacts)

…but filtered by NPC-specific rules.

### Ingredients of NPC memory

Each NPC can have:

- **witnessed events** (what they were present for)
- **learned lore chunks** (what they’ve heard/read)
- **bias parameters** (what they emphasize, omit, or reinterpret)
- **forgetting curves** (decay over time)
- **distortions** (rumor drift, agenda-driven reframing)

This creates varied dialogue and prevents a single “database voice.”

Reference:

- Conceptual framework: `../concept/memory-stratification.md`
- NPC behavior semantics: `../concept/npc-disposition-and-dialogue-collapsing.md`

### Memory is not only retrieval

NPC memory should support both:

1. **Recall**: what they can say now (dialogue generation context)
2. **Micro-memory**: durable relationship anchors (what persists across sessions)

In other words:

- NPCs may _talk_ in myths.
- NPCs must _act_ consistently with canonical constraints and durable relationship state.

## Surfacing lore at runtime (composition contract)

When generating prose (location descriptions, NPC dialogue, rumors), compose context intentionally:

1. **Hard constraints** (canon snapshot)
2. **Recent world history** (events relevant to scope)
3. **Narrative texture** (corpus chunks)
4. **Speaker frame** (NPC bias + voice + relationship)

This composition contract ensures:

- lore feels alive and historically grounded
- narration stays within bounded plausibility
- contradictions are either prevented (canon) or framed as diegetic uncertainty (corpus)

Related layering guidance:

- `./hero-prose-layer-convention.md`
- `./layer-overlap-policy.md`
- `./narration-governance.md`

## Governance and safety

### Provenance is non-optional

Every narrative chunk should be attributable to:

- the events it was derived from, and/or
- the canonical facts it referenced.

This makes it possible to:

- regenerate artifacts when canon changes
- explain “why did the NPC say that?”
- audit for drift and contradictions

### Retcons are events, not edits

When canon changes, prefer modeling it as:

- a new event ("RetconIssued" / "CorrectionPublished"), and
- a new version of the affected facts.

Narrative corpus chunks are typically left as-is (history includes misinformation), but you may append counter-narratives ("scholarly correction") as additional chunks.

---

## Cross-references

- Canonical lore facts: `../developer-workflow/lore-authoring.md`
- World events contract: `./world-event-contract.md`
- Sync vs async decision matrix: `./event-classification-matrix.md`
- Memory stratification: `../concept/memory-stratification.md`
- Layering and narration governance: `./narration-governance.md`
