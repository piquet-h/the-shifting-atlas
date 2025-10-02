# Roadmap Implementation Order

Source of truth: `roadmap/implementation-order.json`

| Order | Issue | Title | Milestone | Scope | Type | Status |
| ----- | ----- | ----- | --------- | ----- | ---- | ------ |
| 1 | #4 | Implement Cosmos Gremlin Location Persistence |  | scope:world | feature | Done |
| 2 | #7 | Player Bootstrap & Persistence |  | scope:world | feature | Done |
| 3 | #49 | Managed Identity & Key Vault Secret Management Baseline |  | scope:security | infra | Todo |
| 4 | #5 | Introduce EXIT Edge Model & Link Rooms |  | scope:traversal | feature | In progress |
| 5 | #6 | Movement Command (HttpMovePlayer) |  | scope:traversal | feature | Todo |
| 6 | #9 | LOOK Command (HttpLook) |  | scope:traversal | feature | Todo |
| 7 | #13 | Direction Normalization Utility (Stage 1) |  | scope:traversal | feature | Todo |
| 8 | #33 | Landmark & Semantic Direction Normalization (N2) |  | scope:traversal | feature | Todo |
| 9 | #34 | Relative Direction Handling (N3) |  | scope:traversal | feature | Done |
| 10 | #48 | Exit Proposal Staging Store |  | scope:traversal | feature | Todo |
| 11 | #35 | Exit Generation Fallback & Event Emission (N4) |  | scope:traversal | feature | Todo |
| 12 | #8 | Exits Summary Cache Generation Utility |  | scope:traversal | feature | Todo |
| 13 | #12 | Seed Script: Anchor Locations & Exits |  | scope:devx | feature | Todo |
| 14 | #15 | Smoke Test Script (Movement Loop) |  | scope:devx | test | Todo |
| 15 | #14 | Integration Test Harness (Traversal + Persistence) |  | scope:devx | test | Todo |
| 16 | #10 | Telemetry Event Registry Expansion |  | scope:observability | feature | Todo |
| 17 | #11 | Gremlin RU & Latency Telemetry Wrapper |  | scope:observability | feature | Todo |
| 18 | #52 | Learn more page |  | scope:core | enhancement | Todo |
| 19 | #45 | World Event Queue Processor Skeleton |  | scope:systems | feature | Todo |
| 20 | #40 | Lore Canonical Fact Store (CRUD + Versioning) |  | scope:world | feature | Todo |
| 21 | #36 | Biome & Environmental Tag Registry Scaffold |  | scope:world | feature | Todo |
| 22 | #44 | Description Layering Engine & Render Pipeline |  | scope:world | feature | Todo |
| 23 | #63 | ADR-001: Mosswell Persistence & Tokenless Description Layering |  | scope:world | docs | Todo |
| 24 | #66 | M-P2A: Structural Event Layer Simulation Script |  | scope:world | test | Todo |
| 25 | #71 | Gremlin Health Check Function (HttpGremlinHealth) |  | scope:observability | feature | Todo |
| 26 | #64 | M-P1: Mosswell Persistence Bootstrap (Anchors & Attributes) |  | scope:world | feature | In progress |
| 27 | #37 | Prompt Template Registry & Versioned Metadata |  | scope:ai | feature | Todo |
| 28 | #38 | MCP Read-Only Servers: world-query & lore-memory |  | scope:mcp | feature | Todo |
| 29 | #41 | Application Insights Correlation & OpenTelemetry Wiring |  | scope:observability | infra | Todo |
| 30 | #50 | AI Cost & Token Usage Telemetry + Budget Guardrails |  | scope:observability | feature | Todo |
| 31 | #46 | Telemetry MCP Server (Read-Only) |  | scope:mcp | feature | Todo |
| 32 | #39 | AI Structured Response Validator & Schema Gate |  | scope:ai | feature | Todo |
| 33 | #47 | AI Moderation Pipeline Phase 1 |  | scope:ai | feature | Todo |
| 34 | #42 | Security Baseline: Rate Limiting & Input Validation |  | scope:security | infra | Todo |
| 35 | #22 | Automate implementation order assignment for new issues using Copilot |  | scope:devx | enhancement | Done |
| 36 | #26 | ✨ Set up Copilot instructions |  | scope:devx | enhancement | Done |
| 37 | #21 | Remove text in logged in header |  | scope:devx | enhancement | Done |
| 38 | #24 | "Create your explorer" fails |  | scope:world | bug | Done |
| 39 | #28 | Frontend Managed API not deploying properly |  | scope:devx | bug | Done |
| 40 | #30 | Ensure correct Issue board status in Projects |  | scope:devx | enhancement | Done |
| 41 | #17 | DI Suitability Report |  | scope:devx | docs | Todo |
| 42 | #53 | Rooms discovered should be dynamic and renamed |  | scope:traversal | enhancement | Todo |
| 43 | #55 | Player Command Intent Schema & Validator (PI-0) |  | scope:systems | feature | Todo |
| 44 | #56 | Heuristic Player Command Parser Design (PI-0) |  | scope:systems | feature | Todo |
| 45 | #57 | Managed API Player Command Endpoint Contract (PI-2 Prep) |  | scope:systems | feature | Todo |
| 46 | #58 | Clarification Loop Interaction Design (PI-2) |  | scope:systems | feature | Todo |
| 47 | #59 | Player Command Telemetry & Evaluation Harness (PI-0/PI-1) |  | scope:observability | test | Todo |
| 48 | #60 | Local LLM Intent Extraction Design (PI-1) |  | scope:ai | feature | Todo |
| 49 | #70 | ADR-001: Acceptance & Cross-Linking |  | scope:devx | docs | Todo |
| 50 | #72 | Persistence Strict Fallback Guard |  | scope:world | feature | Todo |
| 51 | #69 | M-P5: Description Telemetry & Integrity Hash Job |  | scope:observability | feature | Todo |
| 52 | #68 | M-P4: Layer Validator (Immutability, Contradiction, Length) |  | scope:world | feature | Todo |
| 53 | #67 | M-P3: Ambient Snippet Registry & Deterministic Selection |  | scope:world | feature | Todo |
| 54 | #65 | M-P2: Description Composer Minimal (Base + Structural Layers) |  | scope:world | feature | Todo |
| 55 | #51 | (Conditional) Provision Dedicated Key Vault & Bicep Amend |  | scope:security | infra | Todo |
| 56 | #74 | ADR-001 Appendix: Cosmos Partition Key Decision |  | scope:world | docs | In progress |
| 57 | #73 | Persistence Concurrency Idempotency Race Test |  | scope:world | test | Todo |
| 58 | #19 | Only create DI Suitability Issue if needed |  | scope:devx | enhancement | Todo |
| 59 | #18 | DI Suitability Report |  | scope:devx | docs | Todo |

## Next Up

| Order | Issue | Status | Title |
| ----- | ----- | ------ | ----- |
| 3 | #49 | Todo | Managed Identity & Key Vault Secret Management Baseline |
| 4 | #5 | In progress | Introduce EXIT Edge Model & Link Rooms |
| 5 | #6 | Todo | Movement Command (HttpMovePlayer) |
| 6 | #9 | Todo | LOOK Command (HttpLook) |
| 7 | #13 | Todo | Direction Normalization Utility (Stage 1) |

Last sync: 2025-10-02T12:31:02.227Z
