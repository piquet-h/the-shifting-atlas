# GitHub Packages Migration Checklist

**Status:** 🟡 Optional migration - Current system works fine  
**Estimated Time:** 2-4 hours  
**Difficulty:** Medium

---

## Prerequisites

Before starting, ensure:

-   [ ] @piquet-h/shared API is relatively stable (renamed from @atlas/shared; original org scope not yet available)
-   [ ] You have admin access to the GitHub repository
-   [ ] You understand npm package publishing workflows
<!-- Removed prerequisite referencing deprecated build walkthrough doc. -->

---

## Phase 1: Preparation (Local)

### 1.1 Update shared/package.json

-   [ ] Add repository information:

    ```bash
    cd shared
    npm pkg set repository.type='git'
    npm pkg set repository.url='https://github.com/piquet-h/the-shifting-atlas.git'
    npm pkg set repository.directory='shared'
    ```

-   [ ] Add publishConfig:

    ```bash
    npm pkg set publishConfig.registry='https://npm.pkg.github.com'
    ```

-   [ ] Verify changes:
    ```bash
    cat package.json | grep -A 5 repository
    cat package.json | grep -A 2 publishConfig
    ```

### 1.2 Create .npmrc at repository root

-   [ ] Create file:

    ```bash
    cd /path/to/the-shifting-atlas
    cat > .npmrc << 'EOF'
    @atlas:registry=https://npm.pkg.github.com
    //npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
    EOF
    ```

-   [ ] Decide: Commit .npmrc or add to .gitignore?

    -   ✅ **Commit** if using `${GITHUB_TOKEN}` placeholder (recommended)
    -   ⚠️ **Ignore** if storing actual tokens (less secure)

-   [ ] If committing:

    ```bash
    git add .npmrc
    ```

-   [ ] If ignoring:
    ```bash
    echo ".npmrc" >> .gitignore
    # You'll need to recreate locally and in CI
    ```

### 1.3 Create Personal Access Token

-   [ ] Go to: https://github.com/settings/tokens
-   [ ] Click "Generate new token (classic)"
-   [ ] Token settings:
    -   [ ] Name: "The Shifting Atlas - Package Management"
    -   [ ] Expiration: 90 days (or longer)
    -   [ ] Scopes:
        -   [x] `read:packages`
        -   [x] `write:packages`
        -   [x] `repo` (if private repository)
-   [ ] Generate and copy token
-   [ ] Save securely (you won't see it again!)

### 1.4 Configure Local Environment

-   [ ] Set environment variable (temporary):

    ```bash
    export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ```

-   [ ] Make permanent (add to shell profile):

    ```bash
    echo 'export GITHUB_TOKEN=ghp_xxxxx' >> ~/.bashrc
    # or ~/.zshrc if using zsh
    source ~/.bashrc
    ```

-   [ ] Verify:
    ```bash
    echo $GITHUB_TOKEN
    # Should show your token
    ```

---

## Phase 2: First Publish (Local Test)

### 2.1 Build shared package

-   [ ] Clean build:

    ```bash
    cd shared
    npm run clean
    npm run build
    ```

-   [ ] Verify build output:
    ```bash
    ls -la dist/
    # Should see compiled JS files
    ```

### 2.2 Test publish (dry-run)

-   [ ] Dry run:

    ```bash
    npm publish --dry-run
    ```

-   [ ] Review output:
    -   [ ] No errors
    -   [ ] Files list looks correct
    -   [ ] Registry shows GitHub Packages URL

### 2.3 Publish for real

-   [ ] Publish:

    ```bash
    npm publish
    ```

-   [ ] Verify on GitHub:
    -   [ ] Go to: https://github.com/piquet-h/the-shifting-atlas/packages
    -   [ ] See `@piquet-h/shared` package listed (renamed from @atlas/shared)
    -   [ ] Version matches (should be 0.1.0)

### 2.4 Test installation

-   [ ] Create test directory:

    ```bash
    mkdir -p /tmp/test-atlas-shared
    cd /tmp/test-atlas-shared
    npm init -y
    ```

-   [ ] Copy .npmrc:

    ```bash
    cp /path/to/the-shifting-atlas/.npmrc .
    ```

-   [ ] Install from GitHub Packages:

    ```bash
    npm install @piquet-h/shared@0.1.0
    ```

-   [ ] Verify:

    ```bash
    ls -la node_modules/@piquet-h/shared/
    # Should see dist/ folder and package.json
    ```

-   [ ] Clean up:
    ```bash
    cd /tmp
    rm -rf test-atlas-shared
    ```

---

## Phase 3: Update Backend

### 3.1 Update backend/package.json

-   [ ] Change dependency from file: to version:

    ```bash
    cd backend
    npm pkg set dependencies.@piquet-h/shared='^0.1.0'
    ```

-   [ ] Verify:
    ```bash
    cat package.json | grep @piquet-h/shared
    # Should show: "@piquet-h/shared": "^0.1.0"
    ```

### 3.2 Test backend installation

-   [ ] Clean and reinstall:

    ```bash
    cd /path/to/the-shifting-atlas
    rm -rf node_modules backend/node_modules shared/node_modules
    npm install
    ```

-   [ ] Verify @piquet-h/shared came from GitHub Packages:

    ```bash
    ls -la backend/node_modules/@piquet-h/shared/
    # Should NOT be a symlink
    # Should be real package from registry
    ```

-   [ ] Test build:

    ```bash
    npm run build -w backend
    ```

-   [ ] Test run:
    ```bash
    npm run dev -w backend
    # Press Ctrl+C after Functions start successfully
    ```

---

## Phase 4: Update Packaging Script

### 4.1 Backup current script

-   [ ] Backup:
    ```bash
    cd backend/scripts
    cp package.mjs package.mjs.backup
    ```

### 4.2 Replace with simplified version

-   [ ] Copy reference implementation:

    ```bash
    cp package-github-packages.mjs package.mjs
    ```

-   [ ] Or manually update:
    -   [ ] Remove vendoring section (lines ~109-120)
    -   [ ] Remove `@piquet-h/shared` deletion from dependencies
    -   [ ] Add .npmrc copy step
    -   [ ] Update verification to check npm install worked

### 4.3 Test new packaging script

-   [ ] Clean previous deployment:

    ```bash
    rm -rf backend/dist-deploy
    ```

-   [ ] Run packaging:

    ```bash
    cd /path/to/the-shifting-atlas
    npm run package:deploy -w backend
    ```

-   [ ] Verify output:

    -   [ ] No errors
    -   [ ] `dist-deploy/node_modules/@piquet-h/shared` exists
    -   [ ] @piquet-h/shared is NOT a vendored copy (should have full package metadata)

-   [ ] Check size:
    ```bash
    du -sh backend/dist-deploy
    # Should be similar to before (~75MB)
    ```

---

<!-- Phase 5 (CI/CD workflow update) removed – workflows should be read/edited directly in .github/workflows. -->

### 5.1 Update workflow file

**Note:** npm authentication for GitHub Packages is now automatically configured in all workflow files using the same pattern as `publish-shared.yml`:

1. **`NODE_AUTH_TOKEN` environment variable** set to `${{ secrets.GITHUB_TOKEN }}` at the job level
2. **`setup-node` action** configured with:
    ```yaml
    registry-url: 'https://npm.pkg.github.com'
    scope: '@piquet-h'
    always-auth: true
    ```

This configuration is applied to all jobs that install npm packages in:

-   `.github/workflows/ci.yml` (lint-typecheck, tests, accessibility jobs)
-   `.github/workflows/backend-functions-deploy.yml` (build-and-deploy job)
-   `.github/workflows/frontend-swa-deploy.yml` (build-and-deploy-prod job)
-   `.github/workflows/publish-shared.yml` (version-and-publish job)

The `setup-node` action with these settings automatically creates the proper `.npmrc` configuration using the `NODE_AUTH_TOKEN` environment variable.

-   [ ] If you need to add a publish step (after build shared, before build backend):

    ```yaml
    - name: Publish shared to GitHub Packages
      run: |
          cd shared
          npm publish
      env:
          NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    ```

-   [ ] Verify step order:
    1. Checkout
    2. Setup Node
    3. Install dependencies
    4. **Setup npm auth** (NEW)
    5. Build shared
    6. **Publish shared** (NEW)
    7. Build backend
    8. Package backend
    9. Test backend
    10. Deploy

### 5.2 Verify GitHub Actions permissions

**Note:** Workflow permissions have been automatically configured in all workflow files. Each workflow now includes `packages: read` (or `packages: write` for publish workflows) in its permissions block.

-   [ ] For publishing packages, verify: Repository Settings → Actions → General
-   [ ] Scroll to "Workflow permissions"
-   [ ] Ensure "Read and write permissions" is selected (needed for `secrets.GITHUB_TOKEN` to publish packages)
-   [ ] Save if changed

For read-only access (installing packages), the `packages: read` permission in the workflow file is sufficient.

---

<!-- Phase 6 (CI/CD testing instructions) removed – rely on standard PR + workflow runs. -->

### 6.1 Create test branch

-   [ ] Create branch:

    ```bash
    git checkout -b test/github-packages-migration
    ```

-   [ ] Commit all changes:

    ```bash
    git add .
    git commit -m "feat: migrate to GitHub Packages for @piquet-h/shared (rename from @atlas/shared)"
    ```

-   [ ] Push:
    ```bash
    git push -u origin test/github-packages-migration
    ```

### 6.2 Trigger workflow manually

-   [ ] Go to: Actions → Backend Functions Deploy
-   [ ] Click "Run workflow"
-   [ ] Select: `test/github-packages-migration` branch
-   [ ] Click "Run workflow"

### 6.3 Monitor workflow

-   [ ] Watch workflow execution
-   [ ] Check each step passes:
    -   [ ] Setup npm auth
    -   [ ] Build shared
    -   [ ] Publish shared
    -   [ ] Build backend
    -   [ ] Package backend
    -   [ ] Tests pass
    -   [ ] Deploy succeeds

### 6.4 Verify deployment

-   [ ] Check Azure Functions portal
-   [ ] Test health endpoint:
    ```bash
    curl https://func-atlas-xxxxx.azurewebsites.net/api/backend/health
    ```
-   [ ] Test a function:
    ```bash
    curl https://func-atlas-xxxxx.azurewebsites.net/api/ping
    ```

---

## Phase 7: Cleanup

### 7.1 Remove backup files

-   [ ] Remove backup script:

    ```bash
    rm backend/scripts/package.mjs.backup
    ```

-   [ ] Remove reference script (if copied):
    ```bash
    rm backend/scripts/package-github-packages.mjs
    ```

### 7.2 Documentation

Workflow & build documentation lives in workflow YAML and code. No separate build walkthrough/quickref to update. If package auth changes, update comments in the workflow that performs the publish.

### 7.3 Merge to main

-   [ ] Create PR from test branch
-   [ ] Review changes one more time
-   [ ] Merge to main
-   [ ] Verify production deployment

---

## Rollback Plan

If something goes wrong:

### Quick Rollback

1. [ ] Revert workflow changes:

    ```bash
    git revert <commit-hash>
    git push
    ```

2. [ ] Restore backend dependency:

    ```bash
    cd backend
    npm pkg set dependencies.@piquet-h/shared='file:../shared'
    ```

3. [ ] Restore packaging script:

    ```bash
    cp package.mjs.backup package.mjs
    ```

4. [ ] Reinstall:
    ```bash
    cd /path/to/the-shifting-atlas
    rm -rf node_modules
    npm install
    ```

### Full Rollback

-   [ ] Delete published packages:

    -   Go to: https://github.com/piquet-h/the-shifting-atlas/packages
    -   Click @piquet-h/shared → Package settings → Delete package

-   [ ] Revert all commits:
    ```bash
    git revert <range>
    ```

---

## Post-Migration

### Versioning Strategy

-   [ ] Decide on versioning approach:

    -   **Option A:** Manual versions (bump when stable)
    -   **Option B:** Automated versions (CI increments)
    -   **Option C:** Git hash versions (development)

-   [ ] Document in CONTRIBUTING.md

### Publishing Workflow

-   [ ] Document when to publish new versions
-   [ ] Create version bump script if needed
-   [ ] Add to release checklist

### Monitoring

-   [ ] Set up alerts for failed publishes
-   [ ] Monitor package download metrics
-   [ ] Track deployment sizes

---

## Troubleshooting

### "npm ERR! 404 Not Found - GET https://npm.pkg.github.com/@atlas%2fshared"

**Solution:**

-   Verify @piquet-h/shared is published
-   Check .npmrc authentication
-   Verify GITHUB_TOKEN has read:packages scope

### "npm ERR! 403 Forbidden"

**Solution:**

-   GITHUB_TOKEN lacks write:packages scope
-   Check GitHub Actions permissions
-   Verify token hasn't expired

### "Error: Cannot find module '@piquet-h/shared'"

**Solution:**

-   @piquet-h/shared not installed
-   Check package.json has correct version
-   Run `npm install` again

### Build works locally but fails in CI

**Solution:**

-   .npmrc not set up in CI
-   Add setup npm auth step to workflow
-   Verify secrets.GITHUB_TOKEN is available

---

## Success Criteria

Migration is successful when:

-   [x] @piquet-h/shared publishes to GitHub Packages
-   [x] Backend installs @piquet-h/shared from registry (not vendored)
-   [x] Packaging script simplified (no vendoring logic)
-   [x] CI/CD publishes then deploys successfully
-   [x] Azure Functions work in production
-   [x] No increase in deployment size
-   [x] No decrease in deployment speed

---

## Questions Before Starting?

Review these resources:

1. GitHub Packages docs: https://docs.github.com/en/packages
2. npm scopes: https://docs.npmjs.com/cli/v9/using-npm/scope

---

**Ready to start?** Begin with Phase 1: Preparation! 🚀
