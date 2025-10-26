# (Archived) GitHub Packages Migration

**Status**: COMPLETED as of 2025-10-26  
**Original Document**: github-packages-migration-checklist.md

## Summary

The migration to GitHub Packages for `@piquet-h/shared` has been successfully completed. The shared package is now:

1. Published to npm.pkg.github.com
2. Referenced via semver ranges in backend and frontend
3. Properly authenticated via .npmrc with NODE_AUTH_TOKEN

## Current Implementation

See these files for current state:
- `.npmrc` - Registry configuration
- `shared/package.json` - Published package config
- `backend/package.json` - Uses `^0.3.17`
- `frontend/package.json` - Uses `^0.3.10`
- `.github/copilot-instructions.md` Section 12.1 - Package dependency rules

## Key Points for Future Reference

✅ **ALWAYS** use registry references: `"@piquet-h/shared": "^0.3.x"`  
❌ **NEVER** use file references: `"@piquet-h/shared": "file:../shared"`

File-based references break in CI/CD and are explicitly forbidden.

---

*Original checklist preserved in git history if needed for reference.*
