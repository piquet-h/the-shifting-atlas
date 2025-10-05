# Infrastructure Validation

This document provides commands and procedures for validating Bicep templates before deployment.

## What-If Deployment Validation

The `what-if` operation shows what changes would be made without actually deploying anything. This is useful for:

- Verifying that only expected resources will be created or modified
- Catching configuration errors before deployment
- Understanding the impact of template changes

### Prerequisites

- Azure CLI installed (`az --version`)
- Authenticated to Azure (`az login`)
- Target resource group exists

### Basic What-If Command

```bash
# Using inline parameters
az deployment group what-if \
  --resource-group <your-resource-group-name> \
  --template-file main.bicep
```

### With Parameters File

If you have a parameters file (e.g., `my.parameters.json`):

```bash
az deployment group what-if \
  --resource-group <your-resource-group-name> \
  --template-file main.bicep \
  --parameters @my.parameters.json
```

### Expected Output for Initial Deployment

When deploying to a new or empty resource group, you should see resources being created:

- Static Web App (`Microsoft.Web/staticSites`)
- Cosmos DB Gremlin account (`Microsoft.DocumentDB/databaseAccounts`)
- Cosmos DB SQL (Core) account (`Microsoft.DocumentDB/databaseAccounts`)
- Gremlin database and graph
- SQL database and containers:
    - `players` (partition key: `/id`)
    - `inventory` (partition key: `/playerId`)
    - `descriptionLayers` (partition key: `/locationId`)
    - `worldEvents` (partition key: `/scopeKey`)
- Key Vault (`Microsoft.KeyVault/vaults`)
- Key Vault secrets (`cosmos-primary-key`, `cosmos-sql-primary-key`)
- Application Insights (`Microsoft.Insights/components`)

### Expected Output After Issue #102 Implementation

If the Gremlin and SQL accounts already exist but the `descriptionLayers` and `worldEvents` containers are missing, the what-if should show:

```
Resource changes: 2 to create, 0 to modify, 0 to delete.

+ Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/descriptionLayers
+ Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers/worldEvents
```

**Note:** If you see modifications to existing resources, review carefully to ensure they are expected (e.g., app settings updates).

### Linting (Bicep Build)

Validate Bicep syntax and catch errors:

```bash
cd infrastructure
az bicep build --file main.bicep
```

A successful build produces no output and exit code 0. Errors will be displayed with line numbers.

### Full Validation Workflow

1. **Lint the template:**

    ```bash
    az bicep build --file main.bicep
    ```

2. **Run what-if:**

    ```bash
    az deployment group what-if \
      --resource-group <your-rg> \
      --template-file main.bicep
    ```

3. **Review output:**
    - Verify only expected resources appear
    - Check partition keys match specification
    - Confirm no unintended deletions

4. **Deploy if satisfied:**
    ```bash
    az deployment group create \
      --resource-group <your-rg> \
      --template-file main.bicep \
      --query properties.outputs
    ```

## Common Issues

### "Resource not found" for existing resources

If you see deletion or recreation warnings for existing resources:

- Ensure resource names match exactly (check `cosmosAccountName`, `cosmosSqlAccountName`, etc.)
- Verify the template is pointed at the correct resource group

### Unexpected modifications to app settings

App settings changes are expected when environment variable names are added or updated. Review the diff to ensure new settings are intentional.

### API version warnings

If Azure CLI warns about newer API versions being available, this is informational and doesn't block deployment. Update API versions in a separate change if desired.

## CI/CD Integration

For automated validation in CI/CD pipelines:

```yaml
- name: Validate Bicep
  run: |
      az bicep build --file infrastructure/main.bicep
      az deployment group what-if \
        --resource-group ${{ secrets.AZURE_RG }} \
        --template-file infrastructure/main.bicep \
        --parameters @infrastructure/production.parameters.json
```

---

**Last Updated:** 2025-10-05 (Issue #102 - Cosmos SQL containers completion)
