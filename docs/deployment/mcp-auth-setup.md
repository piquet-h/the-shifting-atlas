# MCP Authentication Setup Guide

This guide covers configuring Azure AD authentication for The Shifting Atlas MCP server (Function App).

## Overview

The MCP server uses **App Service Authentication (EasyAuth)** with Azure Active Directory to authenticate callers. Only callers with:

- A valid AAD bearer token
- The **Narrator** app role assigned
- Their client app ID in the `MCP_ALLOWED_CLIENT_APP_IDS` allow-list

...are authorized to invoke MCP tools.

## Server-Side Setup (Bicep)

The infrastructure is configured in `infrastructure/main.bicep`:

### 1. Entra App Registration

You must create an Entra App Registration with:

- **Client ID**: Referenced in `functionAppAadClientId` parameter
- **Identifier URI**: Referenced in `functionAppAadIdentifierUri` parameter (e.g., `api://<tenantId>/shifting-atlas-api`)
- **App Role**: Define a role named **Narrator** with allowed member types (users and/or applications)

### 2. Bicep Parameters

Set these parameters during deployment:

```bash
az deployment group create \
  --resource-group rg-atlas-game \
  --template-file infrastructure/main.bicep \
  --parameters \
    functionAppAadClientId='3b67761b-d23a-423b-a8c4-c2b003c31db1' \
    functionAppAadIdentifierUri='api://fecae6e9-696f-46e4-b1c8-5b471b499a24/shifting-atlas-api' \
    mcpAllowedClientAppIds='3b67761b-d23a-423b-a8c4-c2b003c31db1'
```

**Parameter details:**

- `functionAppAadClientId`: The client ID of your Function App's Entra App Registration (default: `3b67761b-d23a-423b-a8c4-c2b003c31db1`)
- `functionAppAadIdentifierUri`: The audience/identifier URI configured on that app registration (default: `api://fecae6e9-696f-46e4-b1c8-5b471b499a24/shifting-atlas-api`)
- `mcpAllowedClientAppIds`: Comma-separated list of client app IDs permitted to call MCP endpoints (default: same as `functionAppAadClientId`)

**Note**: The default values shown above are already configured for The Shifting Atlas production environment. You only need to override these for different environments or additional callers.

### 3. What the Bicep Configures

The `infrastructure/main.bicep` template:

- Enables App Service Authentication with `unauthenticatedClientAction: 'Return401'` (no browser redirects)
- Configures the Azure Active Directory identity provider with your app registration
- Accepts tokens with audiences matching either `functionAppAadIdentifierUri` or `functionAppAadClientId`
- Adds `MCP_ALLOWED_CLIENT_APP_IDS` to the Function App's application settings

## Client-Side Setup

### Entra App or Service Principal

For calling the MCP server, you have two options:

**Option A: Use Azure CLI (recommended for development)**

The Azure CLI is already pre-authorized to access the MCP API, so you can get tokens without additional consent:

1. Log in with Azure CLI: `az login --tenant fecae6e9-696f-46e4-b1c8-5b471b499a24`
2. Get token (see "Obtaining an Access Token" below)
3. No additional app registration needed!

**Option B: Create a dedicated service principal**

For production or automated scenarios:

1. Register a new app in Azure AD (or use an existing one)
2. Note its **Application (client) ID**
3. Assign it the **Narrator** app role on your Function App's app registration (`3b67761b-d23a-423b-a8c4-c2b003c31db1`)
4. Add its client ID to the `mcpAllowedClientAppIds` Bicep parameter (or Function App setting `MCP_ALLOWED_CLIENT_APP_IDS`)

### Obtaining an Access Token

Use Azure CLI (v2) to get a bearer token using scope syntax:

```bash
az account get-access-token --scope api://fecae6e9-696f-46e4-b1c8-5b471b499a24/shifting-atlas-api/.default
```

Note: this uses the configured Application ID URI from the Function App's Entra App Registration. This requires admin consent for your API in Entra ID.

For service principals (non-interactive):

```bash
az login --service-principal \
  --username <client-id> \
  --password <client-secret> \
  --tenant fecae6e9-696f-46e4-b1c8-5b471b499a24

az account get-access-token --scope api://fecae6e9-696f-46e4-b1c8-5b471b499a24/shifting-atlas-api/.default
```

### VS Code MCP Client Configuration

Update `.vscode/mcp.json`:

```json
{
    "inputs": [
        {
            "type": "promptString",
            "id": "atlas-mcp-bearer-token",
            "description": "Azure AD Bearer Token for Atlas MCP",
            "password": true
        }
    ],
    "servers": {
        "live-the-shifting-atlas": {
            "type": "http",
            "url": "https://func-atlas.azurewebsites.net/runtime/webhooks/mcp",
            "headers": {
                "Authorization": "Bearer ${input:atlas-mcp-bearer-token}"
            }
        }
    }
}
```

When VS Code prompts for the token, paste the access token obtained above.

## Verification

### Expected Behavior

**With valid token + Narrator role + allow-listed app ID:**

- MCP tools return JSON responses
- Telemetry events `MCP.Auth.Allowed` and `MCP.Tool.Invoked` are logged

**Missing/invalid token:**

- HTTP 401 with `{ "error": "unauthorized" }`
- Telemetry event `MCP.Auth.Denied` with `reason: "missing_token"`

**Valid token but wrong app ID or missing Narrator role:**

- HTTP 403 with `{ "error": "forbidden" }`
- Telemetry event `MCP.Auth.Denied` with `reason: "unknown_client"` or `"missing_role"`

### Test the Endpoint

```bash
# Get token (scope syntax)
TOKEN=$(az account get-access-token --scope api://fecae6e9-696f-46e4-b1c8-5b471b499a24/shifting-atlas-api/.default --query accessToken -o tsv)

# Call MCP health endpoint
curl -H "Authorization: Bearer $TOKEN" \
  https://func-atlas.azurewebsites.net/runtime/webhooks/mcp
```

## Troubleshooting

### "Sign in" redirect instead of 401

- **Cause**: `unauthenticatedClientAction` is set to `RedirectToLoginPage` instead of `Return401`
- **Fix**: Redeploy infrastructure or manually change in Azure Portal → Authentication → Settings

### 403 "forbidden" with valid token

- **Cause**: Either the caller's app ID is not in `MCP_ALLOWED_CLIENT_APP_IDS`, or the Narrator role is not assigned
- **Fix**:
    - Verify `MCP_ALLOWED_CLIENT_APP_IDS` contains the caller's app ID
    - Verify the Narrator app role is assigned to the caller in the Function App's app registration

### Token expires quickly

- Access tokens typically expire after 1 hour
- For long-running sessions, implement token refresh logic or use a managed identity

## References

- Backend MCP auth implementation: `backend/src/mcp/auth/mcpAuth.ts`
- MCP architecture: `docs/architecture/agentic-ai-and-mcp.md`
- Infrastructure: `infrastructure/main.bicep`
