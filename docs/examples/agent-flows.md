# Agent Flows — Examples (concise)

These are **illustrative flows** used to communicate system intent. Some components are implemented today (read-only MCP tools; world event processing), while other components are still specifications (multi-agent orchestration, combat resolution).

## Example A — Accepted Proposal (narrative + state change)

1. Player: "I carefully pry open the rusted chest and look inside."
2. Client → Backend: free-form text
3. Intent Parser → ActionFrame: { verb: 'examine', target: 'chest', manner: 'careful' }
4. Narrative Agent reads MCP tools (toolName contract; e.g. `get-location`, `list-exits`, and later `get-location-context`) for room and chest facts; generates brief narration: "You ease the lid..."
5. Narrative Agent emits advisory WorldEventEnvelope (proposed: chestOpened, contentsPreview)
6. Validator Agent: schema pass, invariants pass, classification pass
7. Proposal enqueued: WorldEventEnvelope → queue processor applies deterministic updates (inventory changes), emits telemetry
8. Player receives narration + result (item added to inventory)

## Example B — Rejected Proposal (safety or invariant fail)

1. Player: "I chant the forbidden summoning words at the shrine."
2. Intent Parser → ActionFrame
3. Narrative Agent emits advisory proposal
4. Safety / Classification Agent flags content as disallowed
5. Validator rejects proposal; Aggregator chooses fallback
6. Fallback: Narrative Agent returns safe alternative narration (e.g., "You hesitate; the shrine remains silent.")
7. Telemetry records rejection reason and classification outcome

## Example C — Combat Flow (combat agent + deterministic resolution)

1. Player: "I draw my sword and attack the bandit captain."
2. Client → Backend: free-form text
3. Intent Parser → ActionFrame(s):
    - { verb: 'attack', target: 'bandit captain', weapon: 'sword', stance: 'aggressive' }
4. Prevalidation (deterministic, fast): validate the request is _eligible_ for combat resolution before spending agent/model budget.
    - Target exists and is attackable (entity resolution in the current location)
    - Player is present and able to act (not incapacitated; has required weapon if specified)
    - Any rate limits / cooldowns / turn constraints pass (defense-in-depth; gateway-first for external clients)
    - If prevalidation fails: return a safe 4xx or narrative fallback (no combat resolution performed)
5. Combat Agent fetches structured context via MCP tools (toolName contract):
    - `get-player-context` (inventory, recent actions, current location)
    - `get-location-context` (nearby entities/exits, recent events)
    - (optional) `get-recent-events` (scope: location/player) for immediate continuity
6. Combat Agent resolves the round using D&D 5e-style mechanics (no direct writes):
    - Selects an action economy slice (e.g., Action: melee attack; optional bonus action if applicable)
    - Determines attack roll: d20 + attacker modifier vs target AC
    - On hit: computes damage dice + modifier; applies resist/vuln/immunity if modeled
    - On 20 (crit): doubles damage dice (house rule configurable)
    - Updates combat state proposal (HP deltas, conditions, positioning) as an advisory envelope
7. Validator Agent:
    - Schema pass (proposal shape)
    - Invariants pass (e.g., target exists, player is present, conditions are valid)
    - Safety/classification pass (combat narration remains within policy)
8. Proposal enqueued: WorldEventEnvelope → queue processor applies deterministic updates (combat state, inventory durability if modeled), emits telemetry.
9. Narrative Agent composes player-facing output from the resolved outcome (short, factual + flavor):
    - "Your blade flashes—steel bites into his guard. He staggers back, bleeding."
10. Player receives narration + updated state summary (HP/conditions visible to the player, plus next prompt).

These example flows are intentionally short; expand as needed in `docs/modules/narration-governance.md` and `docs/modules/player-interaction-and-intents.md`.

## Notes & References (the meta behind the examples)

Implemented today:

- Read-only MCP tool registrations and the canonical tool catalog: `docs/architecture/agentic-ai-and-mcp.md` and `backend/src/mcp/`
- Queue-based event contract and processor semantics: `docs/architecture/world-event-contract.md`

Specifications / planned components referenced by these examples:

- Intent parsing → structured actions (ActionFrame / Intent IR): `docs/modules/player-interaction-and-intents.md` and `docs/architecture/intent-parser-agent-framework.md`
- Validator pipeline for narration/layer outputs (classification → invariants → acceptance/rejection telemetry): `docs/modules/narration-governance.md`
- Combat agent orchestration patterns (agent routing, policy validation concepts): `docs/architecture/intent-parser-agent-framework.md` and `docs/architecture/dnd-5e-agent-framework-integration.md`
