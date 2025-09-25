# Extension Framework

> Related: [Quest & Dialogue Trees](quest-and-dialogue-trees.md) · [Economy & Trade Systems](economy-and-trade-systems.md) · [AI Prompt Engineering](ai-prompt-engineering.md) · [Factions & Governance](factions-and-governance.md)

## Vision

To empower developers and creators to **expand the game world** with custom content, mechanics, and experiences — without breaking immersion, lore, or performance.  
The Extension Framework provides a **structured, modular set of APIs and tools** that allow safe, scalable, and creative additions to the core game, ensuring every extension feels like a natural part of the living world.

---

## Core Capabilities

### Quest & Dungeon Creation Tools

- Design **custom quests** with branching narratives, multiple outcomes, and player‑driven consequences.
- Build **dungeons** with unique layouts, hazards, puzzles, and reward structures.
- Integrate with world state so quest and dungeon outcomes can influence factions, events, or environments.

### Item & NPC Injection Interfaces

- Add new **items** with custom stats, rarity tiers, crafting recipes, and special effects.
- Introduce **NPCs** with dialogue trees, persistent memory, faction alignment, and AI‑driven behaviors.
- Support for **faction‑aware NPCs** that react dynamically to player reputation and world events.

### World Event Scripting

- Schedule **time‑based events**, invasions, or festivals.
- Trigger **environmental changes** such as weather shifts, disasters, or resource availability.
- Enable **faction control changes** and territory disputes as part of scripted or emergent events.

### Versioning & Sandbox Isolation

- Test extensions in **isolated environments** before live deployment.
- Manage **version compatibility** to prevent conflicts with core systems or other extensions.
- Rollback capabilities for safe iteration and recovery.

---

## Developer Experience

### Modular API Access

- Clear, well‑documented endpoints for interacting with quests, NPCs, items, and events.
- Secure authentication and permission controls for extension authors.

### Extension Discovery & Sharing

- In‑game marketplace or repository for community‑created extensions.
- Ratings, reviews, and feedback systems for quality control.

### World Integration Guidelines

- Lore consistency checks and thematic alignment tools.
- Performance profiling to ensure stability and scalability.

---

## Expanded Design Notes

| Capability            | Example Use Case                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Quest/Dungeon Tools   | A modder creates a branching questline where player choices determine which faction gains control of a border town |
| Item/NPC Injection    | Adding a legendary sword with a unique crafting chain and an NPC blacksmith tied to its lore                       |
| World Event Scripting | A seasonal festival that unlocks limited‑time quests and cosmetic rewards                                          |
| Versioning/Sandbox    | Testing a new dungeon’s AI pathfinding in isolation before release                                                 |

---

If you want, I can now **extend this page with a formal API schema** for the Extension Framework — mapping out endpoints, data structures, and integration hooks so it’s immediately developer‑ready for your MMO architecture.

## AI-First Genesis Extension Hooks

Extensions can participate in (but not silently subvert) the AI generation + crystallization pipeline described in `ai-prompt-engineering.md` and referenced by `navigation-and-traversal.md`.

### Hook Surface

| Hook                   | Timing                   | Input                           | Allowed Mutations                              | Purpose                        |
| ---------------------- | ------------------------ | ------------------------------- | ---------------------------------------------- | ------------------------------ |
| `beforeGenesisPrompt`  | Pre model call           | { basePrompt, context }         | Add guidance (<= N chars), add soft tags       | Style / motif steering         |
| `afterGenesisResponse` | Post model raw JSON      | { draft }                       | Remove exits, adjust tags, add advisory flags  | Prune unsafe / redundant exits |
| `beforeCrystallize`    | Pre commit               | { roomDraft, validationReport } | Block (return veto), modify non-critical props | Enforce custom policies        |
| `afterCrystallize`     | Post commit              | { room }                        | Schedule follow-ups (quests, NPC seeds)        | Reactive content seeding       |
| `onLayerProposed`      | New desc layer candidate | { layerDraft }                  | Approve/reject, annotate                       | Curate evolving narrative      |

All hooks execute inside a constrained runtime: synchronous, CPU‑bound only, no outbound arbitrary network (prevent data exfiltration or latency blowouts). Violations disable the extension.

### Policy & Safety Interlock

Extensions cannot:

- Inject raw unmoderated text directly into `descLayers`
- Override safety rejection outcomes
- Downgrade provenance fields

They can:

- Tighten constraints (e.g., enforce regional motif continuity)
- Provide supplemental validation codes
- Tag rooms with extension-specific semantic markers

### Extension Registration Manifest (Draft)

```
{
	"name": "coliseum-expansion-pack",
	"version": "0.1.0",
	"hooks": ["beforeGenesisPrompt","afterCrystallize"],
	"permissions": {
		"maxPromptAppendChars": 180,
		"allowRoomTagging": true,
		"allowExitPrune": true
	},
	"safety": { "requiresModeration": true }
}
```

### Auditing & Telemetry

Events emitted (canonical list in `shared/src/telemetryEvents.ts`; all via `trackGameEventStrict`):

- `Extension.Hook.Invoked` (hook, extensionName, durationMs, success)
- `Extension.Hook.Veto` (hook, reasonCode)
- `Extension.Hook.Mutation` (fieldsChanged)

Extensions with high veto or failure rates are auto‑sandboxed pending review.

### Failure Handling

| Failure Type          | Framework Response                       |
| --------------------- | ---------------------------------------- |
| Timeout               | Abort hook; continue without its changes |
| Exception             | Log & mark extension health degraded     |
| Unauthorized Mutation | Rollback mutation; flag extension        |

### Collaboration with Other Extensions

Hook order is deterministic: sorted by registered extension name ascending. Conflicts resolved by last-write-wins _except_ safety downgrades (blocked). Future enhancement: dependency graph & priority weights.

---

_AI genesis hook section added 2025-09-25 to enable safe extension participation in world creation._

---

### See Also

- **Quest & Dialogue Trees** – Designing branching quests that extensions can register (`quest-and-dialogue-trees.md`).
- **AI Prompt Engineering** – Standardised prompt templates extensions should reuse for consistency (`ai-prompt-engineering.md`).
- **Economy & Trade Systems** – Hooks for market events, item creation, and resource injection (`economy-and-trade-systems.md`).
- **Factions & Governance** – Extension impact on political structures and reputation (`factions-and-governance.md`).
- **Navigation & Traversal** – Injecting new regions, traversal puzzles, and spatial anchors (`navigation-and-traversal.md`).
