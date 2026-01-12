# Agent Flows — Examples (concise)

## Example A — Accepted Proposal (narrative + state change)

1. Player: "I carefully pry open the rusted chest and look inside."
2. Client → Backend: free-form text
3. Intent Parser → ActionFrame: { verb: 'examine', target: 'chest', manner: 'careful' }
4. Narrative Agent reads MCP tools (e.g. `World-getLocation` / `World-listExits`, and later `WorldContext-*`) for room and chest facts; generates brief narration: "You ease the lid..."
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

These example flows are intentionally short; expand as needed in `docs/modules/narration-governance.md` and `docs/modules/player-interaction-and-intents.md`.
