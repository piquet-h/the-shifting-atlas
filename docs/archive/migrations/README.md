# Archived Migration Scripts

This directory contains historical one-time migration scripts that are no longer executable due to codebase changes.

## gremlin-to-sql-migration.ts

**Purpose**: One-time backfill of player vertices from Gremlin graph to Cosmos SQL API during dual persistence implementation (M2 Data Foundations milestone).

**Status**: ARCHIVED (2025-11-17)

**Why archived**:

-   Gremlin player write methods removed in issue #519 (complete cutover to SQL-only player persistence)
-   Script depends on `CosmosPlayerRepository.getOrCreate()` and other write methods that no longer exist
-   Migration completed successfully; all active players migrated to SQL API
-   Retained for historical reference only

**Original location**: `backend/scripts/migrations/gremlin-to-sql-migration.ts`

**Migration completed**: 2025-11-17 (M2 Data Foundations milestone)

**Dependencies that no longer exist**:

-   `CosmosPlayerRepository.getOrCreate()` - Removed
-   `CosmosPlayerRepository.update()` - Removed
-   Gremlin player vertex write operations - All removed

**If you need to reference this script**: Review for migration patterns or data mapping logic, but do not attempt to execute. All player persistence now flows through `CosmosPlayerRepositorySql` only.
