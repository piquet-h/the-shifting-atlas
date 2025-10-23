# Open Ambiguities / Documentation Gaps (Post-Cleanup)

This list captures areas where existing code or near-term planned work references concepts now only lightly documented after the consolidation sweep. Provide clarifications or green-light new mini‑docs where appropriate.

| Area                                 | Current Reference                                                     | Ambiguity                                                                        | Proposed Resolution                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| External Identity Upgrade Flow       | `overview.md` (brief mention), legacy player bootstrap tests          | Exact claim mapping & upgrade trigger not spelled out                            | Add a short section to `overview.md` once Entra integration begins (scope after traversal persistence). |
| ~~Exit Creation & Validation~~       | ~~`developer-workflow/edge-management.md` (still verbose)~~           | ~~Minimal invariants summary missing in module index~~                           | ✅ **RESOLVED:** Invariants documented in `exits.md`; direction resolution rules detailed in `direction-resolution-rules.md`. |
| Description Layer Validator Rules    | `modules/description-layering-and-variation.md` (long)                | Quick list of layer categories + validation gates not summarized                 | Add a compact appendix or collapse module doc (future).                                                 |
| Telemetry Lint Enforcement           | Mentioned in `observability.md`                                       | Rule not implemented; naming enforcement relies on convention only               | Create ESLint custom rule (pattern already noted) and reference it once shipped.                        |
| World Event Queue Cutover            | `world-event-contract.md` + references in condensed architecture docs | Timeline/trigger for refactor from direct writes to queued events not enumerated | See [Queue Cutover Checklist](architecture/world-event-contract.md#queue-cutover-checklist-direct-writes--event-processing) in world-event-contract.md for implementation steps. |
| MCP Server Boundary (Read vs Mutate) | `agentic-ai-and-mcp.md`                                               | Mutating tool admission criteria not summarized anywhere else                    | Add decision gate list (schema pass, safety pass, deterministic replay) to MCP doc header.              |
| Player Command Intent Parsing Phases | Roadmap (removed numbered issue list)                                 | Phase labels (PI-0..PI-2) no longer described                                    | If still desired, add a brief glossary in `modules/player-interaction-and-intents.md`.                  |
| ~~WorldEvent Model Separation~~      | `domainModels.ts`, `events/worldEventSchema.ts`                       | ~~Two WorldEvent-related interfaces caused confusion~~                           | ✅ **RESOLVED:** JSDoc comments added clarifying WorldEvent (SQL persistence) vs WorldEventEnvelope (queue contract). See issue #146. |

## Next Actions (Recommend)

1. Implement telemetry ESLint rule (prevents drift before volume increases).
2. ~~Produce a 1-page `exits.md` summarizing direction normalization + reciprocity expectations.~~ ✅ **COMPLETED** – See `exits.md` and `direction-resolution-rules.md`.
3. Collapse description layering doc to invariants + validator outline once engine code lands (avoid speculative sections surviving).
4. Add Entra identity upgrade flow diagram only when code begins (avoid premature design fossilization).

_Last updated: 2025-10-22_
