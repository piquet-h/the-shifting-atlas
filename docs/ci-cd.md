# CI/CD Pipelines

## CI/CD: Backend Azure Functions

Automated deployment pipeline for the `backend` (Node.js + TypeScript) Azure Functions using GitHub Actions with **OIDC authentication**.

### Triggers

Workflow: `.github/workflows/backend-functions-deploy.yml`

Runs on:

- `push` to `main` affecting `backend/**` or `shared/**`
- Manual `workflow_dispatch` (force a redeploy with optional reason)

### Required Repository Secrets

| Secret                  | Purpose                                         |
| ----------------------- | ----------------------------------------------- |
| `AZURE_CLIENT_ID`       | Federated identity (App Registration) client ID |
| `AZURE_TENANT_ID`       | Azure AD tenant ID                              |
| `AZURE_SUBSCRIPTION_ID` | Subscription containing the Azure Function App  |

### Target Infrastructure

- **Function App**: `func-atlas` (Flex Consumption plan)
- **Runtime**: Node.js 20.x
- **Build**: Remote build enabled for Flex Consumption optimization
- **Authentication**: OIDC (no publish profiles required)

### Deployment Process

1. **Build Phase**: Compiles shared dependencies, then backend TypeScript
2. **Test Phase**: Runs all backend tests to ensure quality
3. **Deploy Phase**: Uses Azure Functions Action with Flex Consumption settings
4. **Verify Phase**: Tests health endpoint to confirm successful deployment

### npm Authentication

The workflow automatically configures npm authentication for GitHub Packages using the `NODE_AUTH_TOKEN` environment variable set to `GITHUB_TOKEN`, combined with `setup-node` configured for the GitHub Packages registry. The `packages: read` permission enables access to private packages like `@piquet-h/shared` during the build process without requiring custom tokens.

---

## CI/CD: Frontend Static Web App

Automated deployment pipeline for the `frontend` (Vite + React) Static Web App using GitHub Actions with deployment token authentication for production deployments only.

### Triggers

Workflow: `.github/workflows/frontend-swa-deploy.yml`

Runs on:

- `push` to `main` affecting `frontend/**`
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

The workflow uses **OIDC** for Azure authentication and **deployment token** for the Static Web App deployment to production only. Preview environments have been removed.

### OIDC Setup (Summary)

1. Create an Azure AD App Registration (or use existing) and federated credential for your repo (`<org>/<repo>`), branch `main`. (Portal: App Registration > Federated credentials.)
2. Assign the identity the required role to the Static Web App (e.g., `Contributor` or `Static Web App Contributor`). Minimum necessary principle applies—reduce later to a scoped custom role if desired.
3. Add the four variables above to the GitHub repository.
4. Retrieve deployment token from Static Web App (Portal > Overview > Manage deployment token) and store as `AZURE_STATIC_WEB_APPS_API_TOKEN` for production deployments.

### Caching

- `actions/setup-node` with `cache: npm` for dependencies.
- Build artifacts are not currently cached (they’re quick). Consider adding a separate build job with artifact upload if pipeline time increases significantly.

### npm Authentication for GitHub Packages

The workflow automatically configures npm authentication for GitHub Packages using the `NODE_AUTH_TOKEN` environment variable set to `GITHUB_TOKEN`, combined with `setup-node` configured for the GitHub Packages registry. The `packages: read` permission enables access to private packages like `@piquet-h/shared` during the build process without requiring custom tokens.

### Job Flow (Push to main)

1. Checkout & install dependencies across workspaces.
2. Type check (`npm run typecheck -w frontend`).
4. Build SPA.
5. Azure OIDC login.
6. Deploy with Static Web Apps action to production environment.

### Local Verification Before Commit

```bash
# From repo root
npm install --workspaces
npm run build -w frontend
```

### Bicep Alignment

`main.bicep` sets `skipGithubActionWorkflowGeneration: true`; this manual workflow is the intended replacement and uses the SWA name output as `SWA_NAME`.

### Observability / Future Enhancements

- Add Application Insights + instrumentation.
- Add `actions/cache` layer for Vite cache if build time grows.
- Introduce lint step (`eslint .`) once config present.
- Add infrastructure workflow on changes under `infrastructure/**` with `what-if` preview.

### Troubleshooting

| Symptom                          | Cause                                               | Fix                                                |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| 403 during deploy                | OIDC federated credential missing or wrong audience | Recreate federated credential with repo + branch.  |
| (Removed) Functions not updating | N/A                                                 | Functions now deployed separately from `backend/`. |

### Verification After Deploy

1. Visit production URL (Azure Portal > Static Web App). Confirm updated assets hash.
2. Hit `/api/website/health` endpoint and check new build time or version marker (add one if needed).

---

## Core Continuous Integration (`ci.yml`)

Unified quality gate executed on all pushes & pull requests to `main` (and manual dispatch) providing fast feedback and build artifacts for downstream deploys.

### Triggers

Workflow: `.github/workflows/ci.yml`

Runs on:

- `pull_request` → quality feedback prior to merge
- `push` to `main` → produce distributable artifacts
- `workflow_dispatch` for ad‑hoc re-runs

### Job Overview

| Job              | Purpose                                             | Notes                                          |
| ---------------- | --------------------------------------------------- | ---------------------------------------------- |
| `changes`        | Path-based filter (frontend, a11y, backend, shared) | Reduces conditional work (e.g., accessibility) |
| `lint-typecheck` | Monorepo ESLint + TypeScript surface check          | Fails fast; caches deps via composite action   |
| `tests`          | Unit tests across workspaces                        | Depends on `lint-typecheck`                    |
| `accessibility`  | Axe scan for affected frontend / UX docs            | Only on PRs where UI changed (`changes.a11y`)  |
| `summary`        | Human-readable run digest                           | Always runs (even on failures)                 |

### npm Authentication for GitHub Packages

All jobs that install npm packages now automatically configure authentication for GitHub Packages using the workflow's `GITHUB_TOKEN`. This is accomplished through:

1. **Permissions**: The `packages: read` permission is added to the workflow's permissions block
2. **Environment variable**: `NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}` is set at the job level
3. **setup-node configuration**: The `setup-node` action is configured with:
   ```yaml
   registry-url: 'https://npm.pkg.github.com'
   scope: '@piquet-h'
   always-auth: true
   ```

This configuration pattern matches the `publish-shared.yml` workflow and enables seamless access to private packages like `@piquet-h/shared` without requiring custom tokens. The `setup-node` action automatically creates the proper `.npmrc` configuration using the `NODE_AUTH_TOKEN` environment variable.

The prior `build-artifacts` packaging job has been replaced by direct builds in the deploy and CI workflows. Further optimization can explore caching or artifact reuse if build time increases.

### Failure Philosophy

CI is the single merging gate: _no merge without green lint/typecheck/tests_. Accessibility job is advisory (skipped if unrelated). Build artifacts step ensures that code which passed tests can be deployed deterministically.

### Future Enhancements

- Parallel test matrix (Node LTS versions) once stability proven.
- Coverage threshold enforcement.
- Upload ESLint SARIF for code scanning.
  -- (Removed) Reuse CI-built artifacts in deploy workflow (SWA now builds directly; revisit only if build duration becomes a bottleneck).

---

## Infrastructure Deployment (`deploy-infrastructure.yml`)

Declarative Azure resource provisioning (Cosmos DB, Static Web App, etc.) via Bicep with OIDC (no service principals with secrets, no publish profiles).

### Triggers

Workflow: `.github/workflows/deploy-infrastructure.yml`

Runs on:

- `push` to `main` affecting `infrastructure/**` or its own workflow file
- Manual `workflow_dispatch` (safe re-deploy / what-if inspection)

### Job Flow

1. `validate` job
    - Azure OIDC login (`azure/login@v2`)
    - Ensures resource group exists (idempotent)
    - `az deployment group validate` (syntax / basic checks)
    - `what-if` (FullJson) artifact for change review
2. `deploy` job (after successful validation)
    - Re‑login via OIDC
    - Idempotent resource group ensure
    - `az deployment group create --mode Complete` (applies desired state)
    - Emits SWA hostname + lists key resources for audit

### Required Secrets / Variables

| Secret / Variable       | Purpose                      |
| ----------------------- | ---------------------------- |
| `AZURE_CLIENT_ID`       | Federated identity client ID |
| `AZURE_TENANT_ID`       | Tenant for OIDC auth         |
| `AZURE_SUBSCRIPTION_ID` | Target subscription          |

`RG` currently hardcoded (`rg-core`). If multi-environment support is added, parameterize via workflow inputs (e.g. `environment` → derive RG naming convention).

### Safety & Review

- `what-if` artifact enables reviewing planned changes without deployment.
- `--mode Complete` enforces drift removal (intentionally) — ensure no out‑of‑band resources live in the RG or they will be deleted; future enhancement: switch to `Incremental` for conservative runs or add input flag.
- Consider adding conditional approval (environment protection rules) for destructive diffs once team grows.

### Future Enhancements

- Promote `what-if` diff summary into PR comment (auto or on label).
- Parameterize region for future multi‑region active/active design.
- Integrate cost estimation (e.g., `az costmanagement` or third-party) as advisory step.

---

## Cross‑Workflow Opportunities

| Need                   | Current State                     | Opportunity                                                            |
| ---------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| Duplicate builds       | CI + SWA deploy both build        | Consume CI artifacts in deploy to cut time                             |
| Infra drift visibility | Manual inspection of what-if JSON | Summarize & comment on PR introducing infra change                     |
| Security scanning      | Not yet integrated                | Add CodeQL / Dependabot security alerts (Dependabot config present)    |
| Rollback strategy      | Manual redeploy of prior commit   | Publish infra deployment metadata artifact (template hash, parameters) |

---
