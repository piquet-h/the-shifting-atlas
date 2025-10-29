# E2E Move Operation Debugging Guide

**Date:** 2025-10-29  
**Issue:** E2E Cosmos DB tests failing with move operations returning `{status: 'error'}` instead of `{status: 'ok'}`  
**PR:** [Fix E2E Cosmos DB move operation failures](#)

## Problem Statement

Several E2E Cosmos DB tests were failing due to move operations returning `{status: 'error'}` instead of `{status: 'ok'}`. This occurred in:
- Multi-hop traversal tests (lines 161-235 in `cosmos.e2e.test.ts`)
- Concurrent operations tests

Since environment variables were set and the database was writable, the issue was not related to connectivity or permissions.

## Root Cause Analysis

### 1. Missing Error Handling in `LocationRepository.move`

**Problem:** The original implementation had no try-catch error handling:

```typescript
async move(fromId: string, direction: string) {
    if (!isDirection(direction)) return { status: 'error', reason: 'no-exit' } as const
    const from = await this.get(fromId)
    if (!from) return { status: 'error', reason: 'from-missing' } as const
    const exit = from.exits?.find((e) => e.direction === direction)
    if (!exit || !exit.to) return { status: 'error', reason: 'no-exit' } as const
    const dest = await this.get(exit.to)
    if (!dest) return { status: 'error', reason: 'target-missing' } as const
    return { status: 'ok', location: dest } as const
}
```

**Issues identified:**
1. If `get()` throws an exception (e.g., network error, auth error, Gremlin query error), it bubbles up as an unhandled exception
2. No logging to diagnose which step failed or why
3. Silent failures if Cosmos DB returns unexpected data structures
4. No distinction between "location not found" (logical error) vs "query failed" (infrastructure error)

### 2. Potential Gremlin Query Issue in `get` Method

**Problem:** The exits query used `by(values('description'))` which could fail if the description property doesn't exist:

```typescript
const exitsRaw = await this.query<Record<string, unknown>>(
    "g.V(locationId).outE('exit').project('direction','to','description')" +
    ".by(values('direction')).by(inV().id()).by(values('description'))",
    { locationId: id }
)
```

**Issue:** Gremlin `values()` throws an error if the property doesn't exist. The correct pattern is to use `coalesce(values('description'), constant(''))`.

### 3. Insufficient Test Validation

**Problem:** The seeding test only verified that locations exist, not that exits were properly created:

```typescript
for (const loc of locations) {
    const retrieved = await locationRepository.get(loc.id)
    assert.ok(retrieved, `Location ${loc.id} should exist after seeding`)
    assert.equal(retrieved.name, loc.name, 'Location name matches')
}
```

**Issue:** This doesn't validate:
- Exit count matches expected
- Exit directions are correct
- Exit targets exist
- Graph connectivity is as expected

### 4. Poor Error Visibility in Tests

**Problem:** Test failures showed only `status: 'error'` without context:

```typescript
assert.equal(move1Result.status, 'ok', 'First move should succeed')
```

**Issue:** When this fails, you only see "AssertionError: First move should succeed" with no information about:
- What the error reason was
- What the location state was at failure time
- Which exits were available
- What the expected vs actual state was

## Solutions Implemented

### 1. Enhanced Error Handling in `move` Method

```typescript
async move(fromId: string, direction: string) {
    try {
        // Validate direction first (cheap operation)
        if (!isDirection(direction)) {
            console.warn(`[LocationRepository.move] Invalid direction: ${direction} from location: ${fromId}`)
            return { status: 'error', reason: 'no-exit' } as const
        }

        // Get source location with detailed error logging
        let from: Location | undefined
        try {
            from = await this.get(fromId)
        } catch (error) {
            console.error(`[LocationRepository.move] Error fetching source location ${fromId}:`, error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return { status: 'error', reason: `from-location-query-failed: ${errorMessage}` } as const
        }

        if (!from) {
            console.warn(`[LocationRepository.move] Source location not found: ${fromId}`)
            return { status: 'error', reason: 'from-missing' } as const
        }

        // Log current location state for debugging
        console.debug(`[LocationRepository.move] Source location ${fromId} has ${from.exits?.length || 0} exits`)

        // Find exit in the specified direction
        const exit = from.exits?.find((e) => e.direction === direction)
        if (!exit || !exit.to) {
            console.warn(
                `[LocationRepository.move] No exit in direction '${direction}' from location ${fromId}. ` +
                `Available exits: ${from.exits?.map((e) => e.direction).join(', ') || 'none'}`
            )
            return { status: 'error', reason: 'no-exit' } as const
        }

        console.debug(`[LocationRepository.move] Found exit: ${fromId} --${direction}--> ${exit.to}`)

        // Get destination location with detailed error logging
        let dest: Location | undefined
        try {
            dest = await this.get(exit.to)
        } catch (error) {
            console.error(`[LocationRepository.move] Error fetching destination location ${exit.to}:`, error)
            const errorMessage = error instanceof Error ? error.message : 'Unknown error'
            return { status: 'error', reason: `target-location-query-failed: ${errorMessage}` } as const
        }

        if (!dest) {
            console.error(
                `[LocationRepository.move] Destination location not found: ${exit.to}. ` +
                `This indicates a broken exit link in the graph.`
            )
            return { status: 'error', reason: 'target-missing' } as const
        }

        console.debug(`[LocationRepository.move] Move successful: ${fromId} --> ${dest.id} (${dest.name})`)
        return { status: 'ok', location: dest } as const
    } catch (error) {
        // Catch any unexpected errors (should be rare after specific error handling above)
        console.error(`[LocationRepository.move] Unexpected error during move operation:`, error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return { status: 'error', reason: `unexpected-error: ${errorMessage}` } as const
    }
}
```

**Benefits:**
- Every failure path now logs diagnostic information
- Database errors are caught and converted to error responses
- Errors distinguish between logical errors and infrastructure errors
- Debug logs track the happy path for performance tuning

### 2. Fixed Gremlin Query for Exits

```typescript
const exitsRaw = await this.query<Record<string, unknown>>(
    "g.V(locationId).outE('exit').project('direction','to','description')" +
    ".by(values('direction')).by(inV().id())" +
    ".by(coalesce(values('description'), constant('')))",
    { locationId: id }
)
```

**Benefits:**
- Handles missing description property gracefully
- Consistent with `regenerateExitsSummaryCache` implementation
- Prevents query failures on valid graph data

### 3. Enhanced Test Validation

```typescript
// Validate each location exists and has expected exits
for (const loc of locations) {
    const retrieved = await locationRepository.get(loc.id)
    assert.ok(retrieved, `Location ${loc.id} should exist after seeding`)
    assert.equal(retrieved.name, loc.name, 'Location name matches')
    
    // Validate exits were created
    const expectedExitCount = loc.exits?.length || 0
    const actualExitCount = retrieved.exits?.length || 0
    assert.equal(
        actualExitCount,
        expectedExitCount,
        `Location ${loc.id} should have ${expectedExitCount} exits, but has ${actualExitCount}. ` +
        `Expected: [${loc.exits?.map(e => e.direction).join(', ')}], ` +
        `Actual: [${retrieved.exits?.map(e => e.direction).join(', ')}]`
    )
    
    // Validate each exit direction matches and target exists
    for (const expectedExit of loc.exits || []) {
        const actualExit = retrieved.exits?.find(e => e.direction === expectedExit.direction)
        assert.ok(
            actualExit,
            `Location ${loc.id} should have exit in direction '${expectedExit.direction}'`
        )
        assert.equal(
            actualExit.to,
            expectedExit.to,
            `Exit ${loc.id} --${expectedExit.direction}--> should point to ${expectedExit.to}, but points to ${actualExit.to}`
        )
        
        // Verify target location exists
        if (actualExit.to) {
            const targetExists = await locationRepository.get(actualExit.to)
            assert.ok(
                targetExists,
                `Exit target location ${actualExit.to} should exist (from ${loc.id} via ${expectedExit.direction})`
            )
        }
    }
    
    console.log(`✓ Location ${loc.id}: ${actualExitCount} exits validated`)
}
```

**Benefits:**
- Catches seeding failures immediately
- Validates graph structure before running move tests
- Provides detailed error messages showing expected vs actual state
- Verifies exit connectivity (target locations exist)

### 4. Improved Test Error Messages

```typescript
if (move1Result.status !== 'ok') {
    console.error(`Move 1 failed with reason: ${move1Result.reason}`)
    const hubState = await locationRepository.get(hubLocation.id)
    console.error(`Hub location state:`, JSON.stringify(hubState, null, 2))
}
assert.equal(
    move1Result.status,
    'ok',
    `First move should succeed. Got: ${move1Result.status === 'error' ? move1Result.reason : 'ok'}`
)
```

**Benefits:**
- Test output shows error reason inline
- Dumps full location state (exits, properties) on failure
- Makes CI failure logs actionable without needing to reproduce locally

## Testing Results

All changes validated locally:
- ✅ Unit tests: 95/95 passing
- ✅ Integration tests: 80/80 passing
- ✅ Build: Successful
- ✅ Lint: Passing

The E2E tests will run in CI with real Cosmos DB credentials via OIDC authentication.

## Debugging Checklist for Future Move Operation Failures

When a move operation fails in E2E tests, check the logs for:

1. **Source location query:**
   - `[LocationRepository.move] Error fetching source location {id}` → Database connectivity issue
   - `[LocationRepository.move] Source location not found: {id}` → Seeding failed or wrong ID
   - `[LocationRepository.move] Source location {id} has X exits` → Seeding succeeded

2. **Exit validation:**
   - `[LocationRepository.move] No exit in direction '{dir}' from location {id}. Available exits: [...]` → Exit not created or wrong direction
   - `[LocationRepository.move] Found exit: {from} --{dir}--> {to}` → Exit exists

3. **Destination location query:**
   - `[LocationRepository.move] Error fetching destination location {id}` → Database connectivity issue
   - `[LocationRepository.move] Destination location not found: {id}. This indicates a broken exit link` → Target location not seeded or wrong ID
   - `[LocationRepository.move] Move successful: {from} --> {to}` → Success

4. **Unexpected errors:**
   - `[LocationRepository.move] Unexpected error during move operation` → Infrastructure issue (auth, network, etc.)

## Best Practices Established

1. **Always wrap database operations in try-catch** when the caller expects a result type (not an exception)
2. **Use coalesce for optional Gremlin properties** to handle missing values gracefully
3. **Log at appropriate levels:**
   - `console.debug` for happy path diagnostics
   - `console.warn` for expected errors (no exit, location not found)
   - `console.error` for unexpected errors (query failures, infrastructure issues)
4. **Validate graph structure in tests** before running operations that depend on it
5. **Include context in error messages** (IDs, directions, available exits, etc.)
6. **Distinguish logical errors from infrastructure errors** in error reasons

## Related Files

- `backend/src/repos/locationRepository.cosmos.ts` - Enhanced move() and get() methods
- `backend/test/e2e/cosmos.e2e.test.ts` - Improved test validation and error reporting
- `backend/test/helpers/seedTestWorld.ts` - Test world blueprints
- `.github/workflows/e2e-integration.yml` - CI workflow with OIDC authentication

## References

- Issue: piquet-h/the-shifting-atlas#[issue-number]
- PR: piquet-h/the-shifting-atlas#[pr-number]
- ADR-002: Graph Partition Strategy
- Test Strategy: docs/testing/test-strategy.md
