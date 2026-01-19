# Infrastructure (Bicep)

`infrastructure/main.bicep` is the deployment entrypoint and the **source of truth**.

## Provisioned resources

| Resource                                         | Purpose                                                               | Notes                                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Azure Static Web App (SWA)                       | Hosts frontend (no embedded Functions).                               | Workflow auto‑gen disabled (`skipGithubActionWorkflowGeneration: true`).                                                |
| Azure Function App + Flex Consumption plan       | Hosts backend HTTP endpoints + queue processors, including MCP tools. | Flex Consumption (`FC1`) with Node.js **22** runtime. Uses Managed Identity for storage deployment + data plane access. |
| Azure Service Bus                                | Async world processing queues.                                        | Basic tier. Queues: `world-events`, `exit-generation-hints`.                                                            |
| Azure Storage Account                            | Function App deployment storage (blob container).                     | `allowSharedKeyAccess: false` (MI only).                                                                                |
| Azure Cosmos DB (Gremlin API)                    | Immutable-ish world structure graph.                                  | Gremlin capability enabled. Partition key: `/partitionKey`.                                                             |
| Azure Cosmos DB (SQL/Core API)                   | Mutable documents: players/inventory/layers/events + test DB.         | Includes `game-test` database for integration/E2E isolation.                                                            |
| Azure Application Insights                       | Telemetry and observability.                                          | Connection string wired into Function App settings.                                                                     |
| Azure Workbooks                                  | Pre-configured dashboards.                                            | See `infrastructure/workbooks/` and `docs/observability/`.                                                              |
| Azure Monitor Alerts                             | Scheduled query alerts.                                               | See `infrastructure/alert-*.bicep` modules.                                                                             |
| Azure AI Foundry (Cognitive Services AIServices) | Foundry account + project for agent/tool orchestration.               | Account deployed via AVM with project management enabled.                                                               |
| Foundry project connection (MCP)                 | Connects Foundry → existing MCP server (Function App).                | Uses **Managed Identity** (`useWorkspaceManagedIdentity: true`).                                                        |

## Files

- `main.bicep` – SWA + Function App + Service Bus + Cosmos + App Insights + Workbooks/Alerts + Foundry
- `workbook-player-operations-dashboard.bicep` – Player Operations dashboard
- `workbook-sql-partition-monitoring-dashboard.bicep` – SQL partition monitoring dashboard
- `alerts-*.bicep` – query alerts

## Parameters

| Name                       | Type   | Default                       | Required | Description                                                                                                                           |
| -------------------------- | ------ | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                     | string | `atlas`                       | No       | Prefix used in resource names.                                                                                                        |
| `location`                 | string | resource group location       | No       | Azure region for all resources.                                                                                                       |
| `unique`                   | string | derived from RG               | No       | Short suffix used for globally-unique resource names.                                                                                 |
| `foundryAccountName`       | string | `aifoundry-${name}-${unique}` | No       | Azure AI Foundry (AIServices) account name (must be globally unique).                                                                 |
| `foundryProjectName`       | string | `name`                        | No       | Foundry project name under the Foundry account.                                                                                       |
| `foundryMcpConnectionName` | string | `mcp-${unique}`               | No       | Foundry project connection name (3–33 chars; alnum/underscore/dash).                                                                  |
| `foundryMcpTargetOverride` | string | empty                         | No       | If set, overrides the MCP server URL for the Foundry connection. If empty, defaults to `https://<functionapp>.azurewebsites.net/mcp`. |

## Outputs

| Output                      | Description                                      |
| --------------------------- | ------------------------------------------------ |
| `cosmosSqlTestDatabaseName` | Name of the SQL API test database (`game-test`). |
| `foundryAccountName`        | Name of the Foundry account deployed via AVM.    |
| `foundryProjectName`        | Name of the Foundry project.                     |
| `foundryMcpConnectionName`  | Name of the Foundry MCP connection.              |
| `foundryMcpTarget`          | MCP server URL used by the Foundry connection.   |

## Deployment examples

Inline parameters:

```bash
az deployment group create \
  --resource-group <rg> \
  --template-file infrastructure/main.bicep \
  --parameters name=atlas \
  --query properties.outputs
```

Overriding the MCP endpoint used by the Foundry connection:

```bash
az deployment group create \
  --resource-group <rg> \
  --template-file infrastructure/main.bicep \
  --parameters name=atlas foundryMcpTargetOverride='https://example.com/mcp' \
  --query properties.outputs
```

## Changelog

| Date       | Change                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-01-19 | Added Azure AI Foundry account + project and a Managed Identity-backed project connection to the existing MCP server hosted in the Function App. |
