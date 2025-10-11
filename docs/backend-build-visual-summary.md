# Backend Build System - Visual Summary

## Current Build Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     STEP 1: TypeScript Build                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
    ┌──────────────────────────────────────────────────────┐
    │  shared/src/*.ts  →  shared/dist/*.js               │
    │  backend/src/*.ts  →  backend/dist/src/*.js         │
    └──────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              STEP 2: Package for Deployment                      │
│              (backend/scripts/package.mjs)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
    ┌──────────────────────────────────────────────────────┐
    │  1. Create clean dist-deploy/ directory             │
    │  2. Copy backend/dist/src → dist-deploy/src         │
    │  3. Copy host.json                                   │
    │  4. Generate production package.json                 │
    │     - Remove devDependencies                         │
    │     - Strip "dist/" from main field                  │
    │     - Remove @atlas/shared dependency                │
    │  5. Copy package-lock.json                           │
    │  6. npm ci --omit=dev                                │
    │  7. Vendor @atlas/shared manually                    │
    │     shared/dist → dist-deploy/node_modules/@atlas/  │
    └──────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                STEP 3: Deploy to Azure Functions                 │
└─────────────────────────────────────────────────────────────────┘
```

## Entry Point Transformation (Why Different?)

### Local Development Context

```
backend/
├── package.json
│   └── "main": "dist/src/**/*.js"  ← Points to compiled output
├── dist/
│   └── src/                         ← Build output directory
│       └── functions/
│           ├── ping.js              ← Functions here
│           ├── playerCreate.js
│           └── ...
```

Azure Functions Core Tools discovers functions at: **backend/dist/src/functions/\*.js** ✅

---

### Deployment Context

```
backend/dist-deploy/
├── package.json
│   └── "main": "src/**/*.js"       ← NO "dist/" prefix
├── src/                             ← Flatter structure
│   └── functions/
│       ├── ping.js                  ← Functions here
│       ├── playerCreate.js
│       └── ...
└── node_modules/
```

Azure Functions runtime discovers functions at: **dist-deploy/src/functions/\*.js** ✅

---

### The Transformation

```javascript
// In package.mjs (lines 81-90):

// Development package.json:
"main": "dist/src/**/*.js"

// Strip "dist/" prefix:
deployPkg.main = backendPkg.main.substring(5)

// Deployment package.json:
"main": "src/**/*.js"
```

**This is intentional!** Different directory structures require different paths.

## Deployment Artifact Breakdown

```
backend/dist-deploy/  (Total: ~75MB)
│
├── host.json                         (150 bytes)
│   └── Azure Functions configuration
│
├── package.json                      (418 bytes)
│   ├── Production dependencies only
│   ├── NO @atlas/shared reference (vendored)
│   └── "main": "src/**/*.js"
│
├── package-lock.json                 (393 KB)
│   └── Deterministic dependency versions
│
├── node_modules/                     (~75 MB)
│   ├── @azure/functions/
│   ├── applicationinsights/
│   ├── zod/
│   ├── @atlas/shared/               ← VENDORED
│   │   ├── package.json
│   │   └── dist/
│   └── ... (all prod dependencies)
│
└── src/                              (192 KB)
    ├── index.js
    ├── functions/
    │   ├── ping.js
    │   ├── playerCreate.js
    │   ├── playerGet.js
    │   ├── playerMove.js
    │   ├── location.js
    │   ├── locationLook.js
    │   └── ...
    └── ...
```

## Why Vendor @atlas/shared?

### Problem

```
backend/package.json:
{
  "dependencies": {
    "@atlas/shared": "file:../shared"  ← Workspace protocol
  }
}
```

Azure Functions deployment:
- ❌ Doesn't have `../shared` directory
- ❌ Can't resolve `file:` dependencies
- ❌ Workspace structure doesn't exist in cloud

### Solution

```
After npm ci --omit=dev:
dist-deploy/node_modules/
├── @azure/functions/
├── applicationinsights/
└── zod/
    └── (No @atlas/shared yet!)

Manual vendoring step:
1. Copy shared/dist → dist-deploy/node_modules/@atlas/shared/dist/
2. Create minimal package.json
3. Verify it exists

Result:
dist-deploy/node_modules/
├── @azure/functions/
├── applicationinsights/
├── zod/
└── @atlas/
    └── shared/           ← Now available!
        ├── package.json
        └── dist/
```

## Simplification Option: GitHub Packages

### Current System (Vendoring)

```
┌──────────────┐
│ Build Shared │
└──────┬───────┘
       ↓
┌──────────────┐     ┌─────────────────────────┐
│Build Backend │     │  Packaging Script       │
└──────┬───────┘ →   │  - Install deps         │
       ↓              │  - VENDOR @atlas/shared │ ← Custom step
┌──────────────┐     │  - Transform files      │
│   Package    │     └─────────────────────────┘
└──────┬───────┘
       ↓
┌──────────────┐
│    Deploy    │
└──────────────┘
```

### GitHub Packages System (Simplified)

```
┌──────────────┐     ┌──────────────────────┐
│ Build Shared │ →   │ Publish to GitHub    │
└──────────────┘     │ Packages Registry    │
                     └──────────────────────┘
                              ↓
┌──────────────┐     ┌──────────────────────┐
│Build Backend │ →   │  Packaging Script    │
└──────────────┘     │  - Install deps      │
                     │    (includes shared  │ ← Standard npm
                     │     from registry)   │
                     │  - Transform files   │
                     └──────────────────────┘
                              ↓
                     ┌──────────────────────┐
                     │       Deploy         │
                     └──────────────────────┘
```

Benefits:
- ✅ ~50 lines shorter script
- ✅ No manual vendoring
- ✅ Standard npm workflow
- ✅ Semantic versioning

Cost:
- ⚠️ Publish step required
- ⚠️ Authentication setup

## CI/CD Workflow

### Current Workflow

```yaml
jobs:
  build-and-deploy:
    steps:
      - Checkout code
      - Setup Node.js
      - Install workspace dependencies
      
      - Build shared (tsc)
      - Build backend (tsc)
      - Package backend (custom script)
        └─→ Vendors @atlas/shared
      
      - Run tests
      - Azure login
      - Deploy dist-deploy/ to Azure Functions
```

### With GitHub Packages (Future)

```yaml
jobs:
  build-and-deploy:
    steps:
      - Checkout code
      - Setup Node.js
      - Install workspace dependencies
      - Setup npm auth for GitHub Packages
      
      - Build shared (tsc)
      - Publish @atlas/shared to GitHub Packages  ← NEW
      
      - Build backend (tsc)
      - Package backend (simplified script)
        └─→ npm install gets @atlas/shared from registry
      
      - Run tests
      - Azure login
      - Deploy dist-deploy/ to Azure Functions
```

## Decision Matrix

| Aspect | Current (Vendoring) | GitHub Packages |
|--------|---------------------|-----------------|
| **Complexity** | Medium | Low |
| **Lines of code** | ~140 | ~90 |
| **Dev/Prod consistency** | Different package.json | Same package.json |
| **Authentication** | None needed | .npmrc + token |
| **Versioning** | Git-based | Semantic versioning |
| **Build steps** | Build → Package → Deploy | Build → Publish → Deploy |
| **Maintenance** | Custom script | Standard npm |
| **Best for** | Rapid iteration | Stable packages |
| **Migration time** | N/A (current) | 2-4 hours |

## Quick Commands Reference

### Current System

```bash
# Full build
npm run build

# Build backend only
npm run build -w backend

# Package for deployment
npm run package:deploy -w backend

# Verify deployment artifact
ls -la backend/dist-deploy/
cat backend/dist-deploy/package.json

# Check vendored shared
ls backend/dist-deploy/node_modules/@atlas/shared/

# Local dev
npm run dev -w backend

# Run tests
npm test -w backend
```

### Troubleshooting

```bash
# Clean everything
rm -rf backend/dist backend/dist-deploy
npm run build -w backend
npm run package:deploy -w backend

# Check entry points
grep '"main"' backend/package.json
grep '"main"' backend/dist-deploy/package.json

# Verify @atlas/shared
ls -la backend/dist-deploy/node_modules/@atlas/shared/dist/
```

## File Locations

| File | Purpose |
|------|---------|
| `backend/scripts/package.mjs` | Current packaging script |
| `backend/scripts/package-github-packages.mjs` | Reference implementation (future) |
| `backend/dist-deploy/` | Generated deployment artifact |
| `docs/backend-build-quickref.md` | Quick reference guide |
| `docs/backend-build-walkthrough.md` | Comprehensive guide |
| `docs/github-packages-migration-checklist.md` | Migration guide |
| `WAKE-UP-SUMMARY.md` | Executive summary |

## The Bottom Line

✅ **Current system is working correctly**
- Entry point "drift" is intentional
- Already using best practices
- Well-suited for workspace monorepos

🟡 **GitHub Packages is optional**
- Would simplify the packaging script
- Not urgent - consider when @atlas/shared stabilizes
- Complete migration guide available

🚀 **Recommendation**
- Keep current system for now
- Focus on building features
- Revisit GitHub Packages later when beneficial

---

**Read more:**
- Quick start: `docs/backend-build-quickref.md`
- Deep dive: `docs/backend-build-walkthrough.md`
- Migration: `docs/github-packages-migration-checklist.md`
