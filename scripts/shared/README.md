# Shared Automation Scripts (Deprecated Components)

Most automation related to implementation ordering, provisional scheduling, variance calculation, and DI suitability has been deprecated and the underlying scripts stubbed. This README now serves only as a historical pointer; active gameplay / platform code no longer depends on these modules.

## Retired Legacy Modules

All legacy build / planning automation modules have been fully retired and their prior source files remain only as minimal stubs (or have been removed) to avoid accidental resurrection:

- `duration-estimation.mjs` (duration sampling / estimation)
- `provisional-comment.mjs` (automated provisional schedule comments)
- `provisional-storage.mjs` (GitHub Project field upserts for provisional data)
- `build-telemetry.mjs` (scheduler & variance event emission)

These mechanisms supported predictive / provisional scheduling, ordering, and variance tracking. The project now relies solely on manual, lightweight milestone + scope based prioritization. No automated ordering, provisional dates, or variance metrics are produced.

If historical context is required, consult repository history (git blame / earlier commits) rather than reintroducing the patterns. Re‑implementation attempts should undergo a fresh design review and MUST avoid coupling build automation telemetry with game domain events.

## Architecture Principles (Updated)

### Telemetry Separation

**Critical Rule:** Build automation and game domain telemetry are strictly separated.

- **Build telemetry (minimal):** `scripts/shared/build-telemetry.mjs`
    - Purpose: Occasional CI/automation signals (currently no active scheduling/ordering events)
    - Prefix convention reserved: `build.` (avoid introducing high‑cardinality events without review)
    - Destination: GitHub Actions logs + artifacts only
    - Never emits legacy scheduling / provisional / variance events (permanent removal)

- **Game telemetry:** `shared/src/telemetry.ts`
    - Purpose: Game domain events (player, world, navigation)
    - Destination: Application Insights
    - Location: `shared/` folder (exclusively for game code)

**Rationale:** Maintains strict separation of infrastructure vs. game domain concerns; Application Insights remains exclusive to game events.

### Module Design

- **ES Modules:** All scripts use `import`/`export` (`.mjs` extension)
- **Single Responsibility:** Each module focuses on one concern
- **Composable:** Modules can be combined in scripts and workflows
- **Testable:** Functions are pure where possible, side effects isolated
- **Graceful Degradation:** Features degrade gracefully if optional dependencies unavailable

### Environment Variables

All modules respect these environment variables:

- `GITHUB_TOKEN` / `GH_TOKEN` - GitHub API authentication (required)
- `PROJECT_OWNER` - Project owner (default: 'piquet-h')
- `PROJECT_NUMBER` - Project number (default: 3)
- `TELEMETRY_ARTIFACT` - Path to write build telemetry artifact (optional)

Build telemetry uses GitHub-native features (logs + artifacts). Application Insights is reserved exclusively for game telemetry.

## Testing

Modules are designed for testability:

1. **Dry-run mode:** Scripts default to dry-run, showing what would happen
2. **Apply flag:** Use `--apply` to execute changes
3. **Artifact export:** Use `--artifact` to save decision data
4. **Console fallback:** Telemetry falls back to console if AppInsights unavailable

Historical usage examples removed; associated automation is deprecated and should not be reinstated without a new ADR.

## Related Documentation

Legacy Stage 2 scheduling documentation references retained in version control history but no longer active.

---

_Last updated: 2025-10-08 – legacy automation removed (predictive scheduling / ordering / variance)_
