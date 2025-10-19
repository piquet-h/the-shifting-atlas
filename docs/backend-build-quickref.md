## Deprecated: Backend Build Quick Reference

This document is deprecated. Build & deploy behavior should be read directly from workflow YAML under `.github/workflows/` and the scripts in `backend/scripts/`. The legacy content is retained below temporarily and will be removed after consumers confirm no reliance.

<!-- LEGACY BUILD DOC (deprecated) -->

**See full details in:** [`backend-build-walkthrough.md`](./backend-build-walkthrough.md)

---

## TL;DR - Current System is Fine! ✅

Your build system is **working correctly**. The "entry point drift" concern is actually an **intentional transformation** - not a bug.

---

## Common Commands

```bash
# Full build (from repo root)
npm run build

# Build just backend
npm run build -w backend

# Package backend for deployment
npm run package:deploy -w backend

# Local dev (hot reload)
npm run dev -w backend

# Run tests
npm test -w backend
```

---

## What Gets Deployed

**Source:** `backend/dist-deploy/` (~75MB)

**Contents:**

-   ✅ `src/` - Compiled JavaScript functions (192KB)
-   ✅ `host.json` - Azure Functions config
-   ✅ `package.json` - Production-only (no devDeps)
-   ✅ `node_modules/` - Production dependencies (~75MB)
    -   Includes vendored `@atlas/shared` package

---

## Entry Point Transformation (Why Different?)

| Location                     | Entry Point        | Why?                                                           |
| ---------------------------- | ------------------ | -------------------------------------------------------------- |
| **backend/package.json**     | `dist/src/**/*.js` | For local dev - functions at `backend/dist/src/functions/*.js` |
| **dist-deploy/package.json** | `src/**/*.js`      | For deployment - functions at `dist-deploy/src/functions/*.js` |

**This is intentional!** The packaging script correctly handles this at line 81-90.

---

## Build Pipeline Flow

```
1. Build shared     → shared/dist/
2. Build backend    → backend/dist/src/
3. Package backend  → backend/dist-deploy/
   ├─ Copy compiled JS
   ├─ Generate prod package.json
   ├─ Install prod dependencies (npm ci --omit=dev)
   └─ Vendor @atlas/shared
4. Deploy           → Azure Functions
```

---

## Key Files

| File                                             | Purpose                                 |
| ------------------------------------------------ | --------------------------------------- |
| `backend/scripts/package.mjs`                    | Packaging script (vendoring + trimming) |
| `backend/dist-deploy/`                           | Generated deployment artifact           |
| `.github/workflows/backend-functions-deploy.yml` | CI/CD workflow                          |

---

## FAQs

### Q: Why vendor @atlas/shared?

**A:** Because Azure Functions doesn't support npm workspace `file:` dependencies. We copy the built shared package into `node_modules/@atlas/shared` manually.

### Q: Why not use `npm install --production`?

**A:** We do use the modern equivalent: `npm ci --omit=dev`. This gives us:

-   ✅ Deterministic installs (from package-lock.json)
-   ✅ Production dependencies only
-   ✅ Faster than `npm install`

### Q: Why not use remote build?

**A:** Remote build (Oryx) doesn't handle workspace monorepos well. Our approach gives us more control and faster deployments.

### Q: Can I simplify this?

**A:** Yes! Consider **GitHub Packages** to publish @atlas/shared as a real npm package. See [full walkthrough](./backend-build-walkthrough.md#github-packages-as-private-registry) for details.

---

## Troubleshooting

### Functions not discovered after deploy

Check `dist-deploy/package.json` has:

```json
{
    "main": "src/**/*.js" // NO "dist/" prefix!
}
```

### @atlas/shared not found

Run packaging script again:

```bash
npm run package:deploy -w backend
```

Verify:

```bash
ls backend/dist-deploy/node_modules/@atlas/shared/dist/
```

### Build fails

Ensure dependencies installed:

```bash
npm install
npm run build -w shared
npm run build -w backend
```

---

## Next Steps

1. ✅ **Keep current system** - It's working correctly!
2. 📖 **Read full walkthrough** - If you want deep understanding
3. 🚀 **Consider GitHub Packages** - When @atlas/shared stabilizes

---

**Questions?** Read the workflow files instead. Legacy appendix ends here.

<!-- END LEGACY BUILD DOC -->
