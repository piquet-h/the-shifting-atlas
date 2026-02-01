# Workflow: Resolve Player Command (Single Turn)

**Purpose**: Define the canonical single-turn execution flow for resolving a player command using an agent runtime (Foundry-hosted or backend-controlled) while preserving authority boundaries.

This document describes **sequencing and enforcement**, not gameplay rules.

## Scope

This workflow covers:

- one player input (a single command)
- one resolution cycle (authoritative reads → deterministic outcome or validated proposal → narration)
- no long-running multi-turn state machine

## Preconditions

- The player identity is known (guest GUID or authenticated identity mapped to player GUID)
- A correlation ID exists for the request (generated upstream if not provided)
- An authoritative tool surface exists for world/player reads (see `../../architecture/agentic-ai-and-mcp.md`)

## Invariants (non-negotiable)

- **Canonical state is authoritative**: narration may explain outcomes but must not invent canonical facts.
- **All canonical writes cross validation**: agents may propose; only deterministic validators/policy gates may commit.

See:

- `../../architecture/agentic-ai-and-mcp.md#b-authority-boundary-canonical-state-vs-narrative-plausibility`
- `../../architecture/narration-governance.md`

## Sequence (happy path)

1. **Accept input**
    - Receive `{ playerId, inputText, correlationId }`.
    - Normalize trivial whitespace and enforce input size limits.

2. **Parse intent (non-mutating)**
    - Identify the player’s intent category (e.g., navigation, perception, interaction, combat, magic).
    - Determine which authoritative context is required (player state, location state, nearby entities, recent events).
    - Interaction mode vocabulary (explicit dialogue vs implicit/fast-forward) and canonicality boundary are defined in `../../concept/interaction-modes-and-canonicality.md`.

3. **Fetch authoritative context (read)**
    - Query canonical sources through tools (MCP and/or backend endpoints).
    - Do not infer missing facts; if required context is absent, stop and request specific additional context.

4. **Resolve outcome (deterministic or proposal-gated)**
    - If the action is purely descriptive/perception: produce a non-mutating result and proceed to narration.
    - If the action may mutate state:
        - produce an explicit **proposal** (structured, machine-validated)
        - run validators/policy gates
        - on success, commit mutation via the authoritative boundary
        - on failure, produce a refusal/alternate suggestion without committing.

5. **Compose narration (post-outcome)**
    - Narration is downstream framing of the validated outcome.
    - Apply narration governance (classification, length bounds, drift checks) as appropriate.

6. **Emit observability signals**
    - Ensure the correlation ID is propagated to all downstream tool calls and logged events.
    - Emit a single high-level “command resolved” signal (details are implementation-specific).

7. **Return response**
    - Return a single response payload containing:
        - the resolved outcome (structured)
        - player-facing narration (text/HTML)
        - provenance/correlation metadata (as available)

## Failure modes

- **Missing context**: request additional tool calls (or return a partial response with explicit uncertainty).
- **Tool failure / timeout**: abort resolution and return a safe “try again” response; do not guess canonical facts.
- **Validation reject**: do not commit; narrate why (within bounds) and suggest valid alternatives.

## Notes

- This workflow intentionally avoids portal/UI specifics and SDK syntax.
- Foundry setup steps belong in `../../deployment/foundry-setup-checklist.md`.

---

_Last updated: 2026-01-30_
