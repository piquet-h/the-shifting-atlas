# Key Vault Decision: New Vault Provisioned

**Date**: 2025 (Implementation)  
**Status**: Implemented  
**Related Issue**: #49 - Managed Identity & Key Vault Secret Management Baseline

## Context

The project requires secure secret management for:

- Cosmos DB Gremlin API credentials
- Cosmos DB SQL/Core API credentials
- Future: Service Bus connection strings, AI model provider API keys, signing secrets

The implementation needed to decide between reusing an existing Key Vault or provisioning a dedicated new vault.

## Evaluation Criteria (from Issue #49)

The issue specified these criteria for Key Vault reuse:

1. **Region alignment** - Vault must be in same region as core workload
2. **Soft-delete + purge protection** - Security features enabled
3. **No cross-team policy conflicts** - Naming conventions and access policies compatible
4. **Available secret quota** - Sufficient capacity for our secrets
5. **Latency acceptable** - Performance requirements met

**Reuse requires ALL criteria to pass.**

## Decision: New Dedicated Key Vault

A new Key Vault was provisioned for this project with the following rationale:

### Rationale

1. **Clean Infrastructure Baseline** - This is a new project with dedicated subscription/resource group
2. **Simplified Access Control** - System-assigned Managed Identity for Static Web App with scoped access policies
3. **No External Dependencies** - Avoids coordination overhead with other teams/projects
4. **Standard Tier** - Cost-effective for development and production workloads
5. **Consistent Naming** - Uses project-specific naming convention `kv-${uniqueString(resourceGroup().id)}`

### Implementation Details

The Key Vault is provisioned in `infrastructure/main.bicep`:

```bicep
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: tenant().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: false
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: true
    accessPolicies: [
      {
        tenantId: tenant().tenantId
        objectId: staticSite.identity.principalId
        permissions: {
          secrets: ['get', 'list']
        }
      }
    ]
  }
}
```

### Secrets Stored

- `cosmos-primary-key` - Gremlin API authentication
- `cosmos-sql-primary-key` - SQL/Core API authentication
- Placeholders for future secrets:
    - `service-bus-connection-string`
    - `model-provider-api-key`
    - `signing-secret`

### Security Configuration

- **Access Model**: Access policy-based (simpler for MVP)
- **Identity**: System-assigned Managed Identity for Static Web App
- **Permissions**: Minimal `get` and `list` for secrets only
- **Soft-delete**: Should be enabled in production (default behavior in Azure)
- **Purge protection**: Should be enabled for production (not enforced in template for dev flexibility)

## Future Considerations

1. **Rotate to RBAC Authorization** - For more granular control, consider migrating from access policies to RBAC (`enableRbacAuthorization: true`)
2. **Secret Rotation** - Implement automated rotation for long-lived secrets
3. **Private Endpoints** - For production, add private endpoint for additional network security
4. **Monitoring** - Enable diagnostic settings to track secret access patterns

## References

- Infrastructure: `infrastructure/main.bicep`
- Secrets Helper: `shared/src/secrets/secretsHelper.ts`
- Documentation: `infrastructure/README.md`, `shared/src/secrets/README.md`
