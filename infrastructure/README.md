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
| Foundry project connection (MCP)                 | Connects Foundry → existing MCP server (Function App).                | Uses **Entra ID (AAD)** with the Foundry project/workspace Managed Identity (`useWorkspaceManagedIdentity: true`).      |
| Azure OpenAI                                     | LLM service for narrative generation (optional).                      | Disabled by default. Provisioned with Managed Identity auth (no keys). See `enableOpenAI` parameter.                     |

## Files

- `main.bicep` – SWA + Function App + Service Bus + Cosmos + App Insights + Workbooks/Alerts + Foundry + OpenAI
- `azure-openai.bicep` – Azure OpenAI account + model deployments + RBAC
- `workbook-player-operations-dashboard.bicep` – Player Operations dashboard
- `workbook-sql-partition-monitoring-dashboard.bicep` – SQL partition monitoring dashboard
- `alerts-*.bicep` – query alerts

## Parameters

| Name                          | Type   | Default                       | Required | Description                                                                                                                           |
| ----------------------------- | ------ | ----------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `name`                        | string | `atlas`                       | No       | Prefix used in resource names.                                                                                                        |
| `location`                    | string | resource group location       | No       | Azure region for all resources.                                                                                                       |
| `unique`                      | string | derived from RG               | No       | Short suffix used for globally-unique resource names.                                                                                 |
| `foundryAccountName`          | string | `aifoundry-${name}-${unique}` | No       | Azure AI Foundry (AIServices) account name (must be globally unique).                                                                 |
| `foundryCustomSubDomainName`  | string | `foundryAccountName`          | No       | Required by Foundry: custom subdomain for the account. Must be set before creating Foundry projects.                                  |
| `foundryProjectName`          | string | `name`                        | No       | Foundry project name under the Foundry account.                                                                                       |
| `foundryMcpConnectionName`    | string | `mcp-${unique}`               | No       | Foundry project connection name (3–33 chars; alnum/underscore/dash).                                                                  |
| `foundryMcpTargetOverride`    | string | empty                         | No       | If set, overrides the MCP server URL for the Foundry connection. If empty, defaults to `https://<functionapp>.azurewebsites.net/mcp`. |
| `functionAppAadClientId`      | string | `3b67761b...`                 | No       | Entra App Registration (client ID) for Function App EasyAuth AAD provider.                                                            |
| `functionAppAadIdentifierUri` | string | `api://<tenantId>/...`        | No       | Identifier URI (audience) for the Function App. Must match the app registration.                                                      |
| `mcpAllowedClientAppIds`      | string | empty                         | No       | Comma-separated list of allowed client app IDs for MCP access. Each caller must have the Narrator app role.                           |
| `enableOpenAI`                | bool   | `true`                        | No       | Enable Azure OpenAI provisioning. Set to `false` to skip OpenAI deployment for cost savings.                                          |
| `openAiLocation`              | string | `eastus2`                     | No       | Azure region for OpenAI resources. Recommended: eastus, eastus2, westus, swedencentral for availability.                              |
| `openAiPrimaryDeploymentName` | string | `hero-prose`                  | No       | Primary OpenAI model deployment name (used in app settings).                                                                          |
| `openAiPrimaryModelName`      | string | `gpt-4o`                      | No       | Azure OpenAI model name (e.g., `gpt-4o`, `gpt-35-turbo`).                                                                             |
| `openAiPrimaryModelVersion`   | string | `2024-08-06`                  | No       | Model version for the primary deployment.                                                                                             |
| `openAiPrimaryModelCapacity`  | int    | `10`                          | No       | Model capacity in thousands of tokens per minute (TPM). Default: 10K TPM.                                                             |
| `openAiApiVersion`            | string | `2024-08-01-preview`          | No       | Azure OpenAI API version for SDK calls (wired to app settings).                                                                       |

## Outputs

| Output                        | Description                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `cosmosSqlTestDatabaseName`   | Name of the SQL API test database (`game-test`).                 |
| `foundryAccountName`          | Name of the Foundry account deployed via AVM.                     |
| `foundryProjectName`          | Name of the Foundry project.                                      |
| `foundryMcpConnectionName`    | Name of the Foundry MCP connection.                               |
| `foundryMcpTarget`            | MCP server URL used by the Foundry connection.                    |
| `openAiEnabled`               | Boolean indicating whether Azure OpenAI is enabled.               |
| `openAiEndpoint`              | Azure OpenAI endpoint URL (empty if not enabled).                 |
| `openAiAccountName`           | Azure OpenAI account name (empty if not enabled).                 |
| `openAiPrimaryDeploymentName` | Primary model deployment name (empty if not enabled).             |

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

Deploying with Azure OpenAI enabled (default):

```bash
az deployment group create \
  --resource-group <rg> \
  --template-file infrastructure/main.bicep \
  --parameters name=atlas enableOpenAI=true \
  --query properties.outputs
```

Disabling Azure OpenAI for cost savings:

```bash
az deployment group create \
  --resource-group <rg> \
  --template-file infrastructure/main.bicep \
  --parameters name=atlas enableOpenAI=false \
  --query properties.outputs
```

## Azure OpenAI Availability

Azure OpenAI is not available in all regions. If deployment fails with capacity or quota errors, try these recommended regions:

- `eastus2` (default)
- `eastus`
- `westus`
- `swedencentral`
- `uksouth`

Check the latest regional availability: https://learn.microsoft.com/azure/ai-services/openai/concepts/models

## Changelog

| Date       | Change                                                                                                                                                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-01-27 | Added Azure OpenAI resource with model deployment (optional via `enableOpenAI` parameter). Configured Managed Identity RBAC (Cognitive Services OpenAI User). Wired endpoint/deployment to Function App settings. Supports narration-first architecture. |
| 2026-01-19 | Added Azure AI Foundry account + project and a Managed Identity-backed project connection to the existing MCP server hosted in the Function App.                                                                                                         |

