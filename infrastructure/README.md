# Infrastructure (Bicep)

Minimal IaC for early experimentation. Current template provisions:

- Storage Account (general purpose, for Functions + future assets)
- Two Linux Function Apps (intended: API + Queue worker)
- Dynamic (Consumption) hosting plan placeholder

Files:

- `main.bicep` – resource definitions
- `parameters.json` – (empty) parameter file

## Important Limitations

1. `AzureWebJobsStorage` in Function App settings is incorrectly set to the blob endpoint. For a real Function App you must supply a full connection string (or rely on managed identity + new storage binding approach). Update post‑deployment or parameterize properly before production use.
2. No Cosmos DB, Service Bus, or Static Web App resources are provisioned yet.
3. No Key Vault / secrets handling; all app settings are inline.
4. Function Apps will deploy empty until code + pipeline are established.

## Static Web App

The Azure Static Web App resource is not yet defined here. Create it separately (Portal, Azure CLI, or future Bicep module) and point it at the repository. Local emulation uses `npm run swa` (root) which relies on `swa-cli.config.json`.

Identity & Authentication (infrastructure notes):

- Consider provisioning Microsoft Entra External Identities resources (or configuring an existing Entra tenant) when creating the Static Web App. For production, register an application for the frontend (SWA) and another for backend APIs (Functions), configure redirect URIs, and optionally enable social identity providers. Store OIDC metadata and client IDs in outputs or parameterize them for CI/CD secrets handling (Key Vault recommended).

## Deploy Example

```bash
az deployment group create \
	--resource-group <rg> \
	--template-file main.bicep \
	--parameters location=<region>
```

## Next Steps (Planned IaC Enhancements)

- Add Cosmos DB Gremlin account + database/graph outputs.
- Add Service Bus namespace + queue for world events.
- Introduce Application Insights and wire instrumentation key.
- Provide managed identity and role assignments.
- Replace placeholder storage setting with secure approach (KV or identity-based).
- Add Static Web App + deployment token output (or adopt SWA managed GitHub Action).
- Parameterize environment-specific naming & location.
