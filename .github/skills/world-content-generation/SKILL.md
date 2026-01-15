---
name: world-content-generation
description: Generate or refine world lore, locations, NPCs, factions, and prompt templates for The Shifting Atlas while respecting established docs, D&D constraints, and traversal invariants.
---

# World content generation skill

Use this skill when you are asked to:

- Create or revise world lore, factions, NPCs, locations, quests, or narrative tone.
- Author/modify world prompt templates under `shared/src/prompts/**`.
- Review world-facing content for consistency (tone, lore, traversal invariants).

Do **not** use this skill for:

- Backend persistence implementation details (belongs in `backend/`).
- Infrastructure/Bicep work (belongs in `infrastructure/`).

## Source-of-truth rules

1. Prefer **linking to existing docs** over generating new canonical lore.
2. When new lore is necessary, add it to the correct layer under `docs/` (MECE) rather than embedding it in code.
3. Prompt templates should reference **doc filenames/sections**, not copy entire lore blocks.

High-signal references:

- Tenets: `docs/tenets.md`
- Exits + traversal invariants: `docs/concept/exits.md`
- Direction resolution: `docs/concept/direction-resolution-rules.md`
- DM tone: `docs/concept/dungeon-master-style-guide.md`

## Content invariants

### Locations

- Each location should have **2–4 meaningful exits** (unless intentionally a dead-end, which must be narratively justified).
- Exit directions are constrained to the canonical set (see `docs/concept/exits.md`).
- Locations must be **connected** to the broader world; avoid isolated “content islands”.

### Exits (narrative)

When describing exits, avoid bare mechanical labels. Prefer diegetic phrasing:

- Good: “A narrow goat track slips north into the fog.”
- Good: “Stone steps descend into the undercroft.”
- Avoid: “North exit.”

### NPCs

- NPCs must have consistent voice, motivation, and faction alignment across encounters.
- Dialogue should include optional skill-check affordances (Insight/Deception/etc.) when it enriches play.
- Anti-griefing posture: NPCs should discourage disruptive behavior via _world-consistent consequences_.

### Factions

- Factions must have distinct goals and constraints.
- Territorial/political implications should show up in location flavor and quest hooks.

## Prompt authoring rules (for `shared/src/prompts/**`)

- Keep templates **composable** (smaller building blocks over monolith prompts).
- Store canonical templates in code modules (example: `shared/src/prompts/worldTemplates.ts`).
- Avoid “one-off” prompt strings inside runtime code; prefer importing shared templates.
- Don’t bake implementation details into prompts (no container names, no env vars, no repo paths beyond doc references).

### Example: prompt template structure

When you add a new template, provide:

- purpose (1–2 lines)
- required inputs (explicit list)
- output format contract (explicit)
- references (doc links)

## Quality checklist

Before finishing a world-content change:

- Does this belong in the right doc layer (Vision/Tenets/Design Modules/Architecture/Roadmap/Examples)?
- Did we avoid duplicating lore in multiple places?
- Are exits/directions consistent with invariants?
- Is the content specific to _The Shifting Atlas_ (not generic fantasy filler)?
- If this is a prompt change: is it reusable and versioned?

---

Last reviewed: 2026-01-15
