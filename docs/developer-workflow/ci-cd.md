# CI/CD Workflows

Continuous Integration and Deployment pipelines for The Shifting Atlas. All workflows are defined as YAML files in `.github/workflows/` and use GitHub Actions.

---

## Philosophy

CI/CD workflows enforce:
1. **Quality gates**: Linting, type checking, testing, accessibility scans
2. **Atomic deployments**: Infrastructure → Backend → Frontend (ordered)
3. **Secret management**: OIDC-based Azure authentication (no raw keys)
4. **Selective execution**: Path filters trigger only affected jobs

**Principle**: Workflows are the source of truth—this document links to them rather than duplicating logic.

---

## Workflow Inventory

### 1. CI (Continuous Integration)

**File**: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

**Triggers**:
- Pull requests to `main`
- Pushes to `main`
- Manual dispatch

**Jobs**:
1. **Detect Changed Areas**: Uses `dorny/paths-filter` to identify which packages changed
2. **Lint & Typecheck**: Runs ESLint + TypeScript compiler for `frontend/`, `backend/`, `shared/`
3. **Backend Tests**: Executes `npm test` in `backend/` (if backend files changed)
4. **Shared Tests**: Executes `npm test` in `shared/` (if shared files changed)
5. **Accessibility Scan**: Runs axe-core against frontend (if frontend/ux files changed)

**Concurrency**: Cancels in-progress runs when new commits pushed to same PR/branch

**Key Features**:
- Matrix strategy for parallel linting/typechecking
- Conditional job execution (skip unchanged packages)
- GitHub Packages authentication (`NODE_AUTH_TOKEN`)

---

### 2. Frontend Static Web App Deploy

**File**: [`.github/workflows/frontend-swa-deploy.yml`](../../.github/workflows/frontend-swa-deploy.yml)

**Triggers**:
- Push to `main` (when `frontend/**` changes)
- Manual dispatch (with optional reason input)

**Authentication**: Azure OIDC (federated credentials, no secrets)

**Jobs**:
1. **Build**:
   - Install dependencies (`npm ci`)
   - Build frontend (`npm run build`)
   - Output: `frontend/dist/`

2. **Deploy**:
   - Login to Azure via OIDC
   - Fetch SWA deployment token from Azure
   - Deploy static assets using `azure/static-web-apps-deploy` action
   - Configure Azure AD (Entra) app settings (`AAD_CLIENT_ID`, etc.)

**Concurrency**: Single deployment at a time (prevents race conditions)

**Required Secrets**:
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_CLIENT_SECRET` (optional, for AAD confidential flow)

**Required Repository Variables**:
- `AZURE_RESOURCE_GROUP`
- `SWA_NAME` (optional; derived from infrastructure outputs if absent)

---

### 3. Backend Functions Deploy

**File**: [`.github/workflows/backend-functions-deploy.yml`](../../.github/workflows/backend-functions-deploy.yml)

**Triggers**:
- Push to `main` (when `backend/**` or `shared/**` changes)
- Manual dispatch

**Authentication**: Azure OIDC

**Jobs**:
1. **Build**:
   - Install `shared/` dependencies
   - Install `backend/` dependencies (pulls `@piquet-h/shared` from GitHub Packages)
   - Build TypeScript (`npm run build`)
   - Output: `backend/dist/`

2. **Deploy**:
   - Login to Azure via OIDC
   - Fetch Function App publish profile
   - Deploy using `azure/functions-action`
   - App settings (connection strings, secrets) managed via Bicep/Azure Portal

**Deployment Slot**: Production (no staging slot yet)

**Note**: Backend deployment depends on `@piquet-h/shared` package being published (see Publish Shared workflow)

---

### 4. Deploy Infrastructure (Bicep)

**File**: [`.github/workflows/deploy-infrastructure.yml`](../../.github/workflows/deploy-infrastructure.yml)

**Triggers**:
- Push to `main` (when `infrastructure/**` changes)
- Manual dispatch (with optional reason)

**Authentication**: Azure OIDC

**Jobs**:
1. **Validate Bicep**:
   - Lint Bicep files (`az bicep build`)
   - Validate ARM template syntax

2. **Deploy**:
   - Login to Azure via OIDC
   - Create resource group (if missing)
   - Deploy Bicep template (`az deployment group create`)
   - Capture outputs (SWA name, Function App name, Cosmos endpoints)

**Resources Provisioned**:
- Azure Static Web Apps (frontend hosting)
- Azure Functions (backend API + queue processors)
- Cosmos DB (Gremlin + SQL API)
- Key Vault (secrets management)
- Application Insights (telemetry)
- Service Bus (queues, future)

**Deployment Mode**: Incremental (only updates changed resources)

---

### 5. Publish Shared Package

**File**: [`.github/workflows/publish-shared.yml`](../../.github/workflows/publish-shared.yml)

**Triggers**:
- Push to `main` (when `shared/**` changes)
- Manual dispatch

**Jobs**:
1. **Version Check**:
   - Read `shared/package.json` version
   - Check if version already published to GitHub Packages
   - Skip if version exists (idempotent)

2. **Publish**:
   - Build TypeScript (`npm run build`)
   - Publish to GitHub Packages (`npm publish`)
   - Tag: `@piquet-h/shared@<version>`

**Scoped Registry**: `@piquet-h:registry=https://npm.pkg.github.com`

**Permissions**: Requires `packages: write`

**Critical**: Backend deployment fails if `shared` package version not published yet. Always merge shared changes first.

---

### 6. E2E Integration Tests

**File**: [`.github/workflows/e2e-integration.yml`](../../.github/workflows/e2e-integration.yml)

**Triggers**:
- Pull requests (if E2E-labeled or on demand)
- Manual dispatch

**Jobs**:
1. **Setup Test Environment**:
   - Provision ephemeral Cosmos DB container (or use in-memory mode)
   - Start backend Functions host locally
   - Start frontend dev server

2. **Run Tests**:
   - Execute Playwright E2E tests
   - Test user flows (bootstrap → look → move)
   - Validate API responses

3. **Teardown**:
   - Stop services
   - Clean up test data

**Artifacts**: Test reports, screenshots on failure

**Status**: Gated (see `docs/developer-workflow/e2e-ci-gating-policy.md`)

---

### 7. Verify Copilot Instructions

**File**: [`.github/workflows/verify-instructions.yml`](../../.github/workflows/verify-instructions.yml)

**Triggers**:
- Pull requests (when `.github/copilot-instructions.md` changes)
- Scheduled (weekly)

**Jobs**:
1. **Lint Markdown**:
   - Validate Markdown syntax
   - Check for broken internal links

2. **Validate Structure**:
   - Ensure required sections present
   - Check for duplicate headings
   - Verify code block closures

**Purpose**: Prevent instruction drift that could confuse Copilot agents

---

### 8. Concept Issue Generator

**File**: [`.github/workflows/concept-issue-generator.yml`](../../.github/workflows/concept-issue-generator.yml)

**Triggers**:
- Manual dispatch (with concept name input)

**Jobs**:
1. **Generate Issue**:
   - Create GitHub issue from template
   - Auto-label with `scope:world`, `docs`
   - Assign to default project

**Purpose**: Automate creation of design doc issues for new game concepts

---

### 9. Copilot Setup Steps (Experimental)

**File**: [`.github/workflows/copilot-setup-steps.yml`](../../.github/workflows/copilot-setup-steps.yml)

**Triggers**: Manual dispatch

**Jobs**: Automated environment configuration for new Copilot agent workspaces

**Status**: Experimental (may be removed)

---

## Workflow Dependencies

```
Infrastructure Deploy
       ↓
Publish Shared Package
       ↓
Backend Functions Deploy
       ↓
Frontend SWA Deploy
```

**Ordering rationale**:
1. **Infrastructure first**: Resources must exist before deployments
2. **Shared package second**: Backend depends on `@piquet-h/shared`
3. **Backend third**: Frontend may call backend APIs
4. **Frontend last**: Static assets depend on backend availability

---

## Authentication Strategy

### OIDC (Recommended)

All production workflows use **federated credentials** (no secrets):

1. Configure Azure AD app registration with GitHub federated credential:
   ```
   Subject: repo:piquet-h/the-shifting-atlas:ref:refs/heads/main
   ```

2. Grant app registration permissions:
   - `Contributor` role on resource group
   - `Website Contributor` role on Static Web App

3. Set repository secrets:
   - `AZURE_CLIENT_ID`: App registration client ID
   - `AZURE_TENANT_ID`: Azure AD tenant ID
   - `AZURE_SUBSCRIPTION_ID`: Target subscription

4. Workflows authenticate via:
   ```yaml
   - uses: azure/login@v2
     with:
       client-id: ${{ secrets.AZURE_CLIENT_ID }}
       tenant-id: ${{ secrets.AZURE_TENANT_ID }}
       subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}
   ```

**Benefits**: No secret rotation, automatic expiration, audit trail

---

## Common Patterns

### Path Filters (Selective Execution)

```yaml
on:
  pull_request:
    paths:
      - 'frontend/**'
      - 'backend/**'
```

Triggers only when specified files changed. Reduces unnecessary builds.

---

### Concurrency Control (Prevent Race Conditions)

```yaml
concurrency:
  group: deploy-prod
  cancel-in-progress: true
```

Ensures only one deployment runs at a time. Cancels stale runs.

---

### Matrix Strategy (Parallel Jobs)

```yaml
strategy:
  matrix:
    package: [frontend, backend, shared]
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: cd ${{ matrix.package }} && npm run lint
```

Runs linting for multiple packages in parallel.

---

### GitHub Packages Authentication

```yaml
env:
  NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Automatically scoped to repository. No manual token creation required.

---

## Troubleshooting

### Issue: "Package not found" (`@piquet-h/shared`)

**Cause**: Shared package version not published yet

**Fix**:
1. Merge shared changes first
2. Wait for `publish-shared.yml` workflow to complete
3. Verify version exists: `npm view @piquet-h/shared@<version>`
4. Re-run backend deployment

---

### Issue: "Azure login failed" (OIDC)

**Cause**: Federated credential misconfigured

**Fix**:
1. Verify subject filter matches branch/tag pattern
2. Check app registration permissions (Contributor role)
3. Ensure secret names match workflow references
4. Test authentication locally: `az login --service-principal`

---

### Issue: "Deployment token expired" (SWA)

**Cause**: Static Web App deployment token rotated

**Fix**:
1. Fetch new token: `az staticwebapp secrets list`
2. Update GitHub secret: `SWA_DEPLOYMENT_TOKEN`
3. Or: Use API token auto-fetched in workflow (preferred)

---

## Workflow Artifacts

| Workflow       | Artifact                     | Retention | Use Case                          |
| -------------- | ---------------------------- | --------- | --------------------------------- |
| CI             | `axe-report.json`            | 7 days    | Review accessibility violations   |
| E2E Integration | `playwright-report/`        | 14 days   | Debug test failures               |
| Infrastructure | `bicep-outputs.json`         | 30 days   | Reference deployed resource names |
| Backend Deploy | `function-app-logs.txt`      | 7 days    | Diagnose deployment errors        |

---

## Monitoring & Alerts

### Workflow Failures

**Notification**: GitHub Actions sends email on failure (configure in Settings → Notifications)

**Recommended**: Enable Slack/Teams notifications via GitHub Apps marketplace

### Deployment Status

**Check**: Azure Portal → Resource Group → Deployments
**Query**: Application Insights → Logs (KQL queries for deployment events)

---

## Related Documentation

| Topic                       | Document                                           |
| --------------------------- | -------------------------------------------------- |
| Local Development Setup     | `../developer-workflow/local-dev-setup.md`         |
| Infrastructure (Bicep)      | `../../infrastructure/README.md`                   |
| Shared Package Versioning   | `../developer-workflow/shared-versioning.md`       |
| E2E Test Gating Policy      | `../developer-workflow/e2e-ci-gating-policy.md`    |
| Architecture Overview       | `../architecture/mvp-azure-architecture.md`        |

---

## Future Enhancements

- [ ] Staging environment deployments (separate resource group)
- [ ] Automated rollback on smoke test failure
- [ ] Deployment approval gates for production
- [ ] Terraform/Bicep state management via remote backend
- [ ] Blue/green deployments for Functions
- [ ] Performance regression testing (Lighthouse CI)

Vote on priorities in GitHub Discussions or propose enhancements via issues tagged `devx`.

---

_Last updated: 2025-11-07 (initial creation for MECE documentation hierarchy)_
