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
| Azure AI Foundry (Cognitive Services AIServices) | Foundry account + project + GPT-4o deployment (optional).             | Account deployed via AVM. Hosts MCP connections + model deployments for unified management.                             |
| Foundry project connection (MCP)                 | Connects Foundry → existing MCP server (Function App).                | Uses **Entra ID (AAD)** with the Foundry project/workspace Managed Identity (`useWorkspaceManagedIdentity: true`).      |

## Files

- `main.bicep` – SWA + Function App + Service Bus + Cosmos + App Insights + Workbooks/Alerts + Foundry (with GPT-4o deployment)
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
| `mcpAllowedClientAppIds`      | string | empty                         | No       | Comma-separated list of allowed client app IDs for MCP tool access. Each caller must have the Narrator app role.                      |
| `enableOpenAI`                | bool   | `true`                        | No       | Enable GPT-4o model deployment in Foundry. Set to `false` to skip model deployment for cost savings.                                  |
| `openAiPrimaryDeploymentName` | string | `hero-prose`                  | No       | Primary GPT-4o model deployment name (used in app settings).                                                                          |
| `openAiPrimaryModelName`      | string | `gpt-4o`                      | No       | Azure OpenAI model name (e.g., `gpt-4o`, `gpt-35-turbo`).                                                                             |
| `openAiPrimaryModelVersion`   | string | `2024-08-06`                  | No       | Model version for the primary deployment.                                                                                             |
| `openAiPrimaryModelCapacity`  | int    | `10`                          | No       | Model capacity in thousands of tokens per minute (TPM). Default: 10K TPM.                                                             |
| `openAiApiVersion`            | string | `2024-10-21`                  | No       | Azure OpenAI API version for SDK calls (latest stable GA version).                                                                    |

## Outputs

| Output                        | Description                                                       |
| ----------------------------- | ----------------------------------------------------------------- |
| `cosmosSqlTestDatabaseName`   | Name of the SQL API test database (`game-test`).                 |
| `foundryAccountName`          | Name of the Foundry account deployed via AVM.                     |
| `foundryProjectName`          | Name of the Foundry project.                                      |
| `foundryMcpConnectionName`    | Name of the Foundry MCP connection.                               |
| `foundryMcpTarget`            | MCP server URL used by the Foundry connection.                    |
| `openAiEnabled`               | Boolean indicating whether GPT-4o model deployment is enabled.    |
| `openAiEndpoint`              | Foundry account endpoint URL (for OpenAI API calls).              |
| `openAiAccountName`           | Foundry account name (hosting the GPT-4o deployment).             |
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

**Model Information:**
- **Model**: GPT-4o (gpt-4o-2024-08-06) - Latest snapshot with structured outputs support
- **API Version**: 2024-10-21 (latest stable GA) - For production stability
- **Context Window**: 128,000 tokens
- **Cost**: $2.50/1M input tokens, $10/1M output tokens

Check the latest regional availability: https://learn.microsoft.com/azure/ai-services/openai/concepts/models

For API version updates and lifecycle information: https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle

## Changelog

| Date       | Change                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-01-28 | **Consolidated architecture**: GPT-4o deployment now provisioned directly within Azure AI Foundry account (removed separate OpenAI resource). Single `kind: AIServices` account hosts MCP, agent orchestration, and model deployments.    |
| 2026-01-28 | Updated Azure OpenAI API version to 2024-10-21 (latest stable GA). Added model specifications and API version lifecycle documentation reference.                                                                                          |
| 2026-01-27 | Added Azure OpenAI resource with model deployment (optional via `enableOpenAI` parameter). Configured Managed Identity RBAC (Cognitive Services OpenAI User). Wired endpoint/deployment to Function App settings. Uses GPT-4o-2024-08-06. |
| 2026-01-19 | Added Azure AI Foundry account + project and a Managed Identity-backed project connection to the existing MCP server hosted in the Function App.                                                                                          |

