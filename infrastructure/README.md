# Infrastructure (Bicep)

Provisioned resources:

| Resource                       | Purpose                                                          | Notes                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Azure Static Web App (SWA)     | Hosts frontend only (no embedded Functions).                     | Workflow auto‑gen disabled (`skipGithubActionWorkflowGeneration: true`).                                                                         |
| Azure Function App             | All HTTP game endpoints + queue processors (`/backend`).         | Consumption (Y1) plan with Node.js 20 runtime. Handles synchronous HTTP + async world event processing.                                          |
| Azure Service Bus              | Message queue for world events (async processing).               | Basic tier (free up to 1M operations/month). Queue: `world-events`.                                                                              |
| Azure Storage Account          | Function App backend storage (required for consumption plan).    | Standard LRS tier.                                                                                                                               |
| Azure Cosmos DB (Gremlin API)  | World graph: rooms, exits, NPCs, items, player state.            | Session consistency; Gremlin capability enabled. Partition key: `/partitionKey` (required property on all vertices).                             |
| Azure Cosmos DB (SQL/Core API) | Document store for players, inventory, layers, events (ADR-002). | Serverless capacity mode. Separate account for dual-persistence strategy. Database: `game`. Containers detailed below.                           |
| Azure Key Vault                | Stores Cosmos primary key secrets.                               | Access policy grants SWA and Function App system identities get/list for secrets. Stores both `cosmos-primary-key` and `cosmos-sql-primary-key`. |
| Azure Application Insights     | Telemetry and observability.                                     | Connection string wired to SWA Functions and Function App for automatic instrumentation.                                                         |
| Azure Workbooks                | Pre-configured dashboards for observability (M2).                | Movement Blocked Reasons Breakdown panel linked to Application Insights. See `docs/observability/workbooks/`.                                    |

Files:

-   `main.bicep` – SWA + Function App + Service Bus + Cosmos + Key Vault + secret injection + Workbooks
-   `workbook-movement-blocked-reasons.bicep` – Movement Blocked Reasons dashboard workbook module
-   `parameters.json` – example / placeholder (not required; inline params acceptable)

The backend Function App handles all synchronous HTTP endpoints and async queue processing; the Static Web App serves only static frontend assets.

## Cosmos DB SQL API Containers (ADR-002 Dual Persistence)

The SQL/Core API account (`cosmosdoc*`) implements the document side of the dual-persistence strategy (see ADR-002). These containers handle mutable, player-centric, and append-heavy data that benefits from document model optimization:

| Container           | Partition Key | Purpose                                                                      |
| ------------------- | ------------- | ---------------------------------------------------------------------------- |
| `players`           | `/id`         | Player profiles, settings, and mutable state (write-through from graph).     |
| `inventory`         | `/playerId`   | Player inventory items (enables efficient per-player queries).               |
| `descriptionLayers` | `/locationId` | Additive description layers per location (ambient, structural, enhancement). |
| `worldEvents`       | `/scopeKey`   | Event log partitioned by scope: `loc:<id>` or `player:<id>`.                 |

**Capacity Mode**: Serverless (no provisioned RU/s). Cost-effective for spiky development workload and scales automatically.

**Key Design Decisions** (from ADR-002):

-   Player/inventory moved off graph to reduce hot partition risk
-   Location description layers stored separately to enable AI enrichment workflow
-   Event log scoped by entity for efficient timeline queries
-   Graph remains authoritative for world structure (locations, exits, spatial relationships)

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

| Name                              | Type   | Default                 | Required | Description                                                   |
| --------------------------------- | ------ | ----------------------- | -------- | ------------------------------------------------------------- |
| `location`                        | string | resource group location | No       | Region (override).                                            |
| `staticWebAppSku`                 | string | Standard                | No       | SWA tier (`Free` or `Standard`).                              |
| `staticWebAppName`                | string | derived unique string   | No       | Auto‑generated if not overridden.                             |
| `cosmosAccountName`               | string | derived unique string   | No       | Gremlin API account name. Auto‑generated if not overridden.   |
| `cosmosSqlAccountName`            | string | derived unique string   | No       | SQL API account name. Auto‑generated if not overridden.       |
| `keyVaultName`                    | string | derived unique string   | No       | Auto‑generated if not overridden.                             |
| `appInsightsName`                 | string | derived unique string   | No       | Auto‑generated if not overridden.                             |
| `cosmosGremlinDatabaseName`       | string | game                    | No       | Gremlin database name.                                        |
| `cosmosGremlinGraphName`          | string | world                   | No       | Gremlin graph name.                                           |
| `cosmosGremlinGraphThroughput`    | int    | 400                     | No       | Provisioned RU/s for Gremlin graph (min 400).                 |
| `cosmosSqlDatabaseName`           | string | game                    | No       | SQL API database name.                                        |
| `cosmosSqlPlayersContainerName`   | string | players                 | No       | Players container name.                                       |
| `cosmosSqlInventoryContainerName` | string | inventory               | No       | Inventory container name.                                     |
| `cosmosSqlLayersContainerName`    | string | descriptionLayers       | No       | Description layers container name.                            |
| `cosmosSqlEventsContainerName`    | string | worldEvents             | No       | World events container name.                                  |
| `serviceBusNamespaceName`         | string | derived unique string   | No       | Service Bus namespace name. Auto‑generated if not overridden. |
| `serviceBusQueueName`             | string | world-events            | No       | Service Bus queue name for world events.                      |
| `functionAppName`                 | string | derived unique string   | No       | Function App name. Auto‑generated if not overridden.          |
| `storageAccountName`              | string | derived unique string   | No       | Storage account name. Auto‑generated if not overridden.       |
| `appServicePlanName`              | string | derived unique string   | No       | App Service Plan name. Auto‑generated if not overridden.      |

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
3. Seed Gremlin graph (rooms/NPCs) – script pending.
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

Pre-configured Application Insights workbooks are deployed automatically via Bicep modules. Each workbook provides interactive dashboards for monitoring specific aspects of the game telemetry.

### Movement Blocked Reasons Breakdown

**Module:** `workbook-movement-blocked-reasons.bicep`  
**Documentation:** `docs/observability/workbooks/README.md`  
**Issue:** [#282](https://github.com/piquet-h/the-shifting-atlas/issues/282)

Analyzes `Navigation.Move.Blocked` events by reason to identify traversal friction sources:
- Groups blocked events by reason (invalid-direction, from-missing, no-exit, move-failed)
- Shows percentage distribution and alerts when any reason exceeds 50%
- 7-day trend sparkline for blocked rate
- Interpretation guide with actionable recommendations

**Deployment:**
The workbook module is automatically included when deploying `main.bicep`. It:
- Creates the workbook resource linked to Application Insights
- Loads panel definitions from `docs/observability/workbooks/movement-blocked-reasons.workbook.json`
- Tags the workbook with M2-Observability, Navigation, and Telemetry
- Uses deterministic naming based on resource group ID

**Manual Update:**
To update an existing workbook after JSON changes:
```bash
cd infrastructure
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file main.bicep \
  --parameters name=atlas
```

The deployment is idempotent - workbooks are updated in-place if the definition changes.

## Alignment With Architecture

-   Matches architecture doc: Static Web App + Function App + Service Bus + Gremlin Cosmos DB.
-   Backend unified: Function App provides both HTTP endpoints and queue processors (simpler deployment, single telemetry surface).
-   Service Bus (Basic tier) handles async world event processing.
-   Observability workbooks provide dashboards for M2 milestone telemetry analysis.

## Roadmap (Next Infrastructure Enhancements)

-   ✅ Service Bus namespace + queue (world events / async NPC processing)
-   ✅ Function App (consumption plan) for queue processors
-   Application Insights advanced configuration (sampling, custom metrics)
-   Managed identity RBAC assignments for Cosmos data plane roles
-   Optional Azure OpenAI / AI service (low usage prototype)
-   Tagging strategy (`env`, `project`, `costCenter`)
-   Dead-letter queue monitoring and alerting

## Changelog

| Date       | Change                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-11-04 | Added Movement Blocked Reasons Breakdown workbook module (M2 Observability) with automatic deployment via main.bicep.                       |
| 2025-10-05 | Added Service Bus (Basic tier), Function App (consumption Y1), Storage Account, and RBAC role assignments for world event queue processing. |
| 2025-10-04 | Added Cosmos DB SQL API account and containers (players, inventory, layers, events) per ADR-002.                                            |
| 2025-10-02 | Fixed Cosmos DB Gremlin graph partition key from `/id` to `/partitionKey` (Azure API requirement).                                          |
| 2025-09-14 | Rewrote README to reflect actual Bicep (SWA + Cosmos) and remove obsolete Function App / Storage references.                                |

## Contributing

If you add a new resource: (1) update `main.bicep`, (2) document parameters/outputs here, (3) append to the Changelog.

## Future Improvements (Optional Ideas)

-   Add Bicep modules for logical grouping (e.g., `cosmos.bicep`, `swa.bicep`).
-   Introduce `azuredeploy.*` naming & versioning for production promotion paths.
-   Provide a seeding script (Node/TypeScript) for initial Gremlin vertices/edges.

---

Questions or want automation for seeding / CI workflows? Open an issue or request a helper script.
