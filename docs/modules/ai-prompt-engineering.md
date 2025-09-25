# **Design Document: AI Prompt Engineering**

> STATUS: FUTURE / NOT IMPLEMENTED (2025-09-21). No Azure OpenAI integration, prompt construction utilities, or parsing logic exist in the codebase yet. First AI usage will be postponed until core traversal + persistence are functional.

> Related: [Navigation & Traversal](navigation-and-traversal.md) · [Quest & Dialogue Trees](quest-and-dialogue-trees.md) · [Extension Framework](extension-framework.md) · [World Rules & Lore](world-rules-and-lore.md)

## **Vision**

This module powers the generative backbone of a persistent, MMO-scale text adventure that blends D&D mechanics with dynamic world generation. It enables players to co-create the world through play, with AI-driven location generation, item generation, dialogue trees, quest logic, and contextual continuity.

## **Overview**

The AI Prompt Engineering system constructs, conditions, and parses prompts that drive consistent and immersive world generation using Azure OpenAI. It ensures spatial, thematic, and narrative coherence across the game world, and integrates deeply with item systems, traversal logic, quest logic, NPC behavior, developer extensions, and persistent player identity.

### MCP Integration (Tool-First Prompt Strategy)

All runtime context access for agents will occur through **MCP servers** rather than ad-hoc database queries inside prompts. Early (Phase 0–1) tools are read-only (`world-query-mcp`, `lore-memory-mcp`), while proposal-style mutation (`world-mutation-mcp`) is introduced only after validators mature. Prompt assembly therefore:

1. Resolves structured context via tool calls (rooms, exits, tags, lore facts).
2. Compresses and canonicalizes facts (stable IDs, tag arrays) before inclusion.
3. References entity IDs instead of injecting large verbatim text blocks to minimize tokens.
4. Records `toolCallSummary` (list of tool names + counts) for telemetry correlation.

This pattern reduces prompt drift, enforces least privilege, and allows evolving tool implementations without rewriting prompt templates.

## **AI-First World Genesis & Crystallization**

In this project, AI does not merely decorate pre-authored maps—it originates new Rooms and their exits. Each accepted generation is a **genesis transaction** that becomes part of permanent canonical history. Change thereafter is additive via layered descriptions, not destructive rewrites.

### Lifecycle Stages

1. Intent (exploration trigger / scripted expansion / extension hook)
2. Context Assembly (nearby room snapshot, biome distribution, active factions, motifs, similarity embeddings)
3. Prompt Construction (system + developer + dynamic layers)
4. Model Inference (Azure OpenAI)
5. Validation Gates (schema, safety, duplication, naming, tag hygiene)
6. Staging (pending vertex/edges invisible to players)
7. Crystallization (commit + provenance + telemetry)
8. Post-Commit augmentation (vantage suggestions, exit summary cache, indexing)

### Structured Response Schema (Target)

```
{
	"name": "Gallery of Whispered Echoes",
	"baseDescription": "Tall ribbed arches...",
	"biome": "urban_spire",
	"tags": ["stone","echoing","gallery","subtle_arcane"],
	"candidateExits": [
		{"dir": "south", "kind": "cardinal"},
		{"dir": "up", "kind": "vertical", "narrativeHook": "A spiral of pale steps"}
	],
	"sensory": {"sound": "soft echoes", "scent": "old parchment"},
	"motifs": ["whisper","arch"]
}
```

### Validation Gates (Ordered)

| Gate            | Check                                          | Failure Action                              |
| --------------- | ---------------------------------------------- | ------------------------------------------- |
| Schema          | Required fields present; types valid           | Reject w/ code SCHEMA_MISSING               |
| Safety          | Profanity / disallowed themes                  | Reject → re-prompt with stricter system msg |
| Length          | Description token bounds                       | Truncate or re-summarize                    |
| Name Uniqueness | Normalized collision                           | Append qualifier OR re-prompt               |
| Similarity      | Embedding cosine > threshold                   | Reject w/ DUPLICATE_NEARBY                  |
| Tag Hygiene     | Forbidden combos (e.g. `abyssal` + `festival`) | Remove / re-prompt depending severity       |
| Exit Sanity     | Duplicate dirs or invalid kind                 | Auto-dedup or reject                        |

### Provenance Capture

Each crystallized Room stores:

```
provenance: {
	genSource: 'ai',
	model: 'gpt-4o-mini',
	promptHash: 'sha256:...',
	nearbyRoomIds: ['r1','r2','r3'],
	similarityScores: { closest: 0.81 },
	safety: { verdict: 'clean', policyVersion: '1.0.0' },
	approvedBy: 'auto',
	createdUtc: '2025-09-25T12:34:00Z'
}
```

### Layered Description Integration

Generated text becomes either the `baseDescription` (if new Room) or an appended `descLayer` (if event / environmental / faction change). Base text is never overwritten—subsequent AI adds context layers referencing prior states.

### Prompt Assembly Architecture

| Layer          | Source           | Example Payload                            |
| -------------- | ---------------- | ------------------------------------------ |
| System         | Core constraints | Tone, safety boundaries, JSON contract     |
| Anchor         | Project config   | Style pillars; banned patterns             |
| Regional       | Biome / zone     | Climate, hazard hints, faction tension     |
| Local Snapshot | Nearby Rooms     | Names, tags, motifs (compressed)           |
| Player / Event | Trigger context  | Actor role, event type, motivation         |
| Extension      | Plugin injection | Extra tags, quest hooks, gating conditions |

Merging rules: lower layer keys override only if whitelisted; otherwise aggregated (e.g., tags union, motifs weighted).

#### Prompt Template Registry & Versioning

Templates are retrieved through `prompt-template-mcp` to ensure:

- Immutable versions (semantic name + semver + SHA256 hash)
- Reproducibility (hash stored alongside each AI decision)
- Change review (diff old/new template bodies before rollout)

Example template metadata (conceptual):

```
{
	"name": "room.genesis.biomeForest",
	"version": "0.3.1",
	"hash": "sha256:...",
	"purpose": "Generate initial forest room",
	"safetyPolicyVersion": "1.1.0"
}
```

### Advisory vs Authoritative Modes

| Mode                     | Usage (Phase)                    | Output Persistence                         |
| ------------------------ | -------------------------------- | ------------------------------------------ |
| Advisory                 | Ambience, NPC flavor lines (0–1) | Cached ephemeral layer; can be dropped     |
| Proposal                 | Quest seed, dialogue branch (2+) | Validated → emits domain event → persisted |
| Authoritative (Deferred) | Possibly rule expansions (3+)    | Only if validator passes + policy allows   |

All generation begins in advisory or proposal mode—**no direct authoritative writes** to the graph.

### Similarity & Duplication Control

- Maintain vector embeddings for each Room (offloaded to vector store)
- Pre-gen: compute embedding of candidate description; compare to k nearest (k=10)
- If max similarity ≥ threshold (e.g., 0.92) → rejection w/ DUPLICATE_NEARBY
- Soft variant: allow but inject mandatory differentiator prompt clause

### Cost & Budget Management

- Daily token budget; hard stop at 100% with grace queue
- Telemetry attributes: `promptTokens`, `completionTokens`, `latencyMs`, `cacheHit`
- Rolling 7‑day smoothing to detect anomalous spikes

### Moderation Flow (Minimal → Advanced)

| Phase | Mechanism                          | Output Persistence                     |
| ----- | ---------------------------------- | -------------------------------------- |
| 1     | Automated policy regex + allowlist | Direct if clean                        |
| 2     | LLM-based safety classification    | Direct if low-risk                     |
| 3     | Human spot review (sample %)       | Already persisted; rollback if flagged |
| 4     | Adaptive sampling (risk-weighted)  | Dynamic sample ratio                   |

### Extension Hooks

- `beforeGenesisPrompt(context)` → mutate assembled prompt (bounded operations only)
- `afterGenesisResponse(rawJson)` → validate or attach custom tags
- `beforeCrystallize(roomDraft)` → veto / modify non-core fields
- `afterCrystallize(room)` → schedule follow-up (quests, NPC spawn)

Security: Hooks operate on sanitized objects; must be pure (no external network) in consumption plan env.

### Failure Handling & Re-Prompt Strategy

| Failure Code     | Strategy                                              |
| ---------------- | ----------------------------------------------------- |
| SCHEMA_MISSING   | Add explicit schema reminder + reduce creativity temp |
| SAFETY_FLAG      | Insert stricter tone & banned list enumerations       |
| DUPLICATE_NEARBY | Add uniqueness clause referencing overlapping tags    |
| EXIT_INVALID     | Regenerate exits only (partial repair)                |
| LENGTH_EXCESS    | Request summary pass with token target                |

### Telemetry Events

Canonical event names (defined in `shared/src/telemetryEvents.ts`) use `Domain.[Subject].Action` PascalCase form and are emitted exclusively via `trackGameEventStrict`:

- `Prompt.Genesis.Issued` (promptTokens, completionTokens?, latencyMs, cacheHit)
- `Prompt.Genesis.Rejected` (failureCode, retryCount)
- `Prompt.Genesis.Crystallized` (tokens, similarity, safetyVerdict)
- `Prompt.Layer.Generated` (layerType, roomId)
- `Prompt.Cost.BudgetThreshold` (percent)
- `Prompt.Tooling.ContextResolved` (toolCallSummaryHash, toolCount, cached)

Adding a new AI prompt event requires updating the canonical list + test in `shared/test/telemetryEvents.test.ts`.

### Testing Strategy (Pre-Code)

- Golden prompt fixtures → deterministic hashed expected structure
- Fuzz tests for malformed AI JSON (injection of trailing prose) → parser resilience
- Similarity gate unit tests with synthetic embeddings
- Red-team prompt corpus for safety regressions

### Tool Call Budget & Safeguards

Each AI task enforces:

- `maxToolCalls` (default 6) before forced summarization
- `maxPromptTokens` & `maxCompletionTokens` per purpose
- Early termination strategy if validation repeatedly fails (exponential backoff on retries)

Repeated identical advisory generations (same `contextHash`) short-circuit and reuse the prior accepted text to conserve tokens.

---

_AI-first genesis pipeline section added 2025-09-25 to align with crystallization strategy._

## **Core Capabilities**

### Prompt Construction and Conditioning ⚙️

- Built dynamically from player actions, location metadata, traversal context, item state, quest status, NPC memory, and persistent player identity
- Inputs include vector hints, biome continuity, emotional tone, generation constraints, item-based modifiers, and player role tags
- Example: “Generate a new forest location approximately 10 units north of Whispering Glade. Nearby is Mossy Hollow. Ensure biome continuity and avoid naming conflicts.”

### Contextual Awareness and Continuity 🧭

- Reflects spatial relationships, mood, elevation, environmental features, NPC memory, and player role
- Exit descriptions match destination metadata
- Supports narrative stitching, environmental foreshadowing, and multiplayer consistency

### AI Response Parsing 🧠

- Extracts structured metadata: name, description, biome, mood, elevation, hazards, tags, item hooks, dialogue nodes
- Enables location generation, item placement, and quest dialogue population

### Generative Systems 🌱

#### Item Generation 🪙

- Descriptions, inscriptions, and lore hints use sensory language
- Flavor text adapts to world changes, quest outcomes, player reputation, and player role
- Rare items include historical references, faction ties, and environmental storytelling

#### Dialogue and Quest Trees 🗣️

- Dialogue nodes reflect emotional tone, player stats, alignment, prior interactions, and persistent role
- Supports deception, persuasion, intimidation, and empathy mechanics
- Quest trees include branching logic, dependencies, and dynamic availability
- NPC memory and relationships influence dialogue tone and quest access
- Fallback paths ensure graceful degradation

#### NPC Behavior 👥

- Emotional profiles, faction alignment, historical context, and relationship webs
- Dialogue style reflects personality traits and speech quirks
- NPCs access dynamic knowledge bases and lore hooks
- Temporal awareness enables seasonal and anniversary-based variation

#### Quest Lifecycle 🎯

- Generated from biome, faction, NPC context, player state, and player role
- Activated via dialogue, environmental triggers, or item acquisition
- Progression tracked through quest stages and world changes
- Resolution includes multiple outcomes based on choices and moral alignment
- Impacts NPC relationships, faction reputation, and future quest availability

### Anti-Griefing Mechanics 🚫

- Flags disruptive behavior: sabotaging quests, harassment, exploitation
- Reduces success rates, narrative richness, and interaction quality
- Propagates through prompt conditioning to influence NPC hostility, loot filtering, and emotional tone
- NPCs respond with suspicion, avoidance, or aggression
- Loot generation excludes rare or faction-tied items
- Dialogue and quest access reflect player reputation, history, and role

### Spatial and Temporal Integration 🗺️⏳

- Prompts influence directional heuristics and vector topology
- Location generation respects proximity thresholds and reuses nearby nodes
- Retroactive portals added with narrative justification
- Prompts reflect player-triggered changes (e.g., clearing vines, building bridges, looting items)
- AI updates descriptions to reflect world evolution and quest impact
- Each prompt and response annotated with timestamps, player IDs, and role tags

### Safety and Developer Extensions 🛡️🧑‍💻

- Prompts conditioned to avoid unsafe, offensive, or disruptive content
- Filters enforce tone, style, and thematic boundaries
- Developers can inject custom prompts for regions, quests, items, NPCs, and traversal puzzles
- Templates support biome seeding, vector fields, item hooks, dialogue nodes, and narrative flavor
- Safety validation ensures injected prompts respect spatial, factional, item, and role logic

## **System Interaction Flow** 🔄

[Player Input] ↓  
[Traversal Trigger, Item Use, Dialogue Initiation, or Quest Action] ↓  
[Prompt Construction] → Includes griefing flags, reputation score, behavioral history, and role tags ↓  
[Azure OpenAI] ↓  
[AI Response Parsing] → Filters rare items, adjusts NPC tone, restricts quest access ↓  
[Location Generation or Tailoring] + [Item Placement] + [Dialogue Tree Population] ↓  
[Graph Persistence] → [Cosmos DB] ↓  
[Temporal Tagging] → [World Evolution] ↓  
[Narrative Stitching] → Reflects diminished rewards and social consequences

## **Future Expansion** 🚀

- Pre-generated quest paths with prompt chaining and thematic continuity
- Branching logic and re-stitching for alternate routes
- NPC pathing using prompt-driven vector goals
- Multiplayer prompt conditioning for shared world

---

### See Also

- **Navigation & Traversal** – Supplies spatial vectors and biome context for location generation (`navigation-and-traversal.md`).
- **Quest & Dialogue Trees** – Consumes structured dialogue/quest outputs from parsing (`quest-and-dialogue-trees.md`).
- **Extension Framework** – How third-party extensions inject custom prompt templates (`extension-framework.md`).
- **World Rules & Lore** – Canonical biome, timeline, and thematic constraints for prompt conditioning (`world-rules-and-lore.md`).
- **Player Identity & Roles** – Role tags and alignment influencing tone and outcomes (`player-identity-and-roles.md`).
