# Lore Authoring Workflow

> **Status**: IMPLEMENTED (2026-01-13). Versioning strategy documented in ADR-007. CLI helpers planned.

## Purpose

Guide for lore maintainers and contributors on creating, editing, and managing canonical world facts in the loreFacts container. All operations support emergent LLM-generated lore while maintaining audit trails and immutability guarantees per version.

Scope note: This document covers **canonical facts** only. For the complementary narrative lore corpus (rumours, legends, story-shaped world memory) and how it is surfaced, see `../architecture/lore-storage-growth-and-surfacing.md`.

## Core Principles

1. **Immutability per version**: Each version is a separate document with unique Cosmos `id`
2. **Stable references**: `factId` remains constant across versions (e.g., `faction_shadow_council`)
3. **Monotonic versioning**: Version numbers increment; never reused
4. **Soft deletion**: `archivedUtc` marks deprecated versions (excluded from default queries but preserved for audit)
5. **Optimistic concurrency**: Version checks prevent conflicting concurrent edits

## Fact Structure

```typescript
{
  id: "doc-uuid-002",                          // Unique per version (GUID)
  type: "faction",                             // Partition key: faction | artifact | historical_event | character | location_lore | creature
  factId: "faction_shadow_council",            // Stable business key
  fields: {                                    // Flexible schema per type
    name: "The Shadow Council",
    description: "A secretive organization...",
    alignment: "neutral",
    influence: "regional"
  },
  version: 2,                                  // Incremented on mutations
  embeddings: [0.123, -0.456, ...],           // Optional: For semantic search
  createdUtc: "2026-01-10T12:00:00Z",         // When this version was created
  updatedUtc: "2026-01-10T12:00:00Z",         // Set when new version created from this one
  archivedUtc: null                            // Set when version deprecated
}
```

## Workflow 1: Create New Fact

**Use case**: Adding a brand new canonical fact (not a new version of existing fact).

### Manual Creation (Development)

```typescript
// Example: Add new faction fact manually
import { v4 as uuidv4 } from 'uuid'
import type { CanonicalFact } from '@piquet-h/shared'

const newFact: CanonicalFact = {
    id: uuidv4(),
    type: 'faction',
    factId: 'faction_crimson_order', // Must be unique across all facts
    fields: {
        name: 'The Crimson Order',
        description: 'An ancient brotherhood of knights sworn to protect the realm.',
        alignment: 'lawful_good',
        influence: 'continental',
        headquarters: 'Crimson Keep, Northern Highlands'
    },
    version: 1, // Always start at version 1
    createdUtc: new Date().toISOString()
}

// Insert via repository (requires write access - not available via MCP read-only tools)
// await loreRepository.create(newFact)  // Planned: createFact() method
```

### CLI Helper (Planned)

```bash
# Create new faction fact
npm run lore:create -- \
  --factId faction_crimson_order \
  --type faction \
  --fields '{"name":"The Crimson Order","alignment":"lawful_good",...}'

# Interactive mode (prompts for fields)
npm run lore:create --interactive
```

### Validation Checklist

- [ ] `factId` is unique (no existing fact with same factId)
- [ ] `type` is valid FactType (`faction | artifact | historical_event | character | location_lore | creature`)
- [ ] `fields` matches expected schema for type (loosely validated; flexible by design)
- [ ] `version` is 1
- [ ] `createdUtc` is present
- [ ] No `archivedUtc` on initial creation

## Workflow 2: Edit Existing Fact (Create New Version)

**Use case**: Updating fact fields while preserving previous version for audit/rollback.

### Manual Edit

```typescript
// 1. Fetch current version
const current = await loreRepository.getFact('faction_shadow_council')
if (!current) throw new Error('Fact not found')

// 2. Create new version with updated fields
const updatedFact = await loreRepository.createFactVersion(
    'faction_shadow_council',
    {
        ...current.fields,
        description: 'Updated: A secretive organization operating from the ruins beneath Mosswell.',
        influence: 'regional_expanded' // New field
    },
    current.version // Expected current version for conflict detection
)

// Result:
// - New document created with version = current.version + 1
// - New unique `id` (GUID)
// - Previous version optionally marked with `updatedUtc` = new version's createdUtc
```

### CLI Helper (Planned)

```bash
# Edit existing fact (increments version)
npm run lore:edit -- \
  --factId faction_shadow_council \
  --fields '{"description":"Updated description","influence":"regional_expanded"}'

# Interactive edit (opens editor with current fields)
npm run lore:edit --interactive --factId faction_shadow_council
```

### Optimistic Concurrency Example

```typescript
// Scenario: Two editors working concurrently
const editor1 = await loreRepository.getFact('faction_shadow_council')
const editor2 = await loreRepository.getFact('faction_shadow_council')
// Both see version 2

// Editor 1 successfully creates version 3
await loreRepository.createFactVersion('faction_shadow_council', {...}, 2)

// Editor 2 fails with ConflictError
try {
  await loreRepository.createFactVersion('faction_shadow_council', {...}, 2)
} catch (err) {
  // ConflictError: Version conflict: expected 2, got 3
  // Editor 2 must refetch current version, merge changes, and retry
}
```

### Merge Strategy for Conflicts

1. Refetch current version
2. Manually resolve conflicting field changes (no automatic merge)
3. Retry `createFactVersion` with new expected version

## Workflow 3: Archive Fact (Deprecation)

**Use case**: Mark fact as obsolete without deleting (preserves audit trail).

### Archive Specific Version

```typescript
// Archive version 1 only (version 2 remains active)
const archivedCount = await loreRepository.archiveFact('faction_shadow_council', 1)
// Result: version 1 has archivedUtc set, excluded from default queries
```

### Archive All Versions

```typescript
// Archive all versions of a fact (effective "soft delete")
const archivedCount = await loreRepository.archiveFact('faction_shadow_council')
// Result: All versions have archivedUtc set
// getFact('faction_shadow_council') returns undefined
// getFactVersion('faction_shadow_council', 1) still returns archived version (audit access)
```

### CLI Helper (Planned)

```bash
# Archive specific version
npm run lore:archive -- \
  --factId faction_shadow_council \
  --version 1 \
  --reason "Superseded by corrected version"

# Archive all versions (effective deletion)
npm run lore:archive -- \
  --factId faction_old_unused \
  --all \
  --reason "Faction removed from canon"
```

## Workflow 4: Query Version History (Audit)

**Use case**: Inspect previous versions for compliance, rollback, or comparison.

### List All Versions

```typescript
// Get all versions (including archived) ordered by version DESC
const versions = await loreRepository.listFactVersions('faction_shadow_council')
// Result: [v3, v2, v1] (newest first)
```

### Get Specific Version

```typescript
// Retrieve exact version (bypasses archive filter)
const v1 = await loreRepository.getFactVersion('faction_shadow_council', 1)
// Returns version 1 even if archived
```

### CLI Helper (Planned)

```bash
# View version history
npm run lore:versions -- --factId faction_shadow_council

# Output:
# Version 3 (current)  Created: 2026-01-13T10:00:00Z
# Version 2            Created: 2026-01-10T12:00:00Z
# Version 1 (archived) Created: 2026-01-10T10:00:00Z  Archived: 2026-01-13T09:00:00Z

# View specific version
npm run lore:version -- --factId faction_shadow_council --version 1
```

## Workflow 5: Fact ID Rename (Breaking Change)

**Use case**: Rename `factId` due to naming convention change or migration.

### Migration Pattern

```typescript
// 1. Create new fact with new factId (copy fields from latest old version)
const oldFact = await loreRepository.getFact('faction_shadow_council')
const newFact: CanonicalFact = {
    id: uuidv4(),
    type: oldFact.type,
    factId: 'faction_shadow_council_v2', // New factId
    fields: {
        ...oldFact.fields,
        _migration: {
            previousFactId: 'faction_shadow_council',
            migratedUtc: new Date().toISOString(),
            reason: 'Renamed for consistency with naming conventions'
        }
    },
    version: 1, // Reset to version 1 for new factId
    createdUtc: new Date().toISOString()
}
// await loreRepository.create(newFact)  // Planned

// 2. Archive all versions of old factId
await loreRepository.archiveFact('faction_shadow_council')

// 3. Document migration in docs/migrations/lore/YYYY-MM-DD-rename-shadow-council.md
```

### Migration Documentation Template

```markdown
# Lore Migration: Rename faction_shadow_council → faction_shadow_council_v2

**Date**: 2026-01-13
**Type**: factId Rename
**Reason**: Standardize faction naming conventions

## Changes

- Old factId: `faction_shadow_council`
- New factId: `faction_shadow_council_v2`
- All versions of old factId archived
- New factId created with latest fields from old factId (version 1)

## Code Impact

- Update any hardcoded references to `faction_shadow_council` in code/prompts
- MCP queries using old factId will return `undefined` (no automatic redirect)

## Rollback

1. Unarchive old factId versions: `UPDATE loreFacts SET archivedUtc = null WHERE factId = 'faction_shadow_council'`
2. Archive new factId: `archiveFact('faction_shadow_council_v2')`
```

### CLI Helper (Planned)

```bash
# Rename factId with migration tracking
npm run lore:rename -- \
  --oldFactId faction_shadow_council \
  --newFactId faction_shadow_council_v2 \
  --reason "Standardize naming conventions" \
  --dry-run  # Preview changes first
```

## Workflow 6: Development Cleanup

**Use case**: Remove test/development facts before production deployment.

### Manual Cleanup

```typescript
// Query all development facts (tagged with _dev: true in fields)
const devFacts = await cosmosContainer.items.query('SELECT c.factId FROM c WHERE c.fields._dev = true').fetchAll()

// Archive each fact
for (const fact of devFacts) {
    await loreRepository.archiveFact(fact.factId)
}
```

### CLI Helper (Planned)

```bash
# Delete all facts with _dev tag (dry-run first)
npm run lore:cleanup -- --dev-only --dry-run

# Delete all facts created before a date
npm run lore:cleanup -- --before 2026-01-01 --dry-run

# Delete specific type
npm run lore:cleanup -- --types faction,artifact --dry-run

# Execute cleanup (no dry-run)
npm run lore:cleanup -- --dev-only
```

### Development Best Practices

1. **Tag development facts**: Add `_dev: true` to `fields` for easy identification
2. **Use predictable factIds**: Prefix with `dev_` or `test_` (e.g., `dev_faction_demo`)
3. **Never deploy dev seeds to production**: Separate seed scripts for dev vs prod
4. **Clean up before staging**: Run cleanup script before deploying to staging environment

## Querying Patterns

### Default Query (Latest Non-Archived)

```typescript
// Returns latest version where archivedUtc is null
const fact = await loreRepository.getFact('faction_shadow_council')
```

### Semantic Search (Planned)

```typescript
// Vector similarity search using embeddings field
const results = await loreRepository.searchFacts('secret organizations', 5)
// Returns top 5 matching facts (latest non-archived versions only)
```

### Audit Trail Query

```typescript
// Compliance: Show all changes to a fact over time
const history = await loreRepository.listFactVersions('faction_shadow_council')
history.forEach((v) => {
    console.log(`Version ${v.version}: Created ${v.createdUtc}`)
    if (v.archivedUtc) console.log(`  Archived: ${v.archivedUtc}`)
})
```

## Retention & Storage

### Production Retention Policy

- **Infinite retention**: All versions (including archived) preserved for compliance
- **Physical deletion**: Only for GDPR/legal requests (manual intervention required)
- **Storage cost**: ~1KB per version × expected 500 mutations/year = ~500KB/year (negligible)

### Staging/Development Retention

- **Staging**: 30-day retention for testing audit workflows (then manual cleanup)
- **Development**: No retention requirement (clean up freely)

## Index Strategy (Cosmos SQL API)

Required indexes for efficient queries:

```json
{
    "indexingPolicy": {
        "includedPaths": [{ "path": "/factId/?" }, { "path": "/version/?" }, { "path": "/archivedUtc/?" }, { "path": "/createdUtc/?" }],
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

**RU Cost Estimates**:

- Latest version query: ~3-5 RU
- Version history (10 versions): ~5-8 RU
- Batch retrieval (20 facts): ~50-80 RU

## Error Handling

### Common Errors

| Error                             | Cause                 | Resolution                                                                                 |
| --------------------------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `ConflictError: Version conflict` | Concurrent edit       | Refetch current version, merge changes, retry                                              |
| `Fact not found`                  | Invalid factId        | Verify factId spelling; check if archived                                                  |
| `Validation error: invalid type`  | Invalid FactType      | Use allowed types: faction, artifact, historical_event, character, location_lore, creature |
| `Duplicate factId`                | factId already exists | Choose unique factId or edit existing fact                                                 |

### Debugging Queries

```typescript
// Check if fact exists (including archived)
const versions = await loreRepository.listFactVersions('faction_unknown')
if (versions.length === 0) {
    console.log('Fact never existed')
} else if (versions.every((v) => v.archivedUtc)) {
    console.log('Fact exists but all versions archived')
}
```

## MCP Tool Compatibility

**Read-only access via MCP**:

- `get-canonical-fact`: Returns latest non-archived version
- `search-lore`: Returns semantic search results (stub; requires embeddings implementation)

**Write operations NOT exposed via MCP**:

- Fact creation, editing, archival require backend access (not available via MCP read-only tools)
- Rationale: Maintain governance over canonical lore; prevent unauthorized mutations

## Cross-References

- **ADR-007**: Canonical Lore Versioning (authoritative strategy)
- **CanonicalFact interface**: `shared/src/domainModels.ts` (lines 426-453)
- **Lore repository**: `backend/src/repos/loreRepository.{ts,memory.ts,cosmos.ts}`
- **MCP handlers**: `backend/src/handlers/mcp/lore-memory/lore-memory.ts`
- **Seed script**: `backend/scripts/seed-lore-facts.ts`
- **Architecture**: `docs/architecture/agentic-ai-and-mcp.md` (lore-memory MCP server)

---

_Last updated: 2026-01-13 | Versioning strategy implemented per ADR-007_
