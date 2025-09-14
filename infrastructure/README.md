# Infrastructure (Bicep)

Current Bicep template provisions the two core MVP platform resources:

| Resource                              | Purpose                                                          | Notes                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Azure Static Web App (Free tier)      | Hosts frontend + Managed API (Functions in `/frontend/api`).     | Workflow generation disabled (`skipGithubActionWorkflowGeneration: true`). You must configure CI/CD manually. |
| Azure Cosmos DB Account (Gremlin API) | Persistent world graph: Rooms, Exits, NPCs, Items, Player State. | Session consistency; Gremlin enabled via capability.                                                          |

Current Bicep template provisions the following MVP resources:
Files:

- `main.bicep` – resource definitions (Static Web App + Cosmos DB, app settings injection)
- `parameters.json` – currently empty (you pass parameters inline)
  | Azure Key Vault | Secure storage for Cosmos primary key (secret). | Using access policy granting SWA identity secret get/list. |

The earlier placeholder description (Storage + separate Function Apps) is obsolete. Backend logic should live inside the Static Web App managed API (`/frontend/api`) per architecture docs.

## Parameters

| Name                         | Type                                           | Default                 | Required | Description                                                 |
| ---------------------------- | ---------------------------------------------- | ----------------------- | -------- | ----------------------------------------------------------- |
| `location`                   | string                                         | resource group location | No       | Deployment region override.                                 |
| `keyVaultName`               | Name of the provisioned Key Vault.             |
| `cosmosPrimaryKeySecretName` | Full name (vault/secret) of stored Cosmos key. |
| `repositoryUrl`              | string                                         | —                       | Yes      | Git repository for SWA to reference (no workflow auto‑gen). |
| `branch`                     | string                                         | —                       | Yes      | Branch name for SWA build context.                          |

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

1. Configure GitHub Action or SWA build workflow (since auto-generation is disabled) to publish the frontend and `/frontend/api` Functions.
   - Implemented: see `.github/workflows/frontend-swa-deploy.yml` and `docs/ci-cd.md` (OIDC-based, path-filtered).
2. Seed Cosmos Gremlin graph with initial rooms/NPCs (script or manual queries).
3. Store AI / future secret values securely (temporary: SWA app settings; planned: Key Vault or managed identity with Data Plane RBAC once feasible).
4. Rotate Cosmos key if shared or exposed during testing. Plan migration to a managed identity approach (e.g., when using Data API Builder or Azure Functions with identity-based access patterns).

## Security & Limitations

| Topic               | Current State                                              | Planned Improvement                                                 |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Cosmos Key Exposure | Primary key injected into SWA app settings (`COSMOS_KEY`). | Replace with Key Vault or identity-based access.                    |
| Observability       | No Application Insights yet.                               | Add App Insights + sampling & dependency tracking.                  |
| Messaging           | No Service Bus / queues.                                   | Add Service Bus namespace + queue for world events.                 |
| Secrets Management  | No Key Vault.                                              | Introduce Key Vault, reference secrets in Bicep.                    |
| Identity / RBAC     | No managed identity assignments.                           | Add system-assigned / user-assigned identity and Cosmos RBAC roles. |
| CI/CD               | Workflow not auto-generated.                               | Author SWA + seeding GitHub Actions manually.                       |

## Alignment With Architecture

- Matches architecture doc: Static Web App + Gremlin Cosmos DB as MVP foundation.
- Deviates intentionally: No separate dedicated Function App (Managed API model used instead).
- Pending: Service Bus (world event queue), Application Insights, Key Vault, role assignments.

## Roadmap (Next Infrastructure Enhancements)

- Service Bus namespace + queue (world events / async NPC processing)
- Application Insights (telemetry for commands, performance)
- Key Vault (central secret store; remove raw Cosmos key from settings)
- Managed Identity + RBAC (Static Web App identity -> Cosmos Data Reader/Contributor roles)
- Optional Azure OpenAI resource (gated, low-usage) + config outputs
- Gremlin database/graph explicit provisioning module (if needed for automation)
- Tagging strategy (`env`, `project`, `costCenter`) across resources

## Changelog

| Date       | Change                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 2025-09-14 | Rewrote README to reflect actual Bicep (SWA + Cosmos) and remove obsolete Function App / Storage references. |

## Contributing

If you add a new resource: (1) update `main.bicep`, (2) document parameters/outputs here, (3) append to the Changelog.

## Future Improvements (Optional Ideas)

- Add Bicep modules for logical grouping (e.g., `cosmos.bicep`, `swa.bicep`).
- Introduce `azuredeploy.*` naming & versioning for production promotion paths.
- Provide a seeding script (Node/TypeScript) for initial Gremlin vertices/edges.

---

Questions or want automation for seeding / CI workflows? Open an issue or request a helper script.
