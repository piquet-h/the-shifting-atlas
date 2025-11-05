# Scripts

Utility scripts for development, maintenance, and operations.

## Available Scripts

### `seed-anchor-locations.mjs`

Idempotent seeding of anchor locations and exits for the world graph. Safe to re-run multiple times.

**Usage:**

```bash
node scripts/seed-anchor-locations.mjs [options]
```

**Options:**

-   `--mode=memory|cosmos` - Persistence mode (default: from PERSISTENCE_MODE env or 'memory')
-   `--data=path` - Path to locations JSON file relative to project root (default: backend/src/data/villageLocations.json). For security, only files within the project directory can be loaded.
-   `--help, -h` - Show help message

**Examples:**

```bash
# Seed to in-memory store (default)
node scripts/seed-anchor-locations.mjs

# Seed to Cosmos DB
PERSISTENCE_MODE=cosmos node scripts/seed-anchor-locations.mjs

# Seed custom data file
node scripts/seed-anchor-locations.mjs --data=custom-locations.json
```

**Output:**

-   Locations processed count
-   Location vertices created (new only)
-   Exits created (new only)
-   Demo player creation status
-   Elapsed time

**See also:** `docs/developer-workflow/local-dev-setup.md` for detailed documentation.

---

### `scan-exits-consistency.mjs`

Detects structural anomalies in the location graph (dangling exits, orphan locations).

**Usage:**

```bash
node scripts/scan-exits-consistency.mjs [--output=report.json] [--seed-locations=loc1,loc2]
```

---

### `validate-package-refs.mjs`

Validates package reference patterns in package.json files.

**Usage:**

```bash
node scripts/validate-package-refs.mjs
```

---

### `verify-deployable.mjs`

Verifies the project is deployable (checks for file-based dependencies and other issues).

**Usage:**

```bash
node scripts/verify-deployable.mjs
```

---

### `mosswell-migration.mjs`

Scaffolding script for consistent world data migrations with safety checks. Supports dry-run mode, duplicate ID detection, and schema version validation.

**Usage:**

```bash
node scripts/mosswell-migration.mjs [options]
```

**Options:**

-   `--data=path` - Path to migration data JSON file (required)
-   `--dry-run` - Preview changes without applying them
-   `--mode=memory|cosmos` - Persistence mode (default: from PERSISTENCE_MODE env or 'memory')
-   `--schema-version=N` - Expected minimum schema version (default: 1)
-   `--help, -h` - Show help message

**Migration Data Format:**

```json
{
  "schemaVersion": 3,
  "migrationName": "add-new-district",
  "locations": [ ... Location objects ... ]
}
```

**Examples:**

```bash
# Dry-run preview
node scripts/mosswell-migration.mjs --data=scripts/migrations/example-migration.json --dry-run

# Apply migration to memory store
node scripts/mosswell-migration.mjs --data=scripts/migrations/example-migration.json

# Apply to Cosmos DB with schema version check
PERSISTENCE_MODE=cosmos node scripts/mosswell-migration.mjs \
  --data=scripts/migrations/001-new-district.json \
  --schema-version=3
```

**Exit Codes:**

-   0 - Success
-   1 - Configuration or validation error
-   2 - Duplicate ID detected
-   3 - Schema version mismatch

**Safety Features:**

-   Pre-checks for duplicate IDs
-   Schema version validation (prevents downgrades)
-   Dry-run mode for previewing changes
-   Idempotent operations (safe to re-run)
-   Path traversal protection

**See also:** Example migration at `scripts/migrations/example-migration.json`

---

## Testing

Script tests are located in `scripts/test/` directory.

Run script tests:

```bash
node --test scripts/test/*.test.mjs
```
