## CI/CD: Frontend + Co-Located API (Azure Static Web App)

Automated deployment pipeline for the `frontend` (Vite + React) and its co-located Azure Functions in `frontend/api` using GitHub Actions with **OIDC only** (no deployment tokens at all: production + previews).

### Triggers

Workflow: `.github/workflows/frontend-swa-deploy.yml`

Runs on:

- `push` to `main` affecting `frontend/**`
- `pull_request` targeting `main` with changes in `frontend/**` (preview environment)
- Manual `workflow_dispatch` (force a redeploy)

### Required Repository Variables (Actions > Variables)

| Variable                | Purpose                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| `AZURE_CLIENT_ID`       | Federated identity (App Registration) client ID granted access to the Static Web App. |
| `AZURE_TENANT_ID`       | Azure AD tenant ID.                                                                   |
| `AZURE_SUBSCRIPTION_ID` | Subscription containing the Static Web App.                                           |
| `AZURE_RESOURCE_GROUP`  | Resource group (currently used for reference; CLI command does not need it now).      |
| `SWA_NAME`              | Name of the deployed Static Web App (matches Bicep output `staticWebAppName`).        |

### Removed Token Requirement

Previously a deployment token (`AZURE_STATIC_WEB_APPS_API_TOKEN`) was optional for PR previews. The workflow now uses **OIDC exclusively** for both production and preview deployments. No token secrets are required. Remove any stale secret to reduce attack surface.

### OIDC Setup (Summary)

1. Create an Azure AD App Registration (or use existing) and federated credential for your repo (`<org>/<repo>`), branch `main`. (Portal: App Registration > Federated credentials.)
2. Assign the identity the required role to the Static Web App (e.g., `Contributor` or `Static Web App Contributor`). Minimum necessary principle applies—reduce later to a scoped custom role if desired.
3. Add the four variables above to the GitHub repository.
4. (Optional) Retrieve deployment token from Static Web App (Portal > Overview > Manage deployment token) and store as `AZURE_STATIC_WEB_APPS_API_TOKEN` if you want token-based PR previews.

### Caching

- `actions/setup-node` with `cache: npm` for dependencies.
- Build artifacts are not currently cached (they’re quick). Consider adding a separate build job with artifact upload if pipeline time increases significantly.

### Job Flow (Push to main)

1. Checkout & install dependencies across workspaces.
2. Type check (`npm run typecheck -w frontend`).
3. Build SPA and Functions.
4. Azure OIDC login.
5. Deploy with `swa deploy` to production environment.

### Job Flow (Pull Request)

1. Checkout & build (same as main).
2. OIDC login.
3. Deploy deterministic preview environment named `pr<PR_NUMBER>` via `swa deploy --env pr<PR_NUMBER>`.

Deterministic naming allows idempotent updates per PR. When a PR closes, a cleanup job runs (currently no-op if the service auto-expires previews; placeholder for future explicit deletion when CLI/REST supports it directly).

### Local Verification Before Commit

```bash
# From repo root
npm install --workspaces
npm run build -w frontend
npm run build -w frontend/api
npm run swa # optional integrated emulator
```

### Bicep Alignment

`main.bicep` sets `skipGithubActionWorkflowGeneration: true`; this manual workflow is the intended replacement and uses the SWA name output as `SWA_NAME`.

### Observability / Future Enhancements

- Add Application Insights + instrumentation.
- Add `actions/cache` layer for Vite cache if build time grows.
- Introduce lint step (`eslint .`) once config present.
- Add infrastructure workflow on changes under `infrastructure/**` with `what-if` preview.

### Troubleshooting

| Symptom                | Cause                                               | Fix                                                                                          |
| ---------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 403 during deploy      | OIDC federated credential missing or wrong audience | Recreate federated credential with repo + branch.                                            |
| Preview not created    | OIDC identity lacks sufficient role                 | Ensure role assignment includes the Static Web App (e.g., Contributor / SWA Contributor).    |
| Functions not updating | Stale build                                         | Ensure `frontend/api/dist` cleared—run `npm run build -w frontend/api` locally to reproduce. |

### Verification After Deploy

1. Visit production URL (Azure Portal > Static Web App). Confirm updated assets hash.
2. Hit `/api/website/health` endpoint and check new build time or version marker (add one if needed).
3. (PR) Validate preview URL (named environment `pr<PR_NUMBER>`) appears in PR conversation or Portal.


