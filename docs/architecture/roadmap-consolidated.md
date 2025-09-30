# Consolidated System Design & Roadmap

> Snapshot Date: 2025-09-30 – This document unifies the architectural intent, active implementation sequence, and near-term expansion tasks into a single concise reference. It supersedes fragmented status notes in other docs; detailed deep dives (AI prompt engineering, traversal, lore) remain authoritative for domain nuance.

## 1. Vision (One Paragraph)

A persistent, event‑driven, graph‑backed text world where player commands mutate canonical state via queued world events; AI augments (never overwrites) human-authored layers; MCP tool servers provide least‑privilege read context; telemetry + security guardrails inform iterative expansion.

## 2. Core Architectural Pillars

| Pillar               | Principle                                           | Current Slice                                                              |
| -------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Event-Driven         | Async world evolution via queued events             | Queue processor skeleton pending (#45)                                     |
| Stateless Compute    | Functions with idempotent persistence adapters      | Ping only implemented                                                      |
| Graph-First          | Locations & exits as Cosmos Gremlin vertices/edges  | Location persistence not implemented (#4 Done reflects tracking, not code) |
| Additive Content     | Base text + layered descriptions                    | Layer engine not built (#44)                                               |
| MCP Boundary         | Read-only tool servers precede mutation             | World/lore servers planned (#38, #46)                                      |
| Telemetry Governance | Allow-listed event names, correlation, RU + latency | Registry & RU wrapper issues (#10, #11)                                    |
| Secure by Default    | Least input surface + throttling                    | Baseline incoming (#42)                                                    |

## 3. Phase / Capability Mapping

| Phase               | Capability Cluster                               | Key Issues (Order TBD revision) |
| ------------------- | ------------------------------------------------ | ------------------------------- |
| Foundation          | Location + Player persistence                    | #4, #7                          |
| Traversal Core      | Exits, Move, Look, Exit Cache                    | #5, #6, #9, #8                  |
| Normalization N1–N4 | Direction parsing & generation fallback          | #13, #33, #34, #35              |
| DevX Harness        | Seed + Smoke + Integration tests                 | #12, #15, #14                   |
| Observability       | Event registry, RU wrapper, OTel wiring          | #10, #11, #41                   |
| Security Baseline   | Rate limiting + validation                       | #42                             |
| World Semantics     | Biomes, tag registry, lore fact store            | #36, #40                        |
| AI Read Layer       | Prompt registry, schema validator, MCP read-only | #37, #39, #38, #46              |
| Content Layering    | Description layer engine + moderation            | #44, #47                        |
| Generation Feedback | Exit generation fallback + proposal staging      | #35, #48                        |
| Event Processing    | Queue processor skeleton                         | #45                             |

## 4. Current Gaps (Now Tracked)

Added issues since audit: description layering (#44), world event processor (#45), telemetry MCP (#46), moderation phase 1 (#47), exit proposal staging (#48). Remaining future (not yet ticketed):

1. Managed Identity & Secrets Migration (Key Vault + RBAC)
2. Player Command Parser (frontend consolidation) – may emerge after traversal MVP.
3. AI Cost Budget Telemetry (Prompt.Cost events emission)

## 5. Implementation Order Rationale (Updated)

Normalization stages (N1–N4) were previously out of sequence (N3 ahead of N1). Consolidated order groups: foundation → traversal → normalization ladder → devx harness → observability & security → world semantics → AI read → content layering & proposals → systems processors → completed historical items.

## 6. High-Level Data & Event Model

```text
PlayerCommand(Http) -> Validate -> (Optional Immediate Read Response)
                     -> Enqueue WorldEvent(type=MoveRequested|LayerProposed|ExitProposed)
QueueTrigger(WorldEvent) -> Idempotency Check -> Apply Graph Mutation / Layer Append -> Emit Telemetry
```

WorldEvent Envelope: `{ eventId, type, occurredUtc, payload, version }`

Description Rendering: `baseDescription + active(descLayers ordered) + exitsSummaryCache`

Exit Proposal Flow: generation fallback (#35) -> proposal staging (#48) -> acceptance creates EXIT edge -> cache invalidation.

## 7. Telemetry Strategy (Near-Term)

Emit on: command issuance, location upsert, movement outcome, RU + latency (Gremlin wrapper), layering additions, exit proposals, moderation rejections. Correlate via shared correlation ID header; later link queue spans (#41).

## 8. Security & Compliance Baseline

Short term: IP / player rate limiting (#42), strict direction + ID validation. Mid-term: move secrets to Key Vault (new issue) & adopt managed identity for Cosmos. Long-term: player auth integration (Entra) mapping claims -> player GUID.

## 9. Simplified “Next 10” Focus (Chronological Work Set)

1. Re-sequence implementation order (apply updated JSON & doc)
2. Implement minimal Location & Player persistence (#4, #7 true implementation parity)
3. EXIT model + Move + Look (#5, #6, #9)
4. Exit cache (#8) & Direction N1 (#13)
5. N2–N4 (#33,#34,#35)
6. Seed + Smoke + Integration tests (#12,#15,#14)
7. Telemetry registry + RU wrapper + OTel (#10,#11,#41)
8. Security baseline (#42)
9. Biomes/Tags + Lore fact store (#36,#40)
10. Prompt registry + Validator + MCP read-only (#37,#39,#38)

## 10. Acceptance / Exit Criteria Per Phase (Abbrev)

| Phase                | Exit Criteria                                                                         |
| -------------------- | ------------------------------------------------------------------------------------- |
| Foundation           | CRUD for Location & Player passes tests; telemetry fired.                             |
| Traversal Core       | Movement & Look stable across sessions; exit cache hit ratio >60% in tests.           |
| Normalization Ladder | N1–N4 implemented with ambiguity & generation telemetry.                              |
| DevX Harness         | CI runs in <60s; smoke script fails fast on traversal break.                          |
| Observability        | RU + latency captured for all Gremlin calls; traces correlated (trace id continuity). |
| Security             | 429 on over-limit; invalid IDs normalized or rejected with structured errors.         |
| World Semantics      | Registry validation fails on unknown tags; lore fact versioning working.              |
| AI Read              | Templates retrieved with hash validation; MCP servers respond read-only.              |
| Content Layering     | Layers added & rendered deterministically; moderation rejects unsafe text.            |
| Generation Feedback  | Exit proposals queue visible; accepted proposals mutate graph.                        |

## 11. Deferred / Explicitly NOT In Scope (Now)

- AI mutation tools (world-mutation-mcp)
- Economy & factions dynamic systems
- Personalization layers (player-specific descriptions)
- Advanced moderation (LLM+ risk scoring)
- Bearing precision (Normalization N5) – pending gameplay telemetry justification

## 12. Glossary (Condensed)

| Term       | Meaning                                                |
| ---------- | ------------------------------------------------------ |
| Layer      | Additive description fragment (event/ai/seasonal)      |
| Proposal   | Unapproved AI-suggested edge or layer awaiting vetting |
| WorldEvent | Envelope driving asynchronous state mutation           |
| MCP Server | External tool API exposing controlled read context     |

## 13. Maintenance Notes

- Keep this doc updated whenever implementation-order.json changes (add delta section instead of rewriting history).
- Add new phases only with accompanying rationale & exit criteria.

---

_End of consolidated reference_
