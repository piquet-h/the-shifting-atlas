# Roadmap Implementation Order

Source of truth: `roadmap/implementation-order.json`

| Order | Issue | Title | Milestone | Scope | Type | Status |
| ----- | ----- | ----- | --------- | ----- | ---- | ------ |
| 1 | #68 | M-P4: Layer Validator (Immutability, Contradiction, Length) |  | scope:world | feature | Todo |
| 2 | #74 | ADR-001 Appendix: Cosmos Partition Key Decision |  | scope:world | docs |  |
| 3 | #4 | Implement Cosmos Gremlin Location Persistence |  | scope:world | feature | Done |
| 4 | #7 | Player Bootstrap & Persistence |  | scope:world | feature | Done |
| 5 | #49 | Managed Identity & Key Vault Secret Management Baseline |  | scope:security | type:infra |  |
| 6 | #5 | Introduce EXIT Edge Model & Link Rooms |  | scope:traversal | feature | In progress |
| 7 | #6 | Movement Command (HttpMovePlayer) |  | scope:traversal | feature | Todo |
| 8 | #9 | LOOK Command (HttpLook) |  | scope:traversal | feature | Todo |
| 9 | #13 | Direction Normalization Utility (Stage 1) |  | scope:traversal | feature | Todo |
| 10 | #33 | Landmark & Semantic Direction Normalization (N2) |  | scope:traversal | feature | Todo |
| 11 | #34 | Relative Direction Handling (N3) |  | scope:traversal | feature | Done |
| 12 | #48 | Exit Proposal Staging Store |  | scope:traversal | feature | Todo |
| 13 | #35 | Exit Generation Fallback & Event Emission (N4) |  | scope:traversal | feature | Todo |
| 14 | #8 | Exits Summary Cache Generation Utility |  | scope:traversal | feature | Todo |
| 15 | #12 | Seed Script: Anchor Locations & Exits |  | scope:devx | feature | Todo |
| 16 | #15 | Smoke Test Script (Movement Loop) |  | scope:devx | test | Todo |
| 17 | #14 | Integration Test Harness (Traversal + Persistence) |  | scope:devx | test |  |
| 18 | #10 | Telemetry Event Registry Expansion |  | scope:observability | feature | Todo |
| 19 | #11 | Gremlin RU & Latency Telemetry Wrapper |  | scope:observability | feature | Todo |
| 20 | #45 | World Event Queue Processor Skeleton |  | scope:systems | feature | Todo |
| 21 | #40 | Lore Canonical Fact Store (CRUD + Versioning) |  | scope:world | feature | Todo |
| 22 | #36 | Biome & Environmental Tag Registry Scaffold |  | scope:world | feature | Todo |
| 23 | #44 | Description Layering Engine & Render Pipeline |  | scope:world | feature | Todo |
| 24 | #63 | ADR-001: Mosswell Persistence & Tokenless Description Layering |  | scope:world | type:docs |  |
| 25 | #66 | M-P2A: Structural Event Layer Simulation Script |  | scope:world | test |  |
| 26 | #71 | Gremlin Health Check Function (HttpGremlinHealth) |  | scope:observability | feature | Todo |
| 27 | #64 | M-P1: Mosswell Persistence Bootstrap (Anchors & Attributes) |  | scope:world | feature |  |
| 28 | #37 | Prompt Template Registry & Versioned Metadata |  | scope:ai | feature | Todo |
| 29 | #38 | MCP Read-Only Servers: world-query & lore-memory |  | scope:mcp | feature | Todo |
| 30 | #41 | Application Insights Correlation & OpenTelemetry Wiring |  | scope:observability | infra | Todo |
| 31 | #50 | AI Cost & Token Usage Telemetry + Budget Guardrails |  | scope:observability | type:feature |  |
| 32 | #46 | Telemetry MCP Server (Read-Only) |  | scope:mcp | feature | Todo |
| 33 | #52 | Learn more page |  |  | enhancement | Todo |
| 34 | #39 | AI Structured Response Validator & Schema Gate |  | scope:ai | feature | Todo |
| 35 | #47 | AI Moderation Pipeline Phase 1 |  | scope:ai | feature | Todo |
| 36 | #42 | Security Baseline: Rate Limiting & Input Validation |  | scope:security | infra | Todo |
| 37 | #22 | Automate implementation order assignment for new issues using Copilot |  | scope:devx | enhancement | Done |
| 38 | #26 | ✨ Set up Copilot instructions |  | scope:devx | enhancement | Done |
| 39 | #21 | Remove text in logged in header |  | scope:devx | enhancement | Done |
| 40 | #24 | "Create your explorer" fails |  | scope:world | bug | Done |
| 41 | #28 | Frontend Managed API not deploying properly |  | scope:devx | bug | Done |
| 42 | #30 | Ensure correct Issue board status in Projects |  | scope:devx | enhancement | Done |
| 43 | #17 | DI Suitability Report |  | scope:devx | docs |  |
| 44 | #53 | Rooms discovered should be dynamic and renamed |  |  |  | Todo |
| 45 | #55 | Player Command Intent Schema & Validator (PI-0) |  | scope:systems | feature | Todo |
| 46 | #56 | Heuristic Player Command Parser Design (PI-0) |  | scope:systems | feature | Todo |
| 47 | #57 | Managed API Player Command Endpoint Contract (PI-2 Prep) |  | scope:systems | feature | Todo |
| 48 | #58 | Clarification Loop Interaction Design (PI-2) |  | scope:systems | feature | Todo |
| 49 | #59 | Player Command Telemetry & Evaluation Harness (PI-0/PI-1) |  | scope:observability | test |  |
| 50 | #60 | Local LLM Intent Extraction Design (PI-1) |  | scope:ai | feature | Todo |
| 51 | #70 | ADR-001: Acceptance & Cross-Linking |  | scope:devx | type:docs |  |
| 52 | #72 | Persistence Strict Fallback Guard |  | scope:world | feature | Todo |
| 53 | #69 | M-P5: Description Telemetry & Integrity Hash Job |  | scope:observability | feature | Todo |
| 54 | #67 | M-P3: Ambient Snippet Registry & Deterministic Selection |  | scope:world | feature | Todo |
| 55 | #65 | M-P2: Description Composer Minimal (Base + Structural Layers) |  | scope:world | feature | Todo |

## Next Up

| Order | Issue | Status | Title |
| ----- | ----- | ------ | ----- |
| 1 | #68 | Todo | M-P4: Layer Validator (Immutability, Contradiction, Length) |
| 2 | #74 |  | ADR-001 Appendix: Cosmos Partition Key Decision |
| 5 | #49 |  | Managed Identity & Key Vault Secret Management Baseline |
| 6 | #5 | In progress | Introduce EXIT Edge Model & Link Rooms |
| 7 | #6 | Todo | Movement Command (HttpMovePlayer) |

Last sync: 2025-10-02T11:31:49.157Z
