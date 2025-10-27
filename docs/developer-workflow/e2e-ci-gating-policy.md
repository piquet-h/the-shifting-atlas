# E2E Test CI Gating Policy

## Overview

E2E integration tests run against real Cosmos DB (Gremlin + SQL API) to validate production-readiness. This document defines when and how these tests run in CI to balance comprehensive validation with cost and time efficiency.

## CI Gating Levels

### Level 1: Pull Request (PR) - Fast Feedback

**Tests Run:**
- ✓ Unit tests (all packages)
- ✓ Integration tests (in-memory mode)
- ✓ Lint & typecheck
- ✓ Build verification
- ✓ Accessibility scans (when frontend changes)

**E2E Tests:** ❌ NOT RUN (skipped for cost/time optimization)

**Rationale:**
- Fast feedback loop (<5 minutes typical)
- No Cosmos DB costs during development
- Catches most issues without full E2E validation
- Allows rapid iteration on PRs

**Workflow:** `.github/workflows/ci.yml`

### Level 2: Merge to Main - Post-Merge Validation

**Tests Run:**
- ✓ All Level 1 tests
- ✓ **E2E integration tests (Cosmos DB)**

**Rationale:**
- Validates Cosmos interactions before deployment
- Catches integration issues that unit tests miss
- Acceptable cost for main branch validation
- Runs only after PR approval (reduced frequency)

**Workflow:** `.github/workflows/e2e-integration.yml`

**Performance Targets:**
- Full E2E suite: <90s (p95)
- Single move operation: <500ms (p95)
- LOOK query: <200ms (p95)

### Level 3: Nightly - Extended Scenarios

**Tests Run:**
- ✓ All Level 1 & 2 tests
- ✓ Extended E2E scenarios (future)
- ✓ Performance benchmarking
- ✓ Load testing (future)

**Schedule:** 2 AM UTC daily

**Rationale:**
- Cost-optimized timing (lower usage hours)
- Comprehensive validation without blocking PRs
- Performance trend monitoring
- Catch environment-specific issues

**Workflow:** `.github/workflows/e2e-integration.yml` (scheduled trigger)

## Cost Analysis

### Per-PR Testing (Level 1 Only)
- Cosmos DB RUs: 0
- CI minutes: ~3-5 minutes
- Cost: Minimal (GitHub Actions free tier)

### Post-Merge E2E (Level 2)
- Cosmos DB RUs: ~100-500 RUs per run (estimated)
- CI minutes: ~2-3 minutes (90s test + setup)
- Frequency: ~10-20 merges/week (estimated)
- Monthly cost: Minimal (test database provisioning)

### Nightly Extended (Level 3)
- Cosmos DB RUs: ~500-1000 RUs per run (estimated)
- CI minutes: ~5-10 minutes
- Frequency: 30 runs/month
- Monthly cost: Low (off-peak hours)

## Environment Configuration

### Test Database Isolation

**Recommended Setup:**
```bash
# Separate test Cosmos DB or database
COSMOS_DATABASE_TEST=game-test
COSMOS_SQL_DATABASE_TEST=game-docs-test
```

**Benefits:**
- Test data isolation from production
- Easy cleanup between runs
- Independent RU provisioning
- Reduced risk of production impact

### GitHub Secrets Configuration

Required secrets for E2E tests:
```yaml
# Test-specific Cosmos configuration (recommended)
COSMOS_GREMLIN_ENDPOINT_TEST      # https://your-test-cosmos.documents.azure.com:443/
COSMOS_GREMLIN_DATABASE_TEST      # game (or game-test if using separate test DB)
COSMOS_GREMLIN_GRAPH_TEST         # world
COSMOS_SQL_ENDPOINT_TEST          # https://your-test-cosmos-sql.documents.azure.com:443/
COSMOS_SQL_DATABASE_TEST          # game-docs (or game-docs-test if using separate test DB)

# Or fallback to production endpoints (use with caution in CI)
COSMOS_GREMLIN_ENDPOINT
COSMOS_GREMLIN_DATABASE
COSMOS_GREMLIN_GRAPH
COSMOS_SQL_ENDPOINT
COSMOS_SQL_DATABASE

# Azure authentication for Cosmos
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
AZURE_TENANT_ID
```

**Note:** The workflow uses `*_TEST` secrets first, then falls back to production secrets if test-specific ones aren't configured.

## Test Data Cleanup

### Current Strategy
- E2E tests use entity IDs prefixed with `e2e-`
- Test data is logged to console for monitoring
- Manual cleanup or separate test database wipe

### Future Enhancements
- Automated cleanup when repository delete methods available
- Database wipe script for nightly runs
- Retention policy for test data

## Bypassing E2E Tests

### Manual Workflow Dispatch
E2E tests can be triggered manually via GitHub Actions UI:
1. Navigate to Actions → E2E Integration Tests
2. Click "Run workflow"
3. Select branch
4. Click "Run workflow"

### Skip E2E on Specific Merges
E2E tests automatically skip if:
- `PERSISTENCE_MODE != cosmos`
- Cosmos endpoints not configured
- No backend/shared code changes (path filter)

## Performance Monitoring

### Metrics Tracked
- Full suite duration
- Individual operation latencies (p50, p95, p99)
- Cosmos throttling events (429 responses)
- Test data volume

### Alerting Thresholds
- ⚠️ Warning: Suite >60s (p95)
- 🚨 Critical: Suite >90s (p95)
- ⚠️ Warning: Move >400ms (p95)
- 🚨 Critical: Move >500ms (p95)
- ⚠️ Warning: LOOK >150ms (p95)
- 🚨 Critical: LOOK >200ms (p95)

## Troubleshooting

### E2E Tests Skipped
**Symptom:** Workflow shows "⊘ Skipping E2E tests"

**Causes:**
- Missing `PERSISTENCE_MODE=cosmos` environment variable
- Cosmos endpoint secrets not configured
- Azure authentication credentials missing

**Resolution:**
1. Verify GitHub secrets configuration
2. Check workflow environment variables
3. Review E2E test logs for specific error

### E2E Tests Timeout
**Symptom:** Workflow exceeds 15-minute timeout

**Causes:**
- Cosmos DB performance degradation
- Network latency issues
- Test data cleanup hanging

**Resolution:**
1. Check Cosmos DB metrics (RU/s utilization)
2. Review Application Insights for throttling
3. Verify test database is accessible
4. Increase timeout if needed (update workflow)

### Performance Targets Exceeded
**Symptom:** Tests pass but p95 latencies exceed targets

**Causes:**
- Cosmos DB under-provisioned (RU/s)
- Network latency (region mismatch)
- Test environment load

**Resolution:**
1. Review Cosmos DB provisioning
2. Check Application Insights metrics
3. Verify test environment region
4. Consider adjusting targets if consistent

## Related Documentation

- **E2E Test README:** `backend/test/e2e/README.md`
- **Local Dev Setup:** `docs/developer-workflow/local-dev-setup.md`
- **CI Workflow:** `.github/workflows/e2e-integration.yml`
- **Issue #170:** E2E Integration Test Suite (Cosmos Gremlin + SQL)
- **ADR-002:** Graph Partition Strategy

## Changelog

- 2025-10-27: Initial policy definition
- Future: Add load testing scenarios
- Future: Implement automated cleanup
