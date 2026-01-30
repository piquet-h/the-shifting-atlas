# **Design Document: AI Prompt Engineering**

> STATUS: FUTURE / NOT IMPLEMENTED (2025-09-21). No Azure OpenAI integration, prompt construction utilities, or parsing logic exist in the codebase yet. First AI usage will be postponed until core traversal + persistence are functional.

> Related: [Navigation & Traversal](navigation-and-traversal.md) · [Quest & Dialogue Trees](quest-and-dialogue-trees.md) · [Extension Framework](extension-framework.md) · [World Rules & Lore](world-rules-and-lore.md)

## **Vision**

This module powers the generative backbone of a persistent, MMO-scale text adventure that blends D&D mechanics with dynamic world generation. It enables players to co-create the world through play, with AI-driven location generation, item generation, dialogue trees, quest logic, and contextual continuity.

## **Overview**

The AI Prompt Engineering system constructs, conditions, and parses prompts that drive consistent and immersive world generation using Azure OpenAI. It ensures spatial, thematic, and narrative coherence across the game world, and integrates deeply with item systems, traversal logic, quest logic, NPC behavior, developer extensions, and persistent player identity.

### MCP Integration (Tool-First Prompt Strategy)

All runtime context access for agents will occur through **MCP servers** rather than ad-hoc database queries inside prompts. Early (Stages M3–M4) tools are read-only (WorldContext-*, Lore-*), while proposal-style mutation (`world-mutation-mcp`) is introduced only after validators mature (Stage M5+). Prompt assembly therefore:

1. Resolves structured context via tool calls (locations, exits, tags, lore facts).
2. Compresses and canonicalizes facts (stable IDs, tag arrays) before inclusion.
3. References entity IDs instead of injecting large verbatim text blocks to minimize tokens.
4. Records `toolCallSummary` (list of tool names + counts) for telemetry correlation.

This pattern reduces prompt drift, enforces least privilege, and allows evolving tool implementations without rewriting prompt templates.

## **AI-First World Genesis & Crystallization**

In this project, AI does not merely decorate pre-authored maps—it originates new Locations and their exits. Each accepted generation is a **genesis transaction** that becomes part of permanent canonical history. Change thereafter is additive via layered descriptions, not destructive rewrites.

### Lifecycle Stages

1. Intent (exploration trigger / scripted expansion / extension hook)
2. Context Assembly (nearby location snapshot, biome distribution, active factions, motifs, similarity embeddings)
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

Each crystallized Location stores:

```
provenance: {
	genSource: 'ai',
	model: 'gpt-4o-mini',
	promptHash: 'sha256:...',
	nearbyLocationIds: ['l1','l2','l3'],
	similarityScores: { closest: 0.81 },
	safety: { verdict: 'clean', policyVersion: '1.0.0' },
	approvedBy: 'auto',
	createdUtc: '2025-09-25T12:34:00Z'
}
```

### Layered Description Integration (Tokenless Model)

Generated text becomes either the immutable `baseDescription` (genesis) or an appended additive layer (`descLayer`) per the tokenless system defined in `description-layering-and-variation.md`. The model is **never** asked to regenerate the whole base for routine weather/time variation; instead it may produce short ambient or structural event snippets under strict constraints (no structural contradictions, length bound). Validators enforce:

1. Base immutability (hash check)
2. Structural consistency with attribute map
3. No unauthorized permanent nouns in non‑structural layers
4. Length / safety bounds

### Prompt Assembly Architecture

| Layer          | Source           | Example Payload                             |
| -------------- | ---------------- | ------------------------------------------- |
| System         | Core constraints | Tone, safety boundaries, JSON contract      |
| Anchor         | Project config   | Style pillars; banned patterns              |
| Regional       | Biome / zone     | Climate, hazard hints, faction tension      |
| Local Snapshot | Nearby Locations | Names, tags, motifs (compressed)            |
| Player / Event | Trigger context  | Actor role, event type, motivation          |
| Character      | Player profile   | Background, narrative capabilities, history |
| Extension      | Plugin injection | Extra tags, quest hooks, gating conditions  |

Merging rules: lower layer keys override only if whitelisted; otherwise aggregated (e.g., tags union, motifs weighted).

#### Character-Driven Capability Adjudication

> **Philosophy**: The AI DM evaluates player actions using **character-driven adjudication** rather than mechanical skill checks. See [`../concept/character-driven-roleplaying.md`](../concept/character-driven-roleplaying.md) for foundational principles.

When the AI DM receives a player command with character context, it must:

1. Consider the character's **background** and established **narrative capabilities**
2. Evaluate **plausibility** based on character fiction, not numerical stats
3. Frame outcomes **narratively** rather than as pass/fail mechanics
4. Maintain **consistency** with previously demonstrated capabilities

**Prompt Template Pattern** (capability-assessment):

```
SYSTEM INSTRUCTION:
You are the AI Dungeon Master for The Shifting Atlas. Players describe actions based on who their character is—their background, experiences, and demonstrated capabilities. You adjudicate outcomes narratively, considering character plausibility rather than skill checks or dice rolls.

PLAYER CHARACTER CONTEXT:
Name: {character_name}
Background: {background_name}
Narrative Capabilities: {narrative_capabilities_list}
Character History: {brief_history}
Previously Demonstrated Skills: {demonstrated_capabilities}

CURRENT SITUATION:
Location: {location_name}
Present Entities: {entities_list}
Environmental Factors: {conditions}

PLAYER ACTION DECLARATION:
"{player_command_text}"

EXTRACTED INTENT:
Action: {verb}
Target: {target}
Justification: "{justification}" (from player's statement)
Background Reference: {background_reference}

ADJUDICATION INSTRUCTIONS:
1. Does the character's background support this action?
   - Check if "{background_reference}" appears in their background or capabilities
   - Consider if the justification aligns with their established character

2. Have they demonstrated related capabilities before?
   - Review {demonstrated_capabilities} for similar actions

3. Are situational factors reasonable?
   - Assess {conditions} and {entities_list} for plausibility barriers

4. Does this maintain narrative consistency?
   - Would this fit naturally in their ongoing story?

RESPONSE FORMAT:
If PLAUSIBLE: Narrate success with character-specific flavor referencing their background
If IMPLAUSIBLE: Narrate natural consequence (not mechanical failure) explaining why this doesn't fit
If BORDERLINE: Introduce complication or partial success that respects the attempt

IMPORTANT:
- DO NOT use phrases like "you roll," "skill check," or "DC"
- DO reference their specific background/experience in the narration
- DO frame outcomes as natural story consequences
- DO acknowledge creative approaches that fit the character
```

**Example Prompt Usage**:

```
PLAYER CHARACTER CONTEXT:
Name: Aria Stormchaser
Background: Former Cartographer's Apprentice
Narrative Capabilities:
- Interpret maps and cartographic symbols
- Navigate by celestial observation
- Estimate distances from landmarks
- Understand surveying techniques
Character History: Apprenticed to the Royal Cartographer before an expedition changed her life
Previously Demonstrated Skills: Successfully navigated by stars (session 3), recognized ancient survey markers (session 5)

CURRENT SITUATION:
Location: Forgotten Archive
Present Entities: Ancient map table, dust-covered scrolls
Environmental Factors: Low light, fragile materials

PLAYER ACTION DECLARATION:
"I examine the map table—my cartographic training should help me recognize what region this depicts"

EXTRACTED INTENT:
Action: examine
Target: map_table
Justification: "my cartographic training"
Background Reference: "cartographer"

ADJUDICATION:
✅ Background explicitly supports this (Former Cartographer's Apprentice)
✅ Narrative capabilities include "Interpret maps and cartographic symbols"
✅ Situational factors reasonable (map table is present)
✅ Consistent with previous demonstrations

RESPONSE:
"Your apprenticeship serves you well. Despite years of dust, your trained eye immediately recognizes the projection style—late Third Era regional surveys, judging by the grid markings and elevation notation. The map depicts the Eastern Highlands, though several locations are marked with symbols you've never seen before—perhaps sites lost to time."
```

**Implausible Example**:

```
PLAYER ACTION DECLARATION:
"I use my keen understanding of religious doctrine to decipher the map symbols"

EXTRACTED INTENT:
Action: examine
Target: map_table
Justification: "understanding of religious doctrine"
Background Reference: "religious"

ADJUDICATION:
❌ Background is "Former Cartographer's Apprentice" not religious scholar
❌ Narrative capabilities don't include religious knowledge
⚠️ Player may be confused or exploring character development

RESPONSE (with gentle redirection):
"You study the symbols intently, but your cartographic training didn't include much religious iconography. These markings are surveyor's notations—distance measurements and elevation markers—rather than sacred symbols. However, you do notice one corner of the map features what might be a temple complex, marked with an unfamiliar glyph."
```

**Partial Success Example**:

```
PLAYER ACTION DECLARATION:
"As a former cartographer, I try to repair the torn section of the ancient map"

ADJUDICATION:
✅ Background supports map knowledge
⚠️ No established capability in restoration/repair specifically
⚠️ Environmental factor: materials are fragile

RESPONSE (complication):
"Your knowledge of cartographic conventions helps you understand which pieces likely connect, but the parchment is more fragile than the survey maps you worked with. You manage to carefully align two major sections, revealing a previously hidden mountain pass—but a third fragment crumbles at your touch, losing detail from the western border permanently."
```

#### Prompt Construction for Character Context

When building prompts that involve player actions:

**Required Context Fields**:

- `characterBackground`: String (e.g., "Former Cartographer's Apprentice")
- `narrativeCapabilities`: Array of strings (from character creation)
- `demonstratedCapabilities`: Array of {capability, sessionReference} (tracked over time)
- `characterQualities`: Object (descriptive qualities from character creation)

**Optional Context**:

- `characterHistory`: Brief narrative summary
- `recentActions`: Last 3-5 relevant actions for continuity
- `reputationTags`: Any earned recognition (e.g., "known_climber")

**Anti-Patterns to Avoid in Prompts**:

- ❌ "Roll a Cartography check with +2 bonus"
- ❌ "The DC for this action is 15"
- ❌ "Add your Intelligence modifier to the roll"
- ❌ Including skill proficiency lists
- ❌ Asking for numerical attribute applications

**Correct Patterns**:

- ✅ "Consider whether the character's background as a sailor supports swimming ability"
- ✅ "Evaluate if this action fits their established narrative capabilities"
- ✅ "Frame the outcome as a natural story consequence"
- ✅ "Reference their specific experience in the response"

#### Capability Tracking & Evolution

Over time, the system should track:

**Demonstrated Capabilities Log**:

```json
{
    "playerId": "guid",
    "demonstratedCapabilities": [
        {
            "capability": "climbing rough stone walls",
            "firstDemonstrated": "2025-11-15T10:23:00Z",
            "context": "Successfully climbed tower in Session 3",
            "timesUsed": 4,
            "lastUsed": "2025-11-20T14:30:00Z"
        }
    ]
}
```

This log feeds into future adjudication prompts: "They've successfully climbed similar surfaces 4 times before."

**Emergent Recognition**:
When a capability is demonstrated 3+ times successfully, it can be added to their recognized capabilities with a narrative note in-game:

> "Your repeated success navigating by the stars has become second nature—even other explorers have started asking you for guidance."

#### Prompt Template Registry & Versioning

Templates should be sourced from the canonical prompt templates folder in `shared/src/prompts/` (and optionally exposed via backend helper endpoints) to ensure:

- Deterministic review (prompt text is version-controlled)
- Reproducibility (a prompt hash can be stored alongside AI decisions)
- Change review (diff old/new template bodies before rollout)

Example template metadata (conceptual):

```
{
	"name": "location.genesis.biomeForest",
	"version": "0.3.1",
	"hash": "sha256:...",
	"purpose": "Generate initial forest location",
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

- Maintain vector embeddings for each Location (offloaded to vector store)
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
- `afterCrystallize(location)` → schedule follow-up (quests, NPC spawn)

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
- `Prompt.Layer.Generated` (layerType, locationId)
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
