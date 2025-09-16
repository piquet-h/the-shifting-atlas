# Infrastructure (Bicep)

Provisioned resources:

| Resource                      | Purpose                                               | Notes                                                                    |
| ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Azure Static Web App (SWA)    | Hosts frontend + managed API (`/frontend/api`).       | Workflow auto‑gen disabled (`skipGithubActionWorkflowGeneration: true`). |
| Azure Cosmos DB (Gremlin API) | World graph: rooms, exits, NPCs, items, player state. | Session consistency; Gremlin capability enabled.                         |
| Azure Key Vault               | Stores Cosmos primary key secret.                     | Access policy grants SWA system identity get/list for secrets.           |

Files:

- `main.bicep` – SWA + Cosmos + Key Vault + secret injection
- `parameters.json` – example / placeholder (not required; inline params acceptable)

Earlier storage + separate Function App plan has been superseded by co‑located managed API for MVP.

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
        "location": { "value": "westeurope" },
    },
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

1. (Done) CI workflow builds & deploys SWA + API (`.github/workflows/frontend-swa-deploy.yml`).
2. Seed Gremlin graph (rooms/NPCs) – script pending.
3. Move runtime code to managed identity access (stop surfacing raw key to Functions once Gremlin SDK usage added).
4. Add Application Insights + instrumentation (future Bicep update).

## Security & Limitations

| Topic               | Current State                                              | Planned Improvement                                                 |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------- |
| Cosmos Key Exposure | Primary key injected into SWA app settings (`COSMOS_KEY`). | Replace with Key Vault or identity-based access.                    |
| Observability       | No Application Insights yet.                               | Add App Insights + sampling & dependency tracking.                  |
| Messaging           | No Service Bus / queues.                                   | Add Service Bus namespace + queue for world events.                 |
| Secrets Management  | Key Vault present (Cosmos key).                            | Expand to additional secrets (api keys, feature flags).             |
| Identity / RBAC     | No managed identity assignments.                           | Add system-assigned / user-assigned identity and Cosmos RBAC roles. |
| CI/CD               | Workflow not auto-generated.                               | Author SWA + seeding GitHub Actions manually.                       |

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
| 2025-09-14 | Rewrote README to reflect actual Bicep (SWA + Cosmos) and remove obsolete Function App / Storage references. |

## Contributing

If you add a new resource: (1) update `main.bicep`, (2) document parameters/outputs here, (3) append to the Changelog.

## Future Improvements (Optional Ideas)

- Add Bicep modules for logical grouping (e.g., `cosmos.bicep`, `swa.bicep`).
- Introduce `azuredeploy.*` naming & versioning for production promotion paths.
- Provide a seeding script (Node/TypeScript) for initial Gremlin vertices/edges.

---

Questions or want automation for seeding / CI workflows? Open an issue or request a helper script.
