# Infrastructure (Bicep)

Provisioned resources:

| Resource                       | Purpose                                                       | Notes                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Azure Static Web App (SWA)     | Hosts frontend only (no embedded Functions).                  | Workflow auto‑gen disabled (`skipGithubActionWorkflowGeneration: true`).                                                                             |
| Azure Function App             | All HTTP game endpoints + queue processors (`/backend`).      | Consumption (Y1) plan with Node.js 20 runtime. Handles synchronous HTTP + async world event processing.                                              |
| Azure Service Bus              | Message queue for world events (async processing).            | Basic tier (free up to 1M operations/month). Queue: `world-events`.                                                                                  |
| Azure Storage Account          | Function App backend storage (required for consumption plan). | Standard LRS tier.                                                                                                                                   |
| Azure Cosmos DB (Gremlin API)  | World graph: rooms, exits, NPCs, items.                       | Session consistency; Gremlin capability enabled. Partition key: `/partitionKey` (required property on all vertices). Player state removed (ADR-004). |
| Azure Cosmos DB (SQL/Core API) | Authoritative player, inventory, layers, events store.        | Serverless capacity mode. Single authoritative player store since ADR-004 (dual-persistence retired). Database: `game`. Containers detailed below.   |
| Azure OpenAI (Optional)        | AI text generation for hero prose and narrative features.     | Managed Identity auth only (no keys). Disabled by default; enable via `enableAzureOpenAI=true` parameter. Requires available quota/region.            |
| Azure Key Vault                | Stores Cosmos primary key secrets.                            | Access policy grants SWA and Function App system identities get/list for secrets. Stores both `cosmos-primary-key` and `cosmos-sql-primary-key`.     |
| Azure Application Insights     | Telemetry and observability.                                  | Connection string wired to SWA Functions and Function App for automatic instrumentation.                                                             |
| Azure Workbooks                | Pre-configured dashboards for observability (M2).             | Movement Blocked Reasons Breakdown panel linked to Application Insights. See `docs/observability/workbooks/`.                                        |
| Azure Monitor Alerts           | Scheduled query rules for anomaly detection (M2).             | Includes Gremlin 429 throttling spike detection. Configurable via `gremlinBaselineRps` parameter.                                                    |

Files:

-   `main.bicep` – SWA + Function App + Service Bus + Cosmos + Key Vault + secret injection + Workbooks + Alerts + Azure OpenAI
-   `azure-openai.bicep` – Azure OpenAI resource with model deployment and Managed Identity RBAC (optional)
-   `workbook-player-operations-dashboard.bicep` – Consolidated Player Operations dashboard (movement + performance)
-   `alert-gremlin-429-spike.bicep` – Gremlin 429 throttling spike detection alert module
-   `parameters.json` – example / placeholder (not required; inline params acceptable)

The backend Function App handles all synchronous HTTP endpoints and async queue processing; the Static Web App serves only static frontend assets.

## Cosmos DB SQL API Containers

Player storage is exclusively in SQL/Core API since ADR-004 (dual-persistence retired). These containers handle mutable, player-centric, and append-heavy data that benefit from document model optimization:

| Container           | Partition Key | Purpose                                                                      |
| ------------------- | ------------- | ---------------------------------------------------------------------------- |
| `players`           | `/id`         | Player profiles, settings, and mutable state (authoritative SQL document).   |
| `inventory`         | `/playerId`   | Player inventory items (enables efficient per-player queries).               |
| `descriptionLayers` | `/locationId` | Additive description layers per location (ambient, structural, enhancement). |
| `worldEvents`       | `/scopeKey`   | Event log partitioned by scope: `loc:<id>` or `player:<id>`.                 |

**Capacity Mode**: Serverless (no provisioned RU/s). Cost-effective for spiky development workload and scales automatically.

**Key Design Decisions**:

-   Player/inventory in SQL API to reduce hot partition risk (original migration captured in ADR-002; completed in ADR-004)
-   Location description layers stored separately to enable AI enrichment workflow
-   Event log scoped by entity for efficient timeline queries
-   Gremlin graph remains authoritative for world structure (locations, exits, spatial relationships)

## Cosmos DB Gremlin Partition Key

The Gremlin graph uses `/partitionKey` as the partition key property. **Important constraints**:

-   Gremlin API reserves `/id` and `/label` properties; they cannot be used as partition keys
-   All vertices must include a `partitionKey` property when created
-   Common strategies: use vertex type (e.g., `"Location"`, `"Player"`) or a domain-specific identifier (e.g., region, zone)
-   For small-to-medium graphs, a single partition value (e.g., `"world"`) is acceptable during development

**Example vertex creation**:

```gremlin
g.addV('Location').property('id', '<uuid>').property('partitionKey', 'world').property('name', 'Mosswell Square')
```

## Parameters

| Name                               | Type   | Default                 | Required | Description                                                                           |
| ---------------------------------- | ------ | ----------------------- | -------- | ------------------------------------------------------------------------------------- |
| `location`                         | string | resource group location | No       | Region (override).                                                                    |
| `staticWebAppSku`                  | string | Standard                | No       | SWA tier (`Free` or `Standard`).                                                      |
| `staticWebAppName`                 | string | derived unique string   | No       | Auto‑generated if not overridden.                                                     |
| `cosmosAccountName`                | string | derived unique string   | No       | Gremlin API account name. Auto‑generated if not overridden.                           |
| `cosmosSqlAccountName`             | string | derived unique string   | No       | SQL API account name. Auto‑generated if not overridden.                               |
| `keyVaultName`                     | string | derived unique string   | No       | Auto‑generated if not overridden.                                                     |
| `appInsightsName`                  | string | derived unique string   | No       | Auto‑generated if not overridden.                                                     |
| `cosmosGremlinDatabaseName`        | string | game                    | No       | Gremlin database name.                                                                |
| `cosmosGremlinGraphName`           | string | world                   | No       | Gremlin graph name.                                                                   |
| `cosmosGremlinGraphThroughput`     | int    | 400                     | No       | Provisioned RU/s for Gremlin graph (min 400).                                         |
| `cosmosSqlDatabaseName`            | string | game                    | No       | SQL API database name.                                                                |
| `cosmosSqlPlayersContainerName`    | string | players                 | No       | Players container name.                                                               |
| `cosmosSqlInventoryContainerName`  | string | inventory               | No       | Inventory container name.                                                             |
| `cosmosSqlLayersContainerName`     | string | descriptionLayers       | No       | Description layers container name.                                                    |
| `cosmosSqlEventsContainerName`     | string | worldEvents             | No       | World events container name.                                                          |
| `serviceBusNamespaceName`          | string | derived unique string   | No       | Service Bus namespace name. Auto‑generated if not overridden.                         |
| `serviceBusQueueName`              | string | world-events            | No       | Service Bus queue name for world events.                                              |
| `functionAppName`                  | string | derived unique string   | No       | Function App name. Auto‑generated if not overridden.                                  |
| `storageAccountName`               | string | derived unique string   | No       | Storage account name. Auto‑generated if not overridden.                               |
| `appServicePlanName`               | string | derived unique string   | No       | App Service Plan name. Auto‑generated if not overridden.                              |
| `gremlinBaselineRps`               | int    | 50                      | No       | Expected baseline RPS for Gremlin queries. Set to 0 to disable 429 spike alert (M2).  |
| `additionalCosmosDataContributors` | array  | []                      | No       | Additional AAD principal IDs for Cosmos DB data contributor role (local dev/tooling). |
| `enableAzureOpenAI`                | bool   | false                   | No       | Enable Azure OpenAI resource deployment for AI-powered features.                      |
| `openAIModelDeploymentName`        | string | gpt-4                   | No       | Name of the OpenAI model deployment (used in API calls).                              |
| `openAIModelName`                  | string | gpt-4                   | No       | OpenAI model name (e.g., gpt-4, gpt-4o).                                              |
| `openAIModelVersion`               | string | 0613                    | No       | Model version (e.g., 0613, 2024-05-13).                                               |
| `openAIModelCapacity`              | int    | 10                      | No       | Model deployment capacity in thousands of tokens per minute (TPM).                    |
| `azureOpenAIApiVersion`            | string | 2024-10-21              | No       | Azure OpenAI API version to use in backend app settings.                              |

Secrets/keys are injected via Key Vault; no repository URL parameter is currently required because CI handles deployment.

Example parameter usage inline or via a parameter file you maintain separately.

## Outputs

| Output                            | Description                             |
| --------------------------------- | --------------------------------------- |
| `cosmosAccountName`               | Name of the Cosmos DB Gremlin account.  |
| `cosmosEndpoint`                  | Document (Gremlin) endpoint URL.        |
| `cosmosSqlEndpoint`               | SQL API endpoint URL.                   |
| `staticWebAppName`                | Name of the Static Web App resource.    |
| `keyVaultName`                    | Name of the Key Vault resource.         |
| `cosmosPrimaryKeySecretName`      | Secret name for Gremlin primary key.    |
| `cosmosSqlPrimaryKeySecretName`   | Secret name for SQL API primary key.    |
| `appInsightsName`                 | Name of Application Insights resource.  |
| `appInsightsConnectionString`     | Application Insights connection string. |
| `cosmosGremlinDatabaseName`       | Gremlin database name.                  |
| `cosmosGremlinGraphName`          | Gremlin graph name.                     |
| `cosmosSqlDatabaseName`           | SQL API database name.                  |
| `cosmosSqlPlayersContainerName`   | Players container name.                 |
| `cosmosSqlInventoryContainerName` | Inventory container name.               |
| `cosmosSqlLayersContainerName`    | Description layers container name.      |
| `cosmosSqlEventsContainerName`    | World events container name.            |
| `serviceBusNamespaceName`         | Service Bus namespace name.             |
| `serviceBusQueueName`             | Service Bus queue name.                 |
| `functionAppName`                 | Function App name.                      |
| `storageAccountName`              | Storage account name.                   |
| `appServicePlanName`              | App Service Plan name.                  |
| `azureOpenAIEnabled`              | Whether Azure OpenAI is enabled.        |
| `azureOpenAIEndpoint`             | Azure OpenAI endpoint URL (if enabled). |
| `azureOpenAIModelDeploymentName`  | Model deployment name (if enabled).     |

## Deployment Examples

Inline parameters:

```bash
az deployment group create \
	--resource-group <rg> \
	--template-file main.bicep \
	--parameters repositoryUrl=https://github.com/<org>/<repo>.git branch=main \
	--query properties.outputs
```

Using a parameters file (create `my.parameters.json`):

```jsonc
{
    "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {
        "repositoryUrl": { "value": "https://github.com/<org>/<repo>.git" },
        "branch": { "value": "main" },
        "location": { "value": "westeurope" }
    }
}
```

```bash
az deployment group create \
	--resource-group <rg> \
	--template-file main.bicep \
	--parameters @my.parameters.json \
	--query properties.outputs
```

## Post-Deployment Checklist

1. ✅ CI workflow builds & deploys SWA + API (`.github/workflows/frontend-swa-deploy.yml`).
2. ✅ Managed Identity & Key Vault configured for secret retrieval.
3. Seed Gremlin graph (rooms/NPCs) – script pending. Player vertices no longer seeded (ADR-004).
4. Add telemetry sampling configuration in Application Insights (future).

## Security & Limitations

| Topic              | Current State                                                                                                                                      | Planned Improvement                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Secrets Management | Key Vault configured with Managed Identity. Runtime retrieval via secrets helper.                                                                  | Add secret rotation automation (future).             |
| Observability      | Application Insights connected.                                                                                                                    | Add sampling & dependency tracking tuning.           |
| Messaging          | ✅ Service Bus namespace + queue for world events (Basic tier).                                                                                    | Add dead-letter queue handling and monitoring.       |
| Identity / RBAC    | System-assigned Managed Identity for SWA and Function App with Key Vault access policies. Function App uses identity-based Service Bus connection. | Migrate to RBAC authorization for Cosmos data plane. |
| CI/CD              | Defined in `.github/workflows/*.yml` (source of truth).                                                                                            | Modify workflows directly; no duplicate docs.        |

## Secret Management Baseline

**Status**: ✅ Implemented (Issue #45)

**Decision**: A dedicated Key Vault was provisioned for this project. See [Key Vault Decision Document](../docs/decisions/keyvault-decision.md) for evaluation criteria and rationale.

### Architecture

-   **Key Vault**: Standard tier, access policy-based (SWA system identity has `get`, `list` permissions)
-   **Secrets Stored**:
    -   `cosmos-primary-key` (Gremlin API)
    -   `cosmos-sql-primary-key` (SQL/Core API)
    -   Placeholders for future: `service-bus-connection-string`, `model-provider-api-key`, `signing-secret`
-   **Runtime Access**: Via `@piquet-h/shared` `secretsHelper` (renamed from `@atlas/shared`) with:
    -   Lazy caching (5-minute TTL)
    -   Exponential backoff retry (3 attempts)
    -   Telemetry (cache hit/miss, fetch success/failure)
    -   Allowlisted secret keys
    -   Local dev fallback to environment variables (`.env.development`)

### Local Development

1. Copy `.env.development.example` to `.env.development`
2. Set required secrets (e.g., `COSMOS_GREMLIN_KEY`)
3. Helper automatically uses env vars when `KEYVAULT_NAME` is not set
4. Production guard: refuses to use local env vars if `NODE_ENV=production`

### Security Notes

-   Never commit `.env.development` (excluded in `.gitignore`)
-   Direct access to secrets outside helper is prevented by allowlist validation
-   Managed Identity eliminates need for connection strings in app settings
-   Consider enabling soft-delete and purge protection for production

## Azure Workbooks (M2 Observability)

Pre-configured Application Insights workbooks are deployed automatically via Bicep modules. Post ADR-004 consolidation reduced surface area and maintenance overhead by merging traversal and Gremlin performance panels.

### Player Operations Dashboard (Consolidated)

**Module:** `workbook-player-operations-dashboard.bicep`  
**Source JSON:** `infrastructure/workbooks/player-operations-dashboard.workbook.json`  
**Issues Referenced:** #282 (movement friction), #283 (movement latency), #289-#296 (performance & reliability)

Combines key panels:

| Category       | Panels / Metrics (Representative)                                | Purpose                                      |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------- |
| Movement       | Success rate, blocked reasons distribution, P95 latency (1h/24h) | Detect traversal friction & perf regressions |
| Gremlin Ops    | Top operations (Calls/AvgRU/P95), Avg RU vs P95 Latency trend    | Identify expensive or slow queries           |
| RU Consumption | Total RU charge trend (5m buckets)                               | Monitor cost & pressure baseline             |
| Reliability    | Success vs Failed calls, failure rate (%)                        | Prioritize failing operations                |

Interpretation guidance retained in header; advanced correlation & partition pressure panels remain in dedicated performance workbook history (removed resources) for audit via git history.

**Deployment:** Included automatically when deploying `main.bicep`.

**Manual Update:**

```bash
cd infrastructure
az deployment group create \
    --resource-group rg-atlas-game \
    --template-file main.bicep \
    --parameters name=atlas
```

Idempotent: existing workbook updated in-place when JSON changes.

## Azure OpenAI (Optional AI Features)

Azure OpenAI is **disabled by default** to keep infrastructure costs low during development. Enable it when you need AI-powered features like hero prose generation.

### Enabling Azure OpenAI

Set `enableAzureOpenAI=true` during deployment:

```bash
az deployment group create \
    --resource-group rg-atlas-game \
    --template-file main.bicep \
    --parameters name=atlas enableAzureOpenAI=true
```

### Configuration

When enabled, the deployment:
- Creates an Azure OpenAI resource with key-based auth disabled (Managed Identity only)
- Deploys the specified model (default: `gpt-4` version `0613` with 10K TPM capacity)
- Grants the Function App `Cognitive Services OpenAI User` role
- Wires app settings: `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_MODEL`, `AZURE_OPENAI_API_VERSION`

### Region and Quota Requirements

**Important:** Azure OpenAI requires:
- Available quota in your subscription (request via Azure Portal if needed)
- A supported region (e.g., `eastus`, `westeurope`, `southcentralus`)
- Model availability varies by region (check [Azure OpenAI model availability](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models))

If deployment fails with quota errors, either:
1. Request quota increase via Azure Portal → Quotas
2. Choose a different region with available capacity
3. Keep `enableAzureOpenAI=false` (backend gracefully handles missing OpenAI config)

### Cost Considerations

Azure OpenAI charges based on:
- **Model deployment capacity:** ~$0.36/hour for 10K TPM (pay-as-you-go pricing)
- **Token usage:** Input/output tokens consumed (pricing varies by model)

Recommended for low-cost environments:
- Keep `enableAzureOpenAI=false` until AI features are actively being tested
- Use minimal capacity (10K TPM) for development
- Backend code handles missing OpenAI gracefully (features degrade but don't fail)

## Alignment With Architecture

-   Matches architecture doc: Static Web App + Function App + Service Bus + Gremlin Cosmos DB.
-   Backend unified: Function App provides both HTTP endpoints and queue processors (simpler deployment, single telemetry surface).
-   Service Bus (Basic tier) handles async world event processing.
-   Observability workbooks provide dashboards for M2 milestone telemetry analysis.

## Roadmap (Next Infrastructure Enhancements)

-   ✅ Service Bus namespace + queue (world events / async NPC processing)
-   ✅ Function App (consumption plan) for queue processors
-   ✅ Azure OpenAI with Managed Identity (optional deployment for AI features)
-   Application Insights advanced configuration (sampling, custom metrics)
-   Managed identity RBAC assignments for Cosmos data plane roles
-   Tagging strategy (`env`, `project`, `costCenter`)
-   Dead-letter queue monitoring and alerting

## Changelog

| Date       | Change                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-01-16 | Added Azure OpenAI optional deployment (`azure-openai.bicep`) with Managed Identity auth, model deployment, and app settings wiring. Disabled by default via `enableAzureOpenAI` parameter.          |
| 2025-11-04 | Added Movement Blocked Reasons Breakdown workbook module (M2 Observability) with automatic deployment via main.bicep.                                                                                 |
| 2025-10-05 | Added Service Bus (Basic tier), Function App (consumption Y1), Storage Account, and RBAC role assignments for world event queue processing.                                                           |
| 2025-10-04 | Added Cosmos DB SQL API account and containers (players, inventory, layers, events) per ADR-002.                                                                                                      |
| 2025-11-23 | Removed dual-persistence migration/fallback infra (alerts/workbook) and updated player storage to SQL-only (ADR-004). Consolidated movement + performance workbooks into Player Operations Dashboard. |
| 2025-10-02 | Fixed Cosmos DB Gremlin graph partition key from `/id` to `/partitionKey` (Azure API requirement).                                                                                                    |
| 2025-09-14 | Rewrote README to reflect actual Bicep (SWA + Cosmos) and remove obsolete Function App / Storage references.                                                                                          |

## Contributing

If you add a new resource: (1) update `main.bicep`, (2) document parameters/outputs here, (3) append to the Changelog.

## Future Improvements (Optional Ideas)

-   Add Bicep modules for logical grouping (e.g., `cosmos.bicep`, `swa.bicep`).
-   Introduce `azuredeploy.*` naming & versioning for production promotion paths.
-   Provide a seeding script (Node/TypeScript) for initial Gremlin vertices/edges.

---

Questions or want automation for seeding / CI workflows? Open an issue or request a helper script.
