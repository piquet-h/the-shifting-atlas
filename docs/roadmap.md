# Roadmap Implementation Order

Source of truth: `roadmap/implementation-order.json`

| Order | Issue | Title                                                                 | Milestone | Scope               | Type         | Status      |
| ----- | ----- | --------------------------------------------------------------------- | --------- | ------------------- | ------------ | ----------- |
| 1     | #4    | Implement Cosmos Gremlin Location Persistence                         |           | scope:world         | feature      | Done        |
| 2     | #7    | Player Bootstrap & Persistence                                        |           | scope:world         | feature      | In progress |
| 3     | #49   | Managed Identity & Key Vault Secret Management Baseline               |           | scope:security      | type:infra   |             |
| 4     | #5    | Introduce EXIT Edge Model & Link Rooms                                |           | scope:traversal     | feature      | Todo        |
| 5     | #6    | Movement Command (HttpMovePlayer)                                     |           | scope:traversal     | feature      | Todo        |
| 6     | #9    | LOOK Command (HttpLook)                                               |           | scope:traversal     | feature      | Todo        |
| 7     | #13   | Direction Normalization Utility (Stage 1)                             |           | scope:traversal     | feature      | Todo        |
| 8     | #33   | Landmark & Semantic Direction Normalization (N2)                      |           | scope:traversal     | feature      | Todo        |
| 9     | #34   | Relative Direction Handling (N3)                                      |           | scope:traversal     | feature      | Done        |
| 10    | #48   | Exit Proposal Staging Store                                           |           | scope:traversal     | feature      | Todo        |
| 11    | #35   | Exit Generation Fallback & Event Emission (N4)                        |           | scope:traversal     | feature      | Todo        |
| 12    | #8    | Exits Summary Cache Generation Utility                                |           | scope:traversal     | feature      | Todo        |
| 13    | #12   | Seed Script: Anchor Locations & Exits                                 |           | scope:devx          | feature      | Todo        |
| 14    | #15   | Smoke Test Script (Movement Loop)                                     |           | scope:devx          | test         | Todo        |
| 15    | #14   | Integration Test Harness (Traversal + Persistence)                    |           | scope:devx          | test         |             |
| 16    | #10   | Telemetry Event Registry Expansion                                    |           | scope:observability | feature      | Todo        |
| 17    | #11   | Gremlin RU & Latency Telemetry Wrapper                                |           | scope:observability | feature      | Todo        |
| 18    | #45   | World Event Queue Processor Skeleton                                  |           | scope:systems       | feature      | Todo        |
| 19    | #40   | Lore Canonical Fact Store (CRUD + Versioning)                         |           | scope:world         | feature      | Todo        |
| 20    | #36   | Biome & Environmental Tag Registry Scaffold                           |           | scope:world         | feature      | Todo        |
| 21    | #44   | Description Layering Engine & Render Pipeline                         |           | scope:world         | feature      | Todo        |
| 22    | #37   | Prompt Template Registry & Versioned Metadata                         |           | scope:ai            | feature      | Todo        |
| 23    | #38   | MCP Read-Only Servers: world-query & lore-memory                      |           | scope:mcp           | feature      | Todo        |
| 24    | #41   | Application Insights Correlation & OpenTelemetry Wiring               |           | scope:observability | infra        | Todo        |
| 25    | #50   | AI Cost & Token Usage Telemetry + Budget Guardrails                   |           | scope:observability | type:feature |             |
| 26    | #46   | Telemetry MCP Server (Read-Only)                                      |           | scope:mcp           | feature      | Todo        |
| 27    | #52   | Learn more page                                                       |           |                     | enhancement  | Todo        |
| 28    | #39   | AI Structured Response Validator & Schema Gate                        |           | scope:ai            | feature      | Todo        |
| 29    | #47   | AI Moderation Pipeline Phase 1                                        |           | scope:ai            | feature      | Todo        |
| 30    | #42   | Security Baseline: Rate Limiting & Input Validation                   |           | scope:security      | infra        | Todo        |
| 31    | #22   | Automate implementation order assignment for new issues using Copilot |           | scope:devx          | enhancement  | Done        |
| 32    | #26   | ✨ Set up Copilot instructions                                        |           | scope:devx          | enhancement  | Done        |
| 33    | #21   | Remove text in logged in header                                       |           | scope:devx          | enhancement  | Done        |
| 34    | #24   | "Create your explorer" fails                                          |           | scope:world         | bug          | Done        |
| 35    | #28   | Frontend Managed API not deploying properly                           |           | scope:devx          | bug          | Done        |
| 36    | #30   | Ensure correct Issue board status in Projects                         |           | scope:devx          | enhancement  | Done        |
| 37    | #17   | DI Suitability Report                                                 |           | scope:devx          | docs         |             |
| 38    | #53   | Rooms discovered should be dynamic and renamed                        |           |                     |              | Todo        |

## Next Up

| Order | Issue | Status      | Title                                                   |
| ----- | ----- | ----------- | ------------------------------------------------------- |
| 2     | #7    | In progress | Player Bootstrap & Persistence                          |
| 3     | #49   |             | Managed Identity & Key Vault Secret Management Baseline |
| 4     | #5    | Todo        | Introduce EXIT Edge Model & Link Rooms                  |
| 5     | #6    | Todo        | Movement Command (HttpMovePlayer)                       |
| 6     | #9    | Todo        | LOOK Command (HttpLook)                                 |

Last sync: 2025-09-30T10:17:55.816Z
