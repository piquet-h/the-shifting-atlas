---
status: Accepted
date: 2026-01-13
supersedes: []
amends: []
---

# ADR-007: Canonical Lore Facts Versioning Strategy

## Context

The CanonicalFact model (`shared/src/domainModels.ts`) includes a `version` field and preliminary versioning documentation in code comments, but the formal versioning workflow has been deferred. This ADR establishes the authoritative strategy for managing fact mutations (edits, corrections, deprecations) while maintaining immutability per fact version.

**Key Requirements**:
- Support emergent LLM-generated lore mutations
- Maintain audit trail for all fact changes
- Enable deterministic replay via version pinning
- Support archival/deprecation without data loss
- Handle breaking changes (e.g., factId renames)
- Provide clear authoring workflow for lore maintainers

**Persistence**: Cosmos SQL API `loreFacts` container (PK: `/type`)

**Access**: Read-only via MCP tools (`get-canonical-fact`, `search-lore`)

## Decision

### 1. Immutability Guarantees

**Each Cosmos document represents a single immutable version**:
- Document `id` (GUID) is unique per version and never reused
- `factId` is the stable semantic business key that persists across versions
- `fields` content is immutable once a version is created
- `version` number increments monotonically for each mutation
- All timestamp fields (`createdUtc`, `updatedUtc`, `archivedUtc`) are write-once per version

**Example mutation flow**:
```typescript
// V1: Initial fact creation
{
  id: 'doc-uuid-001',
  factId: 'faction_shadow_council',
  type: 'faction',
  version: 1,
  fields: { name: 'Shadow Council', alignment: 'neutral' },
  createdUtc: '2026-01-10T10:00:00Z'
}

// V2: LLM-generated edit (creates NEW document)
{
  id: 'doc-uuid-002',
  factId: 'faction_shadow_council',
  type: 'faction',
  version: 2,
  fields: { name: 'The Shadow Council', alignment: 'neutral', influence: 'regional' },
  createdUtc: '2026-01-10T12:00:00Z',
  updatedUtc: '2026-01-10T12:00:00Z'
}

// V1 can optionally be marked as superseded (but remains addressable)
{
  id: 'doc-uuid-001',
  factId: 'faction_shadow_council',
  type: 'faction',
  version: 1,
  fields: { name: 'Shadow Council', alignment: 'neutral' },
  createdUtc: '2026-01-10T10:00:00Z',
  updatedUtc: '2026-01-10T12:00:00Z'  // Marks when superseded
}
```

### 2. Edit Workflow: New Document per Version

**All edits create a new Cosmos document**:
- Never modify existing document fields (except optional `updatedUtc` on previous version)
- Generate new GUID for document `id`
- Increment `version` number
- Preserve same `factId` and `type` (partition key)
- Set new `createdUtc` for the new version
- Optionally update `updatedUtc` on previous version to mark supersession timestamp

**Rationale**:
- Enables full audit trail (every version is addressable)
- Simplifies concurrent edit detection (compare current max version)
- Supports deterministic replay (version number = ordering guarantee)
- No special-case logic for partial updates
- Lower risk of data corruption vs in-place edits

**Rejected Alternative**: In-place update with version bump
- Would lose audit trail unless paired with separate history table
- Complex conflict resolution for concurrent edits
- Risk of partial update corruption
- No replay guarantee without additional versioning infrastructure

### 3. Deprecation & Archival Mechanisms

**Soft Delete via `archivedUtc` field**:
- Set `archivedUtc` timestamp on a version to exclude it from default queries
- Archived versions remain in database for audit/compliance
- Default query behavior (`getFact(factId)`) returns latest **non-archived** version
- Explicit version queries (`getFact(factId, version)`) return archived versions

**Archival triggers**:
- Manual deprecation (lore maintainer marks fact obsolete)
- Supersession (optional: mark old version as archived when new version created)
- Breaking change migration (old factId archived, new factId becomes active)

**Query filtering**:
```sql
-- Default: Latest non-archived version only
SELECT TOP 1 * FROM c 
WHERE c.factId = @factId 
  AND (NOT IS_DEFINED(c.archivedUtc) OR c.archivedUtc = null)
ORDER BY c.version DESC

-- Audit: Specific version (includes archived)
SELECT * FROM c 
WHERE c.factId = @factId AND c.version = @version
```

### 4. Breaking Changes: factId Renames & Type Changes

**factId Rename Migration**:
1. Create new fact with new `factId` at version 1 (copy fields from latest old version)
2. Archive all versions of old `factId` (set `archivedUtc`)
3. Add migration metadata to new version:
   ```typescript
   fields: {
     ...originalFields,
     _migration: {
       previousFactId: 'old_faction_name',
       migratedUtc: '2026-01-13T00:00:00Z',
       reason: 'Renamed for consistency'
     }
   }
   ```
4. Document mapping in migration log (separate markdown file in `docs/migrations/lore/`)

**Type Change Migration**:
- Similar to factId rename (new document, new partition, archive old)
- Document justification in migration log

**No automatic redirects**: Queries using old factId fail cleanly (return undefined), forcing code updates

### 5. Index Strategy for Multi-Version Queries

**Required Cosmos SQL Indexes**:
```json
{
  "indexingPolicy": {
    "includedPaths": [
      { "path": "/factId/?" },
      { "path": "/version/?" },
      { "path": "/archivedUtc/?" },
      { "path": "/createdUtc/?" }
    ],
    "compositeIndexes": [
      [
        { "path": "/factId", "order": "ascending" },
        { "path": "/version", "order": "descending" }
      ],
      [
        { "path": "/type", "order": "ascending" },
        { "path": "/factId", "order": "ascending" }
      ]
    ]
  }
}
```

**Query patterns**:
- Latest version: `factId ASC, version DESC` composite index (LIMIT 1)
- Version history: `factId ASC, version DESC` range query
- Type scan: Uses partition key `/type` directly

**RU Cost Estimates**:
- Single fact latest version: ~3-5 RU (cross-partition query via indexed factId)
- Version history (10 versions): ~5-8 RU
- Batch fact retrieval (20 facts): ~50-80 RU

### 6. Cleanup Strategy for Development Seeds

**Development Seed Lifecycle**:
1. **Initial seed**: Create version 1 facts via seed script
2. **Development iteration**: Create new versions as needed (testing mutation flow)
3. **Cleanup before production**: Delete ALL lore facts and reseed with curated set

**Cleanup script** (`backend/scripts/cleanup-lore-facts.ts`):
```typescript
// Delete all facts in a given type (or all types)
async function cleanupLoreFacts(options: {
  types?: FactType[]  // Empty = all types
  dryRun?: boolean
  beforeDate?: string  // Optional: only delete facts created before date
}): Promise<void>

// Usage:
// npm run lore:cleanup -- --dry-run
// npm run lore:cleanup -- --types faction,artifact
// npm run lore:cleanup -- --before 2026-01-01
```

**Development best practices**:
- Use predictable factIds for development seeds (`dev_faction_*`, `test_artifact_*`)
- Tag development facts in fields: `fields._dev = true`
- Never deploy development seeds to staging/production
- Production seeds use semantic factIds without prefixes

**Retention policy**:
- Development: Delete freely (no retention requirement)
- Staging: Retain 30 days for testing audit workflows
- Production: Infinite retention (compliance, deterministic replay)

### 7. Edge Cases

#### 7.1 Simultaneous Edits (Optimistic Concurrency)

**Conflict detection**:
```typescript
async function createFactVersion(
  factId: string,
  fields: Record<string, unknown>,
  expectedCurrentVersion: number
): Promise<CanonicalFact> {
  const current = await getFact(factId)
  if (!current) throw new Error(`Fact ${factId} not found`)
  if (current.version !== expectedCurrentVersion) {
    throw new ConflictError(
      `Version conflict: expected ${expectedCurrentVersion}, got ${current.version}`
    )
  }
  // Create new version document...
}
```

**Resolution strategy**:
- Client retry with conflict detection (read current version, merge changes, retry)
- Last-write-wins NOT supported (explicit version check required)
- Future: Operational transform for LLM-generated concurrent edits

#### 7.2 Queries on Old Versions

**Audit/Replay access**:
```typescript
// Explicit version query (bypasses archive filter)
async function getFactVersion(
  factId: string, 
  version: number
): Promise<CanonicalFact | undefined>

// Version history (all versions including archived)
async function listFactVersions(
  factId: string
): Promise<CanonicalFact[]>
```

**Use cases**:
- Compliance audit (show fact state at specific timestamp)
- Deterministic replay (use pinned version set for generation consistency)
- Rollback (create new version copying fields from old version)

#### 7.3 Retention Policy for Archived Versions

**Production retention**: Infinite (compliance requirement for audit trail)

**Archival != Deletion**:
- Archived versions excluded from default queries but remain addressable
- Physical deletion only for GDPR/compliance (requires manual intervention)
- Storage cost: ~1KB per fact version (minimal given low mutation rate)

**Estimated storage growth**:
- Initial seed: 200 facts × 1KB = 200KB
- Year 1 mutations: ~500 edits × 1KB = 500KB
- 5-year projection: ~3MB (negligible vs Cosmos minimum 1GB allocation)

## Consequences

### Positive
- Full audit trail for all lore changes (compliance, debugging, deterministic replay)
- Simple conflict detection (compare version numbers)
- Immutability per version reduces corruption risk
- Archival preserves history while cleaning up query results
- Clear migration path for breaking changes

### Negative
- Higher document count (each edit = new document)
- Cross-partition queries for factId lookups (mitigated by composite indexes)
- Manual cleanup required for development seeds
- No automatic factId redirects (breaking changes require code updates)

### Mitigations
- Composite indexes reduce RU cost for version queries
- Development cleanup script automates seed removal
- Migration logs document breaking changes
- Telemetry tracks mutation frequency for cost monitoring

## Alternatives Considered

| Alternative | Outcome | Reason Rejected |
|-------------|---------|-----------------|
| In-place update with version bump | Simpler document count | Loses audit trail, complex conflict resolution |
| Separate history table | Lower main table size | Adds query complexity, dual-write risk |
| No versioning (overwrite) | Minimal storage | No audit trail, no deterministic replay |
| Delete archived versions after 90 days | Lower storage cost | Breaks compliance, loses replay capability |

## Implementation Checklist

- [x] ADR documentation complete
- [ ] Extend ILoreRepository interface with versioning methods
- [ ] Implement versioning in MemoryLoreRepository
- [ ] Implement versioning in CosmosLoreRepository
- [ ] Add composite indexes to Cosmos SQL container (infrastructure)
- [ ] Create cleanup script for development seeds
- [ ] Add tests for versioning workflows
- [ ] Document lore authoring workflow
- [ ] Update seed script with versioning examples

## Authoring Workflow Documentation

**For lore maintainers** (detailed guide in `docs/developer-workflow/lore-authoring.md`):

1. **Create new fact**:
   ```bash
   npm run lore:create -- --factId faction_new --type faction --fields '{...}'
   ```

2. **Edit existing fact**:
   ```bash
   npm run lore:edit -- --factId faction_shadow_council --fields '{...}'
   # Automatically increments version, creates new document
   ```

3. **Archive deprecated fact**:
   ```bash
   npm run lore:archive -- --factId old_faction_name --reason "Renamed to faction_new_name"
   ```

4. **View version history**:
   ```bash
   npm run lore:versions -- --factId faction_shadow_council
   ```

5. **Development cleanup**:
   ```bash
   npm run lore:cleanup -- --dry-run  # Preview
   npm run lore:cleanup              # Execute
   ```

## References

- CanonicalFact interface: `shared/src/domainModels.ts` (lines 426-453)
- Lore repository: `backend/src/repos/loreRepository.{ts,memory.ts,cosmos.ts}`
- MCP handlers: `backend/src/handlers/mcp/lore-memory/lore-memory.ts`
- Seed script: `backend/scripts/seed-lore-facts.ts`
- ADR-001: Mosswell Persistence & Layering (immutability patterns)
- ADR-004: Player Store Cutover (SQL API document patterns)
- Issue #38: Scaffold MCP servers (world-query + lore-memory)
- Issue #729: Design versioning strategy for canonical lore facts
- Architecture: `docs/architecture/agentic-ai-and-mcp.md` (lore-memory MCP)

---

Accepted 2026-01-13.
