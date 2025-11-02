# Troubleshooting: API 404 Errors from Static Web App

## Symptom
- Frontend loads but command box is disabled
- Browser console shows 404 errors for `/api/player` and `/api/ping`
- Error: `GET https://[swa-hostname]/api/player net::ERR_ABORTED 404 (Not Found)`

## Root Cause
The Azure Static Web App is not properly connected to the backend Azure Function App, causing all `/api/*` requests to return 404.

## Project-Specific Values
For The Shifting Atlas project:
- Static Web App name: Check `vars.SWA_NAME` repository variable
- Function App name: `func-atlas` (defined in infrastructure/main.bicep)
- Resource Group: `rg-atlas-game`

Replace these values as appropriate for your deployment.

## Diagnosis

### 1. Check if linked backend exists
```bash
az staticwebapp backends list --name <swa-name>
```

**Expected output:** JSON array with at least one backend entry
**Problem if:** Empty array `[]` or error message

### 2. Check function app status
```bash
az functionapp show --name <function-app-name> --query "state" -o tsv
# For this project: az functionapp show --name func-atlas --query "state" -o tsv
```

**Expected:** `Running`
**Problem if:** `Stopped` or other state

### 3. Check function app has functions deployed
```bash
az functionapp function list --name <function-app-name> --query '[].name' -o tsv
# For this project: az functionapp function list --name func-atlas --query '[].name' -o tsv
```

**Expected:** List including `player`, `ping`, etc.
**Problem if:** Empty list or error

### 4. Test function app directly
```bash
FUNC_URL=$(az functionapp show --name <function-app-name> --query "defaultHostName" -o tsv)
curl -v "https://$FUNC_URL/api/player"
```

**Expected:** HTTP 200 with JSON response
**Problem if:** 404, 500, or timeout

## Solutions

### Solution 1: Redeploy Infrastructure (Recommended)
If the linked backend configuration is missing or incorrect, redeploy the infrastructure:

```bash
# Trigger infrastructure workflow manually
gh workflow run deploy-infrastructure.yml
```

Or push a change to the `infrastructure/` directory to trigger automatic deployment.

### Solution 2: Manually Link Backend
If infrastructure is deployed but linking failed:

```bash
# Get resource IDs
SWA_ID=$(az staticwebapp show --name <swa-name> --query id -o tsv)
FUNC_ID=$(az functionapp show --name func-atlas --query id -o tsv)

# Link the backend
az staticwebapp backends link \
  --name <swa-name> \
  --backend-resource-id "$FUNC_ID" \
  --backend-region westus2
```

### Solution 3: Verify Function App is Running
If the function app is stopped:

```bash
az functionapp start --name <function-app-name>
# For this project: az functionapp start --name func-atlas
```

### Solution 4: Redeploy Backend Functions
If functions are not registered or outdated:

```bash
# Trigger backend deployment workflow manually
gh workflow run backend-functions-deploy.yml
```

Or push a change to the `backend/` directory.

## Verification
After applying a solution, verify the fix:

1. **Check linked backend:**
   ```bash
   az staticwebapp backends list --name <swa-name>
   ```

2. **Test via SWA hostname:**
   ```bash
   curl -v "https://[swa-hostname]/api/player"
   ```
   Should return 200 OK with JSON (might return 500 if database not configured, but should NOT be 404)

3. **Test frontend:**
   - Open the Static Web App URL in browser
   - Open Developer Console (F12)
   - Check Network tab for `/api/player` request
   - Command box should be enabled after page load

## Prevention
- Ensure infrastructure is deployed BEFORE deploying frontend or backend
- Always deploy in order: Infrastructure → Backend → Frontend
- The deployment workflows now include verification steps that will catch these issues

## References
- [Azure Static Web Apps - Link Backend](https://learn.microsoft.com/en-us/azure/static-web-apps/apis-functions)
- Infrastructure definition: `infrastructure/main.bicep`
- Backend deployment: `.github/workflows/backend-functions-deploy.yml`
- Frontend deployment: `.github/workflows/frontend-swa-deploy.yml`
