# Roadmap Implementation Order

Source of truth: `roadmap/implementation-order.json`

| Order | Issue | Title | Milestone | Scope | Type | Status |
| ----- | ----- | ----- | --------- | ----- | ---- | ------ |
| 1 | #74 | ADR-001 Appendix: Cosmos Partition Key Decision |  | scope:world | docs |  |
| 2 | #4 | Implement Cosmos Gremlin Location Persistence |  | scope:world | feature | Done |
| 3 | #7 | Player Bootstrap & Persistence |  | scope:world | feature | Done |
| 4 | #49 | Managed Identity & Key Vault Secret Management Baseline |  | scope:security | type:infra |  |
| 5 | #5 | Introduce EXIT Edge Model & Link Rooms |  | scope:traversal | feature | In progress |
| 6 | #6 | Movement Command (HttpMovePlayer) |  | scope:traversal | feature | Todo |
| 7 | #9 | LOOK Command (HttpLook) |  | scope:traversal | feature | Todo |
| 8 | #13 | Direction Normalization Utility (Stage 1) |  | scope:traversal | feature | Todo |
| 9 | #33 | Landmark & Semantic Direction Normalization (N2) |  | scope:traversal | feature | Todo |
| 10 | #34 | Relative Direction Handling (N3) |  | scope:traversal | feature | Done |
| 11 | #48 | Exit Proposal Staging Store |  | scope:traversal | feature | Todo |
| 12 | #35 | Exit Generation Fallback & Event Emission (N4) |  | scope:traversal | feature | Todo |
| 13 | #8 | Exits Summary Cache Generation Utility |  | scope:traversal | feature | Todo |
| 14 | #12 | Seed Script: Anchor Locations & Exits |  | scope:devx | feature | Todo |
| 15 | #15 | Smoke Test Script (Movement Loop) |  | scope:devx | test | Todo |
| 16 | #14 | Integration Test Harness (Traversal + Persistence) |  | scope:devx | test |  |
| 17 | #10 | Telemetry Event Registry Expansion |  | scope:observability | feature | Todo |
| 18 | #11 | Gremlin RU & Latency Telemetry Wrapper |  | scope:observability | feature | Todo |
| 19 | #45 | World Event Queue Processor Skeleton |  | scope:systems | feature | Todo |
| 20 | #40 | Lore Canonical Fact Store (CRUD + Versioning) |  | scope:world | feature | Todo |
| 21 | #36 | Biome & Environmental Tag Registry Scaffold |  | scope:world | feature | Todo |
| 22 | #44 | Description Layering Engine & Render Pipeline |  | scope:world | feature | Todo |
| 23 | #63 | ADR-001: Mosswell Persistence & Tokenless Description Layering |  | scope:world | type:docs |  |
| 24 | #66 | M-P2A: Structural Event Layer Simulation Script |  | scope:world | type:test |  |
| 25 | #71 | Gremlin Health Check Function (HttpGremlinHealth) |  | scope:observability | feature |  |
| 26 | #64 | M-P1: Mosswell Persistence Bootstrap (Anchors & Attributes) |  | scope:world | type:feature |  |
| 27 | #37 | Prompt Template Registry & Versioned Metadata |  | scope:ai | feature | Todo |
| 28 | #38 | MCP Read-Only Servers: world-query & lore-memory |  | scope:mcp | feature | Todo |
| 29 | #41 | Application Insights Correlation & OpenTelemetry Wiring |  | scope:observability | infra | Todo |
| 30 | #50 | AI Cost & Token Usage Telemetry + Budget Guardrails |  | scope:observability | type:feature |  |
| 31 | #46 | Telemetry MCP Server (Read-Only) |  | scope:mcp | feature | Todo |
| 32 | #52 | Learn more page |  |  | enhancement | Todo |
| 33 | #39 | AI Structured Response Validator & Schema Gate |  | scope:ai | feature | Todo |
| 34 | #47 | AI Moderation Pipeline Phase 1 |  | scope:ai | feature | Todo |
| 35 | #42 | Security Baseline: Rate Limiting & Input Validation |  | scope:security | infra | Todo |
| 36 | #22 | Automate implementation order assignment for new issues using Copilot |  | scope:devx | enhancement | Done |
| 37 | #26 | ✨ Set up Copilot instructions |  | scope:devx | enhancement | Done |
| 38 | #21 | Remove text in logged in header |  | scope:devx | enhancement | Done |
| 39 | #24 | "Create your explorer" fails |  | scope:world | bug | Done |
| 40 | #28 | Frontend Managed API not deploying properly |  | scope:devx | bug | Done |
| 41 | #30 | Ensure correct Issue board status in Projects |  | scope:devx | enhancement | Done |
| 42 | #17 | DI Suitability Report |  | scope:devx | docs |  |
| 43 | #53 | Rooms discovered should be dynamic and renamed |  |  |  | Todo |
| 44 | #55 | Player Command Intent Schema & Validator (PI-0) |  | scope:systems | feature | Todo |
| 45 | #56 | Heuristic Player Command Parser Design (PI-0) |  | scope:systems | feature | Todo |
| 46 | #57 | Managed API Player Command Endpoint Contract (PI-2 Prep) |  | scope:systems | feature | Todo |
| 47 | #58 | Clarification Loop Interaction Design (PI-2) |  | scope:systems | feature | Todo |
| 48 | #59 | Player Command Telemetry & Evaluation Harness (PI-0/PI-1) |  | scope:observability | test |  |
| 49 | #60 | Local LLM Intent Extraction Design (PI-1) |  | scope:ai | feature | Todo |
| 50 | #70 | ADR-001: Acceptance & Cross-Linking |  | scope:devx | type:docs |  |
| 51 | #72 | Persistence Strict Fallback Guard |  | scope:world | feature | Todo |

## Next Up

| Order | Issue | Status | Title |
| ----- | ----- | ------ | ----- |
| 1 | #74 |  | ADR-001 Appendix: Cosmos Partition Key Decision |
| 4 | #49 |  | Managed Identity & Key Vault Secret Management Baseline |
| 5 | #5 | In progress | Introduce EXIT Edge Model & Link Rooms |
| 6 | #6 | Todo | Movement Command (HttpMovePlayer) |
| 7 | #9 | Todo | LOOK Command (HttpLook) |

Last sync: 2025-10-02T11:30:56.024Z
