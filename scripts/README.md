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
- `--mode=memory|cosmos` - Persistence mode (default: from PERSISTENCE_MODE env or 'memory')
- `--data=path` - Path to locations JSON file (default: backend/src/data/villageLocations.json)
- `--help, -h` - Show help message

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
- Locations processed count
- Location vertices created (new only)
- Exits created (new only)
- Demo player creation status
- Elapsed time

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

## Testing

Script tests are located in `scripts/test/` directory.

Run script tests:
```bash
node --test scripts/test/*.test.mjs
```
