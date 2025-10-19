## Deprecated: Backend Build System Walkthrough

This walkthrough is deprecated. Consult actual workflow YAML & scripts; prose retained only temporarily.

<!-- LEGACY BUILD DOC (deprecated) -->

**Created:** 2025-10-11  
**Purpose:** Comprehensive guide to understanding, simplifying, and potentially migrating the backend build/deployment process.

---

## Table of Contents

1. [Current System Overview](#current-system-overview)
2. [Build Process Deep Dive](#build-process-deep-dive)
3. [Concerns & Pain Points](#concerns--pain-points)
4. [Simplification Options](#simplification-options)
5. [GitHub Packages as Private Registry](#github-packages-as-private-registry)
6. [Recommended Path Forward](#recommended-path-forward)
7. [Step-by-Step Migration Guide](#step-by-step-migration-guide)

---

## Current System Overview

### Architecture

The Shifting Atlas uses an **npm workspace monorepo**:

```
the-shifting-atlas/
├── package.json              # Root workspace config
├── package-lock.json         # Shared lockfile
├── shared/                   # @piquet-h/shared package
│   ├── package.json
│   ├── src/                  # TypeScript source
│   └── dist/                 # Compiled JS (after build)
├── backend/                  # Azure Functions app
│   ├── package.json          # Depends on @piquet-h/shared via "file:../shared"
│   ├── src/                  # TypeScript source
│   ├── dist/                 # Compiled JS (after build)
│   ├── dist-deploy/          # Production deployment artifact (created by package.mjs)
│   └── scripts/
│       └── package.mjs       # Custom packaging script
└── frontend/                 # React SPA
    ├── package.json
    └── ...
```

### Key Dependencies

-   **Backend depends on Shared**: Via `"@piquet-h/shared": "file:../shared"` in `backend/package.json`
-   **Workspace Dependencies**: Managed automatically by npm workspaces
-   **TypeScript Build**: Uses project references (`tsconfig.refs.json`)

### Current Package.json Entry Points

**backend/package.json:**

```json
{
    "main": "dist/src/**/*.js"
}
```

-   This pattern works for **local development** (Azure Functions Core Tools discovers functions)
-   Points to the TypeScript build output directory structure

**backend/dist-deploy/package.json (generated):**

```json
{
    "main": "src/**/*.js"
}
```

-   The packaging script **correctly strips** the `dist/` prefix
-   This is necessary because `dist-deploy/` doesn't have a nested `dist/` folder
-   Functions are at `dist-deploy/src/functions/*.js`

---

## Build Process Deep Dive

### Phase 1: TypeScript Compilation

**Command:** `npm run build -w backend` (or `tsc -b tsconfig.refs.json`)

**What happens:**

1. Shared package compiles: `shared/src/*.ts` → `shared/dist/*.js`
2. Backend compiles: `backend/src/*.ts` → `backend/dist/src/*.js`
3. Type definitions (`.d.ts`) and source maps (`.js.map`) generated

**Output structure:**

```
backend/dist/
└── src/
    ├── index.js
    ├── functions/
    │   ├── ping.js
    │   ├── playerCreate.js
    │   └── ...
    └── ...
```

### Phase 2: Packaging for Deployment

**Command:** `npm run package:deploy -w backend`

**Script:** `backend/scripts/package.mjs`

**What it does (step-by-step):**

1. **Clean slate**: Removes `backend/dist-deploy/` if it exists
2. **Precondition check**: Verifies `backend/dist/src` exists (compiled output)
3. **Copy compiled code**: `backend/dist/src` → `backend/dist-deploy/src`
4. **Copy host.json**: Required Azure Functions configuration
5. **Generate production package.json**:
    - Starts with `backend/package.json`

-   **Removes** `@piquet-h/shared` dependency (will be vendored)
-   **Removes** `devDependencies`
-   **Strips** `dist/` prefix from `main` field
-   **Simplifies** scripts to just `start` and `diagnostics`

6. **Copy workspace package-lock.json**: For deterministic `npm ci`
7. **Install production dependencies**: `npm ci --omit=dev --no-audit --no-fund`
    - Installs into `dist-deploy/node_modules/`
    - Only production dependencies (@azure/functions, applicationinsights, zod)
8. **Vendor @piquet-h/shared AFTER npm install**:

-   Copies `shared/dist/` → `dist-deploy/node_modules/@piquet-h/shared/dist/`
-   Creates minimal `package.json` for @piquet-h/shared
-   Done **after** npm install so it's not pruned

9. **Sanity checks**:
    - Verifies `@azure/functions` was installed

-   Verifies vendored `@piquet-h/shared` exists

**Result:**

```
backend/dist-deploy/           # 75MB total
├── host.json
├── package.json               # Production-only
├── package-lock.json
├── node_modules/              # 75MB
│   ├── @azure/functions/
│   ├── @piquet-h/shared/         # VENDORED (renamed scope)
│   │   ├── package.json
│   │   └── dist/
│   ├── applicationinsights/
│   ├── zod/
│   └── ... (prod deps)
└── src/                       # 192KB
    ├── index.js
    └── functions/
```

### Phase 3: CI/CD Deployment

**Workflow:** `.github/workflows/backend-functions-deploy.yml`

**Steps:**

1. Checkout code
2. Install all workspace dependencies (`npm install`)
3. Build shared: `npm run build -w shared`
4. Build backend: `npm run build -w backend`
5. **Package backend**: `npm run package:deploy -w backend`
6. Run tests: `npm test -w backend`
7. Azure OIDC login
8. Deploy `backend/dist-deploy/` to Azure Functions

**Key setting:**

```yaml
AZURE_FUNCTIONAPP_PACKAGE_PATH: 'backend/dist-deploy'
```

---

## Concerns & Pain Points

Based on the problem statement and code analysis:

### 1. ✅ **Entry Point Drift (RESOLVED)**

**Original Concern:**

> "The entry point in the package.json in dist has drifted from the one in backend"

**Analysis:**

-   This is **intentional and correct**, not drift
-   `backend/package.json`: `"main": "dist/src/**/*.js"` (for local dev)
-   `dist-deploy/package.json`: `"main": "src/**/*.js"` (for deployment)
-   The packaging script correctly handles this transformation (line 83-85)

**Why it's needed:**

-   Local dev: Functions are at `backend/dist/src/functions/*.js`
-   Deployment: Functions are at `dist-deploy/src/functions/*.js` (no nested `dist/`)
-   Azure Functions runtime needs the correct path

**Verdict:** Working as designed ✅

### 2. 🟡 **Complexity**

**Concern:**

> "This seems an incredibly complex build system for the whole solution"

**Analysis:**
The complexity comes from several factors:

1. **Monorepo with file: dependencies** requires special handling
2. **Vendoring @piquet-h/shared** is necessary because:
    - Azure Functions deployment doesn't support workspace protocols
    - Can't use `file:../shared` in production
3. **Custom packaging script** handles:
    - Transformation of package.json
    - Deterministic dependency installation
    - Vendoring of internal packages

**Where complexity can be reduced:**

-   ✅ Already using `npm ci --omit=dev` (correct approach)
-   ✅ Already minimizing package.json for deployment
-   🟡 Could potentially use GitHub Packages to publish @piquet-h/shared
-   🟡 Could explore Azure Functions' built-in build options (Oryx)

### 3. 🟡 **Development vs Production Inconsistency**

**Areas of friction:**

-   **Different package.json**: Source vs deployment have different `main` fields
-   **Manual vendoring**: Requires custom script to copy shared package
-   **Two build steps**: `npm run build` then `npm run package:deploy`

---

## Simplification Options

### Option 1: GitHub Packages as Private Registry (RECOMMENDED)

**Concept:** Publish `@piquet-h/shared` to GitHub Packages, treat it as a real npm package.

**Pros:**

-   ✅ Eliminates vendoring logic
-   ✅ Standard npm workflow
-   ✅ No custom packaging script needed (or much simpler)
-   ✅ Versioning control for shared package
-   ✅ Can use standard `npm ci --omit=dev`
-   ✅ Same package.json structure in dev and prod

**Cons:**

-   ⚠️ Requires authentication setup (`.npmrc` config)
-   ⚠️ Need to publish @piquet-h/shared before deploying backend
-   ⚠️ Adds a publish step to CI/CD

**When this works best:**

-   Medium to large projects (you're getting there)
-   When shared package has stable-ish API
-   When team wants standard npm workflows

**Implementation complexity:** Medium (see detailed guide below)

---

### Option 2: Keep Current System (Simplify Script)

**Concept:** Keep vendoring approach but streamline the packaging script.

**Improvements:**

```javascript
// Current approach is already pretty good!
// Minor improvements:
// 1. Better error messages
// 2. Add --verbose flag for debugging
// 3. Document the entry point transformation
```

**Pros:**

-   ✅ Already working
-   ✅ No external dependencies
-   ✅ No authentication complexity

**Cons:**

-   ⚠️ Custom build logic to maintain
-   ⚠️ Different package.json in dev vs prod

**Verdict:** Current system is **already well-optimized** for this approach.

---

### Option 3: Azure Functions Remote Build (Oryx)

**Concept:** Let Azure handle the build during deployment.

**Changes:**

```yaml
# In backend-functions-deploy.yml
remote-build: true
enable-oryx-build: true
scm-do-build-during-deployment: true
```

**Pros:**

-   ✅ Simpler CI/CD (just zip and upload source)
-   ✅ Azure handles npm install

**Cons:**

-   ⚠️ Slower deployments (build happens on Azure)
-   ⚠️ Less control over build process
-   ⚠️ Still need to handle workspace dependencies somehow
-   ⚠️ May not work well with monorepo structure

**Verdict:** Not ideal for workspace monorepos.

---

### Option 4: Separate Shared Package Repository

**Concept:** Move @piquet-h/shared to its own repo, publish to npm/GitHub Packages.

**Pros:**

-   ✅ True package independence
-   ✅ Can version independently
-   ✅ Standard npm workflow

**Cons:**

-   ⚠️ Overhead of managing multiple repos
-   ⚠️ Cross-repo changes become harder
-   ⚠️ May be premature for project size

**Verdict:** Overkill for current stage.

---

## GitHub Packages as Private Registry

### Overview

GitHub Packages provides free private npm hosting for GitHub repositories.

**Key benefits:**

-   Free for private repos (with usage limits)
-   Integrated with GitHub Actions (easy authentication)
-   Standard npm workflow
-   Package versioning
-   Scoped to your organization/user

### Authentication Setup

#### For Local Development

Create `.npmrc` in repo root:

```ini
@atlas:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then set environment variable:

```bash
export GITHUB_TOKEN=ghp_your_personal_access_token
```

**PAT Requirements:**

-   Scope: `read:packages` (to install)
-   Scope: `write:packages` (to publish)

#### For GitHub Actions

GitHub automatically provides `GITHUB_TOKEN` with correct permissions:

```yaml
- name: Setup npm auth
  run: |
      echo "@atlas:registry=https://npm.pkg.github.com" >> .npmrc
      echo "//npm.pkg.github.com/:_authToken=${{ secrets.GITHUB_TOKEN }}" >> .npmrc
```

### Publishing @piquet-h/shared

#### 1. Update shared/package.json

```json
{
    "name": "@piquet-h/shared",
    "version": "0.1.0",
    "repository": {
        "type": "git",
        "url": "https://github.com/piquet-h/the-shifting-atlas.git",
        "directory": "shared"
    },
    "publishConfig": {
        "registry": "https://npm.pkg.github.com"
    }
}
```

#### 2. Add publish script

In `shared/package.json`:

```json
{
    "scripts": {
        "publish:pkg": "npm publish"
    }
}
```

#### 3. CI/CD Workflow Changes

Add a publish step **before** building backend:

```yaml
- name: Build shared
  run: npm run build -w shared

- name: Publish shared to GitHub Packages
  run: |
      cd shared
      npm publish
  env:
      NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 4. Update backend/package.json

Change from:

```json
{
    "dependencies": {
        "@piquet-h/shared": "file:../shared"
    }
}
```

To:

```json
{
    "dependencies": {
        "@piquet-h/shared": "^0.1.0"
    }
}
```

### Simplified Packaging Script

With GitHub Packages, `backend/scripts/package.mjs` becomes much simpler:

```javascript
#!/usr/bin/env node
/**
 * Simplified packaging with GitHub Packages
 */
import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..')
const deployRoot = path.join(backendRoot, 'dist-deploy')

async function exists(p) {
    try {
        await fs.access(p)
        return true
    } catch {
        return false
    }
}

async function run(cmd, args, cwd) {
    await new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false })
        child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))))
    })
}

async function main() {
    // Clean and create deploy directory
    if (await exists(deployRoot)) {
        await fs.rm(deployRoot, { recursive: true, force: true })
    }
    await fs.mkdir(deployRoot, { recursive: true })

    // Check compiled output exists
    const originalBuildOutput = path.join(backendRoot, 'dist', 'src')
    if (!(await exists(originalBuildOutput))) {
        console.error('Expected compiled backend output at dist/src.')
        process.exit(1)
    }

    // Copy compiled code
    await fs.cp(originalBuildOutput, path.join(deployRoot, 'src'), { recursive: true })

    // Copy host.json
    await fs.copyFile(path.join(backendRoot, 'host.json'), path.join(deployRoot, 'host.json'))

    // Create deployment package.json
    const backendPkg = JSON.parse(await fs.readFile(path.join(backendRoot, 'package.json'), 'utf8'))
    const deployPkg = {
        name: backendPkg.name,
        version: backendPkg.version,
        private: backendPkg.private,
        type: backendPkg.type,
        main: backendPkg.main.replace(/^dist\//, ''), // Strip dist/ prefix
        scripts: {
            start: 'func start',
            diagnostics: 'node -e "console.log(\'Diagnostics OK\')"'
        },
        engines: backendPkg.engines,
        dependencies: backendPkg.dependencies // @piquet-h/shared will come from GitHub Packages
    }
    await fs.writeFile(path.join(deployRoot, 'package.json'), JSON.stringify(deployPkg, null, 2) + '\n', 'utf8')

    // Copy workspace package-lock.json
    const workspaceRoot = path.resolve(backendRoot, '..')
    const workspaceLockFile = path.join(workspaceRoot, 'package-lock.json')
    if (await exists(workspaceLockFile)) {
        await fs.copyFile(workspaceLockFile, path.join(deployRoot, 'package-lock.json'))
    }

    // Copy .npmrc for GitHub Packages auth
    const npmrc = path.join(workspaceRoot, '.npmrc')
    if (await exists(npmrc)) {
        await fs.copyFile(npmrc, path.join(deployRoot, '.npmrc'))
    }

    // Install production dependencies (including @piquet-h/shared from GitHub Packages)
    console.log('Installing production dependencies...')
    await run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], deployRoot)

    // Verify @piquet-h/shared was installed
    const sharedPkg = path.join(deployRoot, 'node_modules', '@piquet-h', 'shared')
    if (!(await exists(sharedPkg))) {
        console.error('Packaging failed: @piquet-h/shared not installed from GitHub Packages.')
        process.exit(1)
    }

    console.log('✅ Backend package prepared at dist-deploy/')
}

main().catch((err) => {
    console.error('Packaging error:', err)
    process.exit(1)
})
```

**Key simplifications:**

-   ❌ No vendoring logic
-   ❌ No manual copying of @piquet-h/shared
-   ❌ No custom package.json manipulation for shared
-   ✅ Standard npm install handles everything
-   ✅ ~50 lines shorter

---

## Recommended Path Forward

### Short-term (Keep Current System)

**What to do now:**

1. ✅ **Document the entry point transformation**

    - Add comments to `package.mjs` explaining why `main` field changes
    - Update this walkthrough document

2. ✅ **No changes needed to packaging script**

    - Current script is well-written and handles edge cases
    - Entry point transformation is correct

3. ✅ **Add validation to CI/CD**
    - Verify `dist-deploy/package.json` has correct `main` field
    - Test function discovery in deployed environment

**Action items:**

```bash
# Nothing to change - system is working correctly!
# Just add documentation:
# - Comments in package.mjs (lines 82-85)
# - This walkthrough document
```

---

### Medium-term (Consider GitHub Packages)

**When to migrate:**

-   When @piquet-h/shared API stabilizes
-   When you want to introduce versioning for shared package
-   When team is comfortable with publish workflows

**Migration checklist:**

-   [ ] Set up `.npmrc` for GitHub Packages
-   [ ] Add `publishConfig` to `shared/package.json`
-   [ ] Create publish workflow for @piquet-h/shared
-   [ ] Test publishing @piquet-h/shared
-   [ ] Update `backend/package.json` to use version instead of `file:`
-   [ ] Update packaging script (simplified version above)
-   [ ] Update CI/CD workflow to publish before backend build
-   [ ] Test end-to-end deployment

**Estimated effort:** 2-4 hours

---

## Step-by-Step Migration Guide

### If you decide to use GitHub Packages:

#### Step 1: Prepare @piquet-h/shared

```bash
cd shared

# Add to package.json:
npm pkg set repository.type='git'
npm pkg set repository.url='https://github.com/piquet-h/the-shifting-atlas.git'
npm pkg set repository.directory='shared'
npm pkg set publishConfig.registry='https://npm.pkg.github.com'
```

#### Step 2: Create .npmrc at repo root

```bash
cd /path/to/the-shifting-atlas

cat > .npmrc << 'EOF'
@atlas:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
EOF

# Add to .gitignore if using local tokens
echo ".npmrc" >> .gitignore  # Optional: only if storing actual tokens
```

**OR** commit `.npmrc` with environment variable reference (safer):

```ini
@atlas:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

#### Step 3: Create Personal Access Token (Local Dev)

1. Go to: https://github.com/settings/tokens
2. Generate new token (classic)
3. Scopes: `read:packages`, `write:packages`
4. Copy token
5. Add to your environment:
    ```bash
    export GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
    # Add to ~/.bashrc or ~/.zshrc for persistence
    ```

#### Step 4: Test Publishing Locally

```bash
cd shared
npm run build
npm publish --dry-run  # Test first
npm publish            # Publish for real
```

Verify at: `https://github.com/piquet-h/the-shifting-atlas/packages`

#### Step 5: Update Backend Dependency

```bash
cd backend

# Change package.json dependency
npm pkg set dependencies.@piquet-h/shared='^0.1.0'

# Test installation
rm -rf node_modules
cd ..
npm install
```

#### Step 6: Update Packaging Script

Replace `backend/scripts/package.mjs` with the simplified version from above.

#### Step 7: Update CI/CD Workflow

Edit `.github/workflows/backend-functions-deploy.yml`:

```yaml
jobs:
    build-and-deploy:
        steps:
            # ... existing checkout and setup ...

            - name: Setup npm auth for GitHub Packages
              run: |
                  echo "@atlas:registry=https://npm.pkg.github.com" >> .npmrc
                  echo "//npm.pkg.github.com/:_authToken=${{ secrets.GITHUB_TOKEN }}" >> .npmrc

            - name: Build and publish shared package
              run: |
                  npm run build -w shared
                  cd shared
                  npm publish
              env:
                  NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

            - name: Build backend
              run: npm run build -w backend

            # ... rest stays the same ...
```

#### Step 8: Test Deployment

1. Push to a test branch
2. Trigger workflow manually
3. Verify:

-   @piquet-h/shared publishes successfully
-   Backend installs @piquet-h/shared from GitHub Packages
-   Deployment succeeds
-   Functions work in Azure

---

## Comparison Table

| Aspect                   | Current System            | GitHub Packages          |
| ------------------------ | ------------------------- | ------------------------ |
| **Complexity**           | Medium (custom vendoring) | Low (standard npm)       |
| **Dev/Prod Consistency** | Different package.json    | Same package.json        |
| **Authentication**       | None needed               | `.npmrc` + PAT           |
| **Versioning**           | Git-based                 | Semantic versioning      |
| **Build Steps**          | Build → Package → Deploy  | Build → Publish → Deploy |
| **Maintenance**          | Custom script to maintain | Standard npm workflow    |
| **Best For**             | Rapid iteration           | Stable packages          |

---

## Conclusion

### Current System: ✅ Working Well

Your current system is **well-designed** for a workspace monorepo:

-   Entry point transformation is correct (not a bug)
-   Vendoring approach is appropriate
-   Script handles edge cases properly
-   `npm ci --omit=dev` is the right choice

### When to Consider Migration

Move to GitHub Packages when:

1. @piquet-h/shared becomes more stable
2. You want semantic versioning
3. Team prefers standard npm workflows
4. You're comfortable adding a publish step

### Don't Over-Engineer

For current project size and stage:

-   ✅ Current system is fine
-   ✅ Already using best practices (`npm ci`, production-only deps)
-   🟡 GitHub Packages is optional, not necessary
-   ❌ Separate repos would be premature

---

## Quick Reference Commands

### Current System

```bash
# Build everything
npm run build

# Package backend for deployment
npm run package:deploy -w backend

# Deploy (CI/CD handles this)
```

### With GitHub Packages

```bash
# Build shared
npm run build -w shared

# Publish shared
cd shared && npm publish

# Build backend (will fetch @piquet-h/shared from registry)
npm run build -w backend

# Package backend (simplified script)
npm run package:deploy -w backend
```

---

## Getting Help

-   **Current script:** `backend/scripts/package.mjs`
-   **CI/CD workflow:** `.github/workflows/backend-functions-deploy.yml`
-   **GitHub Packages docs:** https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry
-   **Azure Functions deployment:** `docs/ci-cd.md`

---

**Next Step:** Review this document and decide whether to:

-   A) Keep current system (document and move on)
-   B) Migrate to GitHub Packages (follow Step-by-Step guide)

Both were formerly valid choices. Current guidance: inspect workflows; do not rely on this legacy narrative. 🚀

<!-- END LEGACY BUILD DOC -->
