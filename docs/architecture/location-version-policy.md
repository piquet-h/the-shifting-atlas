# Location Version Policy for Exit Changes

## Decision

**Location vertex `version` property SHALL NOT increment when only exit edges change.**

## Rationale

The `version` property tracks **content changes** (name, description, tags) for optimistic concurrency and cache invalidation. Exit edges are **structural relationships** that do not affect the intrinsic content of a location.

### Why Separate Exit Changes from Content Changes?

1. **Frequency Asymmetry**: Exit creation is rare (world generation, manual linking). Content changes are more frequent (AI-generated layers, description refinements). Mixing them inflates version numbers unnecessarily.

2. **Optimistic Concurrency Intent**: Version numbers prevent conflicting _content_ edits (e.g., two processes updating description simultaneously). Exit edge conflicts are handled by idempotent `ensureExit` - no race condition exists.

3. **Cache Invalidation Precision**: Frontend caches location _descriptions_, not exit topology. Exit changes don't require invalidating cached descriptive text.

4. **Graph Semantics**: In property graph databases (Gremlin), vertices and edges are orthogonal. Edge mutations don't inherently modify vertex properties.

## Alternative Considered: Dual Revision Counters

We could introduce:

- `contentRevision` (name, description, tags)
- `structuralRevision` (exit edges)

**Rejected because**:

- Adds complexity for minimal gain
- Exit changes tracked via telemetry events (`World.Exit.Created`, `World.Exit.Removed`)
- Future analytics can reconstruct exit history from telemetry timeline

## Implementation

### CosmosLocationRepository

The existing `upsert` implementation (as of Issue #100) computes a content hash from `name + description + tags` and increments `version` only if the hash changes. Exit edges are not included in this hash.

```typescript
// In locationRepository.cosmos.ts
const newContentHash = computeLocationContentHash(location.name, location.description, location.tags)
// ... compare with existingContentHash
// Only increment version if content changed
```

Methods that modify edges (`ensureExit`, `removeExit`) do NOT call `upsert` and thus do NOT trigger version increments.

### InMemoryLocationRepository

The in-memory repository follows the same pattern: `upsert` compares content hashes excluding exits. The `ensureExit` and `removeExit` methods operate on the `exits` array directly without touching `version`.

## Testing

The test suite includes cases verifying:

- `upsert` with only content change → version increments
- `upsert` with identical content → version unchanged
- Exit creation/removal → version unchanged (existing tests in `edgeManagement.test.ts` implicitly cover this)

### Explicit Test Case

```typescript
test('location version unchanged when only exits added', async () => {
    // Create location with version 1
    await repo.upsert({ id: 'A', name: 'Alpha', description: 'First', version: 1 })

    // Add exit (structural change only)
    await repo.ensureExit('A', 'north', 'B')

    // Fetch location
    const location = await repo.get('A')

    // Version should still be 1
    assert.equal(location.version, 1)
})
```

## Edge Case: Content and Exit Changes Together

If a single operation updates _both_ content and exits (unlikely in practice), the content change triggers version increment per existing logic. The exit change is incidental.

Example:

```typescript
// Scenario: AI generates new location with pre-defined exits
await repo.upsert({ id: 'X', name: 'New', description: 'Generated', version: 1 })
await repo.ensureExit('X', 'north', 'Y')
// 'X' has version=1 (from upsert, exit ignored)
```

## Telemetry

Exit changes emit dedicated events:

- `World.Exit.Created` (fromLocationId, toLocationId, direction)
- `World.Exit.Removed` (fromLocationId, direction)

These events provide an audit trail independent of version numbers.

## Future Considerations

If we later introduce:

- **Exit metadata evolution** (e.g., changing `blocked` status, adding `requiredKey` property), we may need a separate `exitRevision` counter at the edge level (not vertex level).
- **Exit snapshots for time-travel queries**, telemetry events will suffice until we implement explicit temporal modeling.

## Related

- ADR-002: Dual persistence (graph vs SQL)
- Issue #100: Location persistence with content hash versioning
- Issue #112: Edge management (this policy documented here)

---

Accepted: 2025-01-15
