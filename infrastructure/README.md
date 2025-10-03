# Infrastructure (Bicep)

Provisioned resources:

| Resource                      | Purpose                                               | Notes                                                                                                                |
| ----------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Azure Static Web App (SWA)    | Hosts frontend + managed API (`/frontend/api`).       | Workflow auto‑gen disabled (`skipGithubActionWorkflowGeneration: true`).                                             |
| Azure Cosmos DB (Gremlin API) | World graph: rooms, exits, NPCs, items, player state. | Session consistency; Gremlin capability enabled. Partition key: `/partitionKey` (required property on all vertices). |
| Azure Key Vault               | Stores Cosmos primary key secret.                     | Access policy grants SWA system identity get/list for secrets.                                                       |

Files:

- `main.bicep` – SWA + Cosmos + Key Vault + secret injection
- `parameters.json` – example / placeholder (not required; inline params acceptable)

Earlier storage + separate Function App plan has been superseded by co‑located managed API for MVP.

## Cosmos DB Gremlin Partition Key

The Gremlin graph uses `/partitionKey` as the partition key property. **Important constraints**:

- Gremlin API reserves `/id` and `/label` properties; they cannot be used as partition keys
- All vertices must include a `partitionKey` property when created
- Common strategies: use vertex type (e.g., `"Location"`, `"Player"`) or a domain-specific identifier (e.g., region, zone)
- For small-to-medium graphs, a single partition value (e.g., `"world"`) is acceptable during development

**Example vertex creation**:
```gremlin
g.addV('Location').property('id', '<uuid>').property('partitionKey', 'world').property('name', 'Mosswell Square')
```

## Parameters

| Name                | Type   | Default                 | Required | Description                       |
| ------------------- | ------ | ----------------------- | -------- | --------------------------------- |
| `location`          | string | resource group location | No       | Region (override).                |
| `staticWebAppSku`   | string | Standard                | No       | SWA tier (`Free` or `Standard`).  |
| `staticWebAppName`  | string | derived unique string   | No       | Auto‑generated if not overridden. |
| `cosmosAccountName` | string | derived unique string   | No       | Auto‑generated if not overridden. |
| `keyVaultName`      | string | derived unique string   | No       | Auto‑generated if not overridden. |

Secrets/keys are injected via Key Vault; no repository URL parameter is currently required because CI handles deployment.

Example parameter usage inline or via a parameter file you maintain separately.

## Outputs

| Output              | Description                          |
| ------------------- | ------------------------------------ |
| `cosmosAccountName` | Name of the Cosmos DB account.       |
| `cosmosEndpoint`    | Document (Gremlin) endpoint URL.     |
| `staticWebAppName`  | Name of the Static Web App resource. |

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

| Topic               | Current State                                                                        | Planned Improvement                                         |
| ------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Secrets Management  | Key Vault configured with Managed Identity. Runtime retrieval via secrets helper.   | Add secret rotation automation (future).                    |
| Observability       | Application Insights connected.                                                      | Add sampling & dependency tracking tuning.                  |
| Messaging           | No Service Bus / queues.                                                             | Add Service Bus namespace + queue for world events.         |
| Identity / RBAC     | System-assigned Managed Identity for SWA with Key Vault access policies.            | Migrate to RBAC authorization for finer-grained control.    |
| CI/CD               | Workflow not auto-generated.                                                         | Author SWA + seeding GitHub Actions manually.               |

## Secret Management Baseline

**Status**: ✅ Implemented (Issue #45)

### Architecture

- **Key Vault**: Standard tier, access policy-based (SWA system identity has `get`, `list` permissions)
- **Secrets Stored**:
  - `cosmos-primary-key` (Gremlin API)
  - `cosmos-sql-primary-key` (SQL/Core API)
  - Placeholders for future: `service-bus-connection-string`, `model-provider-api-key`, `signing-secret`
- **Runtime Access**: Via `@atlas/shared` `secretsHelper` with:
  - Lazy caching (5-minute TTL)
  - Exponential backoff retry (3 attempts)
  - Telemetry (cache hit/miss, fetch success/failure)
  - Allowlisted secret keys
  - Local dev fallback to environment variables (`.env.development`)

### Local Development

1. Copy `.env.development.example` to `.env.development`
2. Set required secrets (e.g., `COSMOS_GREMLIN_KEY`)
3. Helper automatically uses env vars when `KEYVAULT_NAME` is not set
4. Production guard: refuses to use local env vars if `NODE_ENV=production`

### Security Notes

- Never commit `.env.development` (excluded in `.gitignore`)
- Direct access to secrets outside helper is prevented by allowlist validation
- Managed Identity eliminates need for connection strings in app settings
- Consider enabling soft-delete and purge protection for production

## Alignment With Architecture

- Matches architecture doc: Static Web App + Gremlin Cosmos DB as MVP foundation.
- Deviates intentionally: No separate dedicated Function App (Managed API model used instead).
- Pending: Service Bus (world event queue), Application Insights, Key Vault, role assignments.

## Roadmap (Next Infrastructure Enhancements)

- Service Bus namespace + queue (world events / async NPC processing)
- Application Insights (telemetry for commands, performance)
- Managed identity RBAC assignments (Cosmos data plane roles)
- Optional Azure OpenAI / AI service (low usage prototype) outputs
- Gremlin database/graph explicit provisioning (if automated seeding)
- Tagging strategy (`env`, `project`, `costCenter`)

## Changelog

| Date       | Change                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 2025-10-02 | Fixed Cosmos DB Gremlin graph partition key from `/id` to `/partitionKey` (Azure API requirement).          |
| 2025-09-14 | Rewrote README to reflect actual Bicep (SWA + Cosmos) and remove obsolete Function App / Storage references. |

## Contributing

If you add a new resource: (1) update `main.bicep`, (2) document parameters/outputs here, (3) append to the Changelog.

## Future Improvements (Optional Ideas)

- Add Bicep modules for logical grouping (e.g., `cosmos.bicep`, `swa.bicep`).
- Introduce `azuredeploy.*` naming & versioning for production promotion paths.
- Provide a seeding script (Node/TypeScript) for initial Gremlin vertices/edges.

---

Questions or want automation for seeding / CI workflows? Open an issue or request a helper script.
