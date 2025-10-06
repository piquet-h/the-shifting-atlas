# Roadmap Implementation Order

Source of truth: Project field 'Implementation order'

| Order | Issue | Title | Milestone | Scope | Type | Status |
| ----- | ----- | ----- | --------- | ----- | ---- | ------ |
| 1 | #76 | Infra: Provision Cosmos SQL API containers for players, inventory, layers, events |  | scope:core | infra | Done |
| 2 | #4 | Implement Cosmos Gremlin Location Persistence |  | scope:world | feature | Done |
| 3 | #7 | Player Bootstrap & Persistence |  | scope:world | feature | Done |
| 4 | #49 | Managed Identity & Key Vault Secret Management Baseline |  | scope:security | infra | Done |
| 5 | #5 | Introduce EXIT Edge Model & Link Rooms |  | scope:traversal | feature | Todo |
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
| 16 | #14 | Integration Test Harness (Traversal + Persistence) |  | scope:devx | test | Todo |
| 17 | #10 | Telemetry Event Registry Expansion |  | scope:observability | feature | Todo |
| 18 | #11 | Gremlin RU & Latency Telemetry Wrapper |  | scope:observability | feature | Todo |
| 19 | #52 | Epic: Learn More Page & Automated Content |  | scope:devx | epic | Todo |
| 20 | #45 | World Event Queue Processor Skeleton |  | scope:systems | feature | Done |
| 21 | #40 | Lore Canonical Fact Store (CRUD + Versioning) |  | scope:world | feature | Todo |
| 22 | #36 | Biome & Environmental Tag Registry Scaffold |  | scope:world | feature | Todo |
| 23 | #44 | Description Layering Engine & Render Pipeline |  | scope:world | feature | Todo |
| 24 | #63 | ADR-001: Mosswell Persistence & Tokenless Description Layering |  | scope:world | docs | Todo |
| 25 | #66 | M-P2A: Structural Event Layer Simulation Script |  | scope:world | test | Todo |
| 26 | #71 | Gremlin Health Check Function (HttpGremlinHealth) |  | scope:observability | feature | Todo |
| 27 | #64 | Epic: Mosswell Bootstrap & Repository Foundations |  | scope:world | epic | Todo |
| 28 | #37 | Prompt Template Registry & Versioned Metadata |  | scope:ai | feature | Todo |
| 29 | #38 | MCP Read-Only Servers: world-query & lore-memory |  | scope:mcp | feature | Todo |
| 30 | #41 | Application Insights Correlation & OpenTelemetry Wiring |  | scope:observability | infra | Todo |
| 31 | #50 | AI Cost & Token Usage Telemetry + Budget Guardrails |  | scope:observability | feature | Todo |
| 32 | #79 | Observability: Capture Gremlin RU + latency telemetry for critical ops |  | scope:observability | enhancement | Todo |
| 33 | #46 | Telemetry MCP Server (Read-Only) |  | scope:mcp | feature | Todo |
| 34 | #39 | AI Structured Response Validator & Schema Gate |  | scope:ai | feature | Todo |
| 35 | #47 | AI Moderation Pipeline Phase 1 |  | scope:ai | feature | Todo |
| 36 | #42 | Security Baseline: Rate Limiting & Input Validation |  | scope:security | infra | Todo |
| 37 | #22 | Automate implementation order assignment for new issues using Copilot |  | scope:devx | enhancement | Done |
| 38 | #26 | ✨ Set up Copilot instructions |  | scope:devx | enhancement | Done |
| 39 | #21 | Remove text in logged in header |  | scope:devx | enhancement | Done |
| 40 | #24 | "Create your explorer" fails |  | scope:world | bug | Done |
| 41 | #28 | Frontend Managed API not deploying properly |  | scope:devx | bug | Done |
| 42 | #30 | Ensure correct Issue board status in Projects |  | scope:devx | enhancement | Done |
| 43 | #17 | DI Suitability Report |  | scope:devx | docs | Done |
| 44 | #53 | Rooms discovered should be dynamic and renamed |  | scope:traversal | enhancement | Todo |
| 45 | #55 | Player Command Intent Schema & Validator (PI-0) |  | scope:systems | feature | Todo |
| 46 | #56 | Heuristic Player Command Parser Design (PI-0) |  | scope:systems | feature | Todo |
| 47 | #57 | Managed API Player Command Endpoint Contract (PI-2 Prep) |  | scope:systems | feature | Todo |
| 48 | #58 | Clarification Loop Interaction Design (PI-2) |  | scope:systems | feature | Todo |
| 49 | #59 | Player Command Telemetry & Evaluation Harness (PI-0/PI-1) |  | scope:observability | test | Todo |
| 50 | #60 | Local LLM Intent Extraction Design (PI-1) |  | scope:ai | feature | Todo |
| 51 | #70 | ADR-001: Acceptance & Cross-Linking |  | scope:devx | docs | Todo |
| 52 | #72 | Persistence Strict Fallback Guard |  | scope:world | feature | Todo |
| 53 | #69 | Epic: Description Telemetry & Integrity Monitoring |  | scope:observability | epic | Todo |
| 54 | #68 | Epic: Layer Validator & Similarity Guardrails |  | scope:world | epic | Todo |
| 55 | #67 | Epic: Ambient Context Registry |  | scope:ai | epic | Todo |
| 56 | #65 | M-P2: Description Composer Minimal (Base + Structural Layers) |  | scope:world | feature | Todo |
| 57 | #51 | (Conditional) Provision Dedicated Key Vault & Bicep Amend |  | scope:security | infra | Todo |
| 58 | #74 | ADR-001 Appendix: Cosmos Partition Key Decision |  | scope:world | docs | Done |
| 59 | #73 | Persistence Concurrency Idempotency Race Test |  | scope:world | test | Todo |
| 60 | #19 | Only create DI Suitability Issue if needed |  | scope:devx | enhancement | Done |
| 61 | #18 | DI Suitability Report |  | scope:devx | docs | Done |
| 62 | #78 | Script: Region-based graph partition migration scaffold |  | scope:core | feature | Todo |
| 63 | #77 | Feature: Player SQL projection repository & write-through from Gremlin |  | scope:core | feature | Todo |
| 64 | #80 | Docs: Integrate ADR-002 references & update architecture diagram notes |  | scope:devx | docs | Done |

## Next Up

| Order | Issue | Status | Title |
| ----- | ----- | ------ | ----- |
| 5 | #5 | Todo | Introduce EXIT Edge Model & Link Rooms |
| 6 | #6 | Todo | Movement Command (HttpMovePlayer) |
| 7 | #9 | Todo | LOOK Command (HttpLook) |
| 8 | #13 | Todo | Direction Normalization Utility (Stage 1) |
| 9 | #33 | Todo | Landmark & Semantic Direction Normalization (N2) |

Last sync: 2025-10-06T03:23:28.932Z
