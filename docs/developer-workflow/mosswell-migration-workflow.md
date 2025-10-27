# Mosswell Migration Workflow

> **Status**: Scaffold Template (Issue #169 In Progress)  
> **Purpose**: Safe, incremental world data evolution with dry-run validation  
> **Related**: [Bootstrap Script](./mosswell-bootstrap-script.md), [Repository Interfaces](./mosswell-repository-interfaces.md), [ADR-002](../adr/ADR-002-graph-partition-strategy.md)

## Purpose

This document describes the workflow and scaffolding for Mosswell world migrations: adding new locations, expanding regions, updating content, or evolving the world graph schema. Migrations use a consistent pattern with pre-checks, dry-run mode, and idempotent application.

## Overview

Migrations extend the bootstrap seeding pattern with:

- **Pre-flight validation**: Check for ID conflicts, schema version compatibility
- **Dry-run mode**: Preview planned changes without persistence
- **Incremental application**: Apply only new/changed data (idempotent)
- **Rollback safety**: Preserve existing world state (additive only)

**Key Principle**: Migrations are **additive by default**. Destructive operations (removing locations, breaking exits) require explicit confirmation and separate workflows.

## Migration Script Template

### File Structure

```
backend/migrations/
├── 001-expand-northern-ridge.ts
├── 002-add-market-district.ts
├── 003-update-entrance-prose.ts
└── README.md
```

### Template Pattern

**File**: `backend/migrations/XXX-description.ts`

```typescript
#!/usr/bin/env tsx
/**
 * Migration XXX: Brief description
 *
 * Purpose: What this migration adds/changes
 * Safety: Additive only | Content update | Schema change
 * Dependencies: Which migrations must run first (if any)
 *
 * Usage:
 *   npm run migrate:dry-run -- 001  # Preview
 *   npm run migrate:apply -- 001    # Execute
 */

import { Location } from '@piquet-h/shared'
import { seedWorld } from '../src/seeding/seedWorld.js'
import { resolvePersistenceMode } from '../src/persistenceConfig.js'

// Migration metadata
export const migration = {
    id: 'XXX',
    description: 'Brief description',
    schemaVersion: 1, // Increment if Location interface changes
    dependencies: [], // IDs of required prior migrations
    additive: true // false if destructive operations planned
}

// New/updated locations
const blueprint: Location[] = [
    {
        id: 'loc-new-location-001',
        externalId: 'northern_ridge_entrance',
        name: 'Northern Ridge Entrance',
        description: 'A narrow mountain pass opens before you...',
        kind: 'entrance',
        version: 1,
        exits: [
            { direction: 'south', to: 'loc-mosswell-entrance' },
            { direction: 'north', to: 'loc-ridge-overlook' }
        ]
    }
    // Additional locations...
]

// Pre-flight checks
async function validatePreconditions(
    locationRepo: ILocationRepository,
    opts: { dryRun: boolean }
): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []
    
    // Check 1: Schema version compatibility
    const currentSchemaVersion = 1 // From shared package or config
    if (migration.schemaVersion > currentSchemaVersion) {
        errors.push(
            `Schema version mismatch: migration requires v${migration.schemaVersion}, ` +
            `current is v${currentSchemaVersion}. Update shared package first.`
        )
    }
    
    // Check 2: Dependency migrations already applied
    for (const depId of migration.dependencies) {
        // Query for migration record (future: use migration tracking table)
        // For now: Check if key location from dependency exists
        const depLocation = await locationRepo.get(`loc-from-migration-${depId}`)
        if (!depLocation) {
            errors.push(`Dependency migration ${depId} not applied. Run it first.`)
        }
    }
    
    // Check 3: ID conflicts with existing world
    for (const loc of blueprint) {
        const existing = await locationRepo.get(loc.id)
        if (existing && !opts.dryRun) {
            // Log warning (not error): Upsert will update content if changed
            console.warn(`⚠️  Location ${loc.id} exists (will update if content changed)`)
        }
    }
    
    // Check 4: Exit targets exist
    for (const loc of blueprint) {
        for (const exit of loc.exits || []) {
            const target = await locationRepo.get(exit.to)
            if (!target && !blueprint.find(l => l.id === exit.to)) {
                errors.push(
                    `Exit ${loc.id} -> ${exit.direction} references ` +
                    `missing location: ${exit.to}`
                )
            }
        }
    }
    
    return { valid: errors.length === 0, errors }
}

// Dry-run preview
function previewChanges(blueprint: Location[]): void {
    console.log('\n📋 Planned Changes:')
    console.log(`   Locations to process: ${blueprint.length}`)
    
    const exitCount = blueprint.reduce(
        (sum, loc) => sum + (loc.exits?.length || 0),
        0
    )
    console.log(`   Exits to create: ${exitCount}`)
    
    console.log('\n   New Locations:')
    for (const loc of blueprint) {
        console.log(`   - ${loc.id} (${loc.name})`)
        if (loc.exits?.length) {
            console.log(`     Exits: ${loc.exits.map(e => e.direction).join(', ')}`)
        }
    }
    console.log()
}

// Main execution
async function main() {
    const dryRun = process.argv.includes('--dry-run')
    const mode = resolvePersistenceMode()
    
    console.log(`\n🔧 Migration ${migration.id}: ${migration.description}`)
    console.log(`   Mode: ${mode}`)
    console.log(`   Dry Run: ${dryRun ? 'YES (no changes will be made)' : 'NO'}`)
    console.log(`   Additive: ${migration.additive ? 'YES' : 'NO (may modify/remove)'}`)
    
    if (!migration.additive && !dryRun) {
        console.log('\n⚠️  WARNING: This migration includes destructive operations.')
        console.log('   Review changes carefully. Consider backing up data first.')
        // Could add interactive confirmation here
    }
    
    // Initialize repositories
    const locationRepo = container.get<ILocationRepository>(TYPES.LocationRepository)
    const playerRepo = container.get<IPlayerRepository>(TYPES.PlayerRepository)
    
    // Pre-flight validation
    console.log('\n🔍 Running pre-flight checks...')
    const validation = await validatePreconditions(locationRepo, { dryRun })
    
    if (!validation.valid) {
        console.error('\n❌ Pre-flight checks failed:')
        for (const error of validation.errors) {
            console.error(`   - ${error}`)
        }
        process.exit(1)
    }
    console.log('✅ Pre-flight checks passed')
    
    // Dry-run preview
    if (dryRun) {
        previewChanges(blueprint)
        console.log('💡 Dry run complete. No changes made.')
        console.log('   To apply: npm run migrate:apply -- XXX\n')
        return
    }
    
    // Apply migration
    console.log('\n🚀 Applying migration...')
    const result = await seedWorld({
        locationRepository: locationRepo,
        playerRepository: playerRepo,
        blueprint,
        log: (...args) => console.log('   ', ...args)
    })
    
    console.log('\n✅ Migration complete!')
    console.log(`   Locations processed: ${result.locationsProcessed}`)
    console.log(`   Location vertices created: ${result.locationVerticesCreated}`)
    console.log(`   Exits created: ${result.exitsCreated}`)
    
    // Record migration (future: persist to migration tracking table)
    console.log(`\n📝 Migration ${migration.id} applied successfully\n`)
}

main().catch(err => {
    console.error('\n❌ Migration failed:', err)
    process.exit(1)
})
```

## Workflow Steps

### 1. Create Migration File

```bash
cd backend/migrations
cp template.ts 005-add-lakeside-district.ts
```

Edit metadata and blueprint:

```typescript
export const migration = {
    id: '005',
    description: 'Add Lakeside District (8 locations)',
    schemaVersion: 1,
    dependencies: [], // Or ['001'] if depends on Northern Ridge
    additive: true
}

const blueprint: Location[] = [
    // Your new locations...
]
```

### 2. Validate with Dry-Run

```bash
npm run migrate:dry-run -- 005
```

**Expected Output**:

```
🔧 Migration 005: Add Lakeside District (8 locations)
   Mode: cosmos
   Dry Run: YES (no changes will be made)
   Additive: YES

🔍 Running pre-flight checks...
✅ Pre-flight checks passed

📋 Planned Changes:
   Locations to process: 8
   Exits to create: 14

   New Locations:
   - loc-lakeside-dock (Lakeside Dock)
     Exits: north, east, south
   - loc-fishermans-hut (Fisherman's Hut)
     Exits: west, in
   ...

💡 Dry run complete. No changes made.
   To apply: npm run migrate:apply -- 005
```

### 3. Review Pre-Flight Checks

The dry-run performs validation:

- ✅ Schema version compatibility
- ✅ Dependency migrations applied
- ✅ Exit targets exist (or will be created)
- ⚠️ ID conflicts (logs warning, allows upsert)

**If validation fails**, fix issues before proceeding:

```
❌ Pre-flight checks failed:
   - Exit loc-lakeside-dock -> south references missing location: loc-nonexistent
   - Dependency migration 001 not applied. Run it first.
```

### 4. Apply Migration

```bash
npm run migrate:apply -- 005
```

**Expected Output**:

```
🔧 Migration 005: Add Lakeside District (8 locations)
   Mode: cosmos
   Dry Run: NO
   Additive: YES

🔍 Running pre-flight checks...
✅ Pre-flight checks passed

🚀 Applying migration...
   Location loc-lakeside-dock created
   Exit north -> loc-village-square created
   ...

✅ Migration complete!
   Locations processed: 8
   Location vertices created: 8
   Exits created: 14

📝 Migration 005 applied successfully
```

### 5. Verify Application

```bash
# Query new location via Gremlin
g.V().has('externalId', 'lakeside_dock').valueMap()

# Or test via HTTP endpoint
curl "http://localhost:7071/api/location/loc-lakeside-dock"
```

### 6. Document Migration

Update `backend/migrations/README.md`:

```markdown
## Applied Migrations

| ID  | Description                | Date       | Author  |
| --- | -------------------------- | ---------- | ------- |
| 001 | Expand Northern Ridge      | 2025-10-15 | piquet  |
| 005 | Add Lakeside District      | 2025-10-27 | copilot |
```

## Pre-Flight Check Details

### Schema Version Check

**Purpose**: Ensure migration is compatible with current shared package types.

**Example**:

```typescript
// Migration uses Location.attributes (added in v2)
if (migration.schemaVersion > currentSchemaVersion) {
    errors.push('Update shared package to v0.4.0+ before applying')
}
```

### Dependency Check

**Purpose**: Enforce migration order (e.g., expansion depends on base region).

**Example**:

```typescript
// Migration 005 requires Northern Ridge (migration 001)
dependencies: ['001']

// Check: Northern Ridge entrance must exist
const entrance = await locationRepo.get('loc-northern-ridge-entrance')
if (!entrance) {
    errors.push('Dependency migration 001 not applied. Run it first.')
}
```

### ID Conflict Check

**Purpose**: Detect duplicate location IDs (logs warning, allows content update).

**Behavior**:

- If ID exists with different content: Upsert updates content (safe)
- If ID exists with same content: Upsert skips (idempotent)
- If ID collision is unintended: Manual review required

### Exit Target Check

**Purpose**: Prevent dangling exits (exits pointing to non-existent locations).

**Example**:

```typescript
// Exit references location not in blueprint and not in graph
exit: { direction: 'north', to: 'loc-typo-location' }
// Error: "Exit loc-lakeside-dock -> north references missing location"
```

**Resolution**: Fix typo or add target location to blueprint.

## Dry-Run Mode

### Purpose

Preview changes without modifying the world graph. Safe for:

- Testing migration logic
- Reviewing ID conflicts
- Estimating RU consumption
- Validating exit topology

### Enabling Dry-Run

**CLI**:

```bash
npm run migrate:dry-run -- 005
```

**Programmatic**:

```typescript
const dryRun = process.argv.includes('--dry-run')
if (dryRun) {
    previewChanges(blueprint)
    return // Exit before seedWorld()
}
```

### Dry-Run Output

```
📋 Planned Changes:
   Locations to process: 8
   Exits to create: 14

   New Locations:
   - loc-lakeside-dock (Lakeside Dock)
     Exits: north, east, south
   - loc-fishermans-hut (Fisherman's Hut)
     Exits: west, in

💡 Dry run complete. No changes made.
```

### Limitations

Dry-run does **not**:

- Calculate exact RU consumption (no actual writes)
- Detect runtime errors in Gremlin queries (no execution)
- Validate Cosmos connectivity (only local checks)

## Idempotency

Migrations inherit bootstrap idempotency guarantees:

### Location Upsert

- Existing location with same content: **Skipped**
- Existing location with different content: **Updated** (content hash triggers upsert)
- New location: **Created**

### Exit Creation

- Existing edge with same direction: **Skipped**
- New edge: **Created**

### Re-Running Migrations

Safe to re-run a migration if:

- Initial run failed partway (network error, RU throttling)
- Content updated and you want to refresh world
- Testing migration logic iteratively

**Result**: Only new/changed data applied. No duplicates.

## Edge Cases

### Migration Interrupted Mid-Apply

**Scenario**: Script crashes after creating 3 of 8 locations.

**Recovery**:

1. Re-run migration (idempotency ensures partial state is safe)
2. Script creates remaining 5 locations
3. All exits created (edges are atomic)

**Verification**:

```bash
# Check location count
g.V().hasLabel('Location').count()

# Compare to expected total
```

### Attempt to Downgrade Schema Version

**Scenario**: Migration requires schema v1 but shared package is v2.

**Behavior**:

- Pre-flight check passes (v1 ≤ v2)
- Migration applies successfully
- New v2 fields (e.g., `attributes`) ignored (backward compatible)

**Risk**: Minimal if v2 is superset of v1. If v2 removed fields, manual review needed.

### Circular Exit Dependency

**Scenario**:

```typescript
// Location A references location B
{ id: 'loc-a', exits: [{ direction: 'north', to: 'loc-b' }] }
// Location B references location A
{ id: 'loc-b', exits: [{ direction: 'south', to: 'loc-a' }] }
```

**Behavior**: Both locations created first (upsert), then exits created (both targets exist). **No issue**.

**Problem Case**:

```typescript
// Location A references location C (not in blueprint, not in graph)
{ id: 'loc-a', exits: [{ direction: 'north', to: 'loc-c' }] }
```

**Behavior**: Pre-flight check fails (missing target).

## Best Practices

### Do's ✅

- Always run dry-run first
- Use sequential migration IDs (001, 002, 003...)
- Document migration purpose in header comment
- Test locally (memory mode) before Cosmos
- Validate exit topology visually (draw graph on paper)
- Use semantic external IDs (`lakeside_dock`, not `loc123`)

### Don'ts ❌

- Don't modify existing migration files after applied (create new migration instead)
- Don't skip pre-flight checks (comment them out)
- Don't apply migrations with `additive: false` without review
- Don't hard-code Cosmos credentials in migration files
- Don't assume migration order from filename alone (use `dependencies`)

## Destructive Migrations

**Definition**: Migrations that remove, relocate, or break existing world structure.

**Examples**:

- Removing a location (orphans exits)
- Changing location ID (breaks references)
- Removing exit (changes traversal graph)

**Pattern**:

```typescript
export const migration = {
    id: '010',
    description: 'Remove deprecated tutorial area',
    schemaVersion: 1,
    dependencies: [],
    additive: false // DESTRUCTIVE
}

// Require interactive confirmation
if (!dryRun) {
    const readline = require('readline')
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    const answer = await new Promise(resolve => {
        rl.question('⚠️  Destructive migration. Type "CONFIRM" to proceed: ', resolve)
    })
    if (answer !== 'CONFIRM') {
        console.log('Aborted.')
        process.exit(0)
    }
}

// Destructive logic...
await locationRepo.remove('loc-deprecated')
```

**Recommendation**: Avoid destructive migrations. Prefer:

- Archiving (add `archived: true` field)
- Redirects (replace location content, keep ID)
- Deprecation warnings (update description)

## Future Enhancements

### Migration Tracking Table

**Purpose**: Record applied migrations for dependency checking.

**Schema** (Cosmos SQL API):

```typescript
interface MigrationRecord {
    id: string // Migration ID (e.g., "005")
    description: string
    appliedAt: string // ISO 8601 timestamp
    appliedBy: string // User or system
    schemaVersion: number
    locationsCreated: number
    exitsCreated: number
}
```

**Container**: `migrations` (PK: `/id`)

**Usage**:

```typescript
// Check if migration already applied
const record = await migrationRepo.get('005')
if (record) {
    console.log(`Migration 005 already applied on ${record.appliedAt}`)
    process.exit(0)
}

// Record after successful application
await migrationRepo.create({
    id: migration.id,
    description: migration.description,
    appliedAt: new Date().toISOString(),
    appliedBy: 'system',
    schemaVersion: migration.schemaVersion,
    locationsCreated: result.locationVerticesCreated,
    exitsCreated: result.exitsCreated
})
```

### Rollback Support

**Concept**: Generate inverse migration for safe rollback.

**Example**:

```typescript
// Forward migration: Add location
{ id: 'loc-new', name: 'New Location', ... }

// Inverse migration (auto-generated): Remove location
await locationRepo.remove('loc-new')
```

**Challenge**: Complex for graph migrations (exit removal may orphan locations).

**Recommendation**: Defer rollback until clear use case emerges.

## Related Documentation

- [Bootstrap Script](./mosswell-bootstrap-script.md) – Initial world seeding
- [Repository Interfaces](./mosswell-repository-interfaces.md) – Persistence contracts
- [Player Bootstrap Flow](./player-bootstrap-flow.md) – Player onboarding
- [Edge Management](./edge-management.md) – Exit creation patterns
- [ADR-001: Mosswell Persistence](../adr/ADR-001-mosswell-persistence-layering.md) – Persistence model
- [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) – Partition key migration
- [Architecture Overview](../architecture/overview.md) – System context

---

**Last Updated**: 2025-10-27  
**Status**: Scaffold documented; full implementation tracked in Issue #169  
**Maintenance**: Update when migration script template stabilizes
