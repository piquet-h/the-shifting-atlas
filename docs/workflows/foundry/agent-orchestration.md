# Workflow: Foundry Agent Orchestration (Multi-Agent Patterns)

**Purpose**: Describe multi-agent coordination patterns for The Shifting Atlas when using Azure AI Foundry (or any hosted agent runtime) without leaking portal-specific assumptions.

This document focuses on **sequencing and enforcement**.

## Read this first

- Runtime-agnostic authority boundary and tool surface contracts: `../../architecture/agentic-ai-and-mcp.md`
- Narration validator pipeline mechanics: `../../architecture/narration-governance.md`
- D&D 5e integration contracts (role topology and responsibilities): `../../design-modules/dnd5e-foundry-agent-architecture.md`

## Principle: runtime is swappable

Foundry is an optional runtime. The orchestration patterns below must remain valid whether execution happens:

- in backend-controlled orchestration (Azure Functions), or
- in a hosted runtime (Foundry or equivalent)

What must not change:

- authoritative persistence boundaries
- validation gates
- tool schemas / contracts

## Prototype-first posture (recommended)

For rapid iteration on prompts and tool selection, prefer:

- local website (frontend) for UX
- backend (Functions) for orchestration (so secrets are not exposed)
- MCP tool surface for authoritative reads/writes

This keeps orchestration deterministic and testable.

## Orchestration shape (conceptual)

A canonical loop looks like:

1. Receive player input
2. Fetch authoritative context
3. Invoke the primary narrator role
4. If the model requests a tool call:
    - invoke the tool through the authoritative surface
    - feed the tool result back into the model
5. Repeat until the model produces a final response
6. Apply validation gates for any proposed state changes
7. Persist validated changes
8. Return narration

This is intentionally described without SDK syntax.

## Scenario: Combat encounter

1. **Player**: “I attack the goblin with my sword.”
2. **Orchestrator** classifies the action as combat and gathers authoritative context:
    - player stats/context
    - location/environment context
    - combat state (if an existing combat instance is active)
3. **DM Narrator** delegates mechanics to **combat-resolver**.
4. **Combat Resolver**:
    - queries reference data (SRD) as needed
    - computes a structured outcome (rolls/effects)
    - returns a result object suitable for validation and persistence
5. **Validation gate**:
    - confirm target exists and is in scope
    - confirm rules prerequisites are satisfied
    - confirm any mutations (HP changes, conditions) are consistent
6. **Commit** validated combat effects via authoritative boundary.
7. **DM Narrator** renders the player-facing narration of the validated result.

## Scenario: Spell casting

1. **Player**: “I cast Fireball at the goblins.”
2. **Orchestrator** gathers authoritative context:
    - caster stats (level, spell slots)
    - location/environment context
    - target entities in scope
3. **DM Narrator** delegates validation to **spell-authority**.
4. **Spell Authority**:
    - queries SRD reference data
    - validates casting constraints
    - returns structured spell effects (DC, damage formula, affected targets)
5. **Combat Resolver** (or combat subsystem) applies effects and returns a structured combat outcome.
6. **Validation gate**:
    - ensure targets are in range
    - ensure slot consumption/constraints are satisfied
7. **Commit** validated spell effects and any state changes.
8. **DM Narrator** narrates the outcome.

## Failure and retry guidance

- Tool timeouts should not result in invented canonical facts.
- If orchestration cannot obtain required authoritative context, return an explicit deferral (“I need X to continue”) rather than guessing.
- Validation rejection should produce a safe alternative path (suggested actions) without committing.

## Related docs

- Foundry setup (portal/SDK): `../../deployment/foundry-setup-checklist.md`
- Copy/paste system instructions: `../../deployment/agent-system-instructions-reference.md`

---

_Last updated: 2026-01-30_
