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
- `--data=path` - Path to locations JSON file relative to project root (default: backend/src/data/villageLocations.json). For security, only files within the project directory can be loaded.
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

### `cleanup-test-artifacts.mjs`

Identifies and optionally deletes test-created artifacts from Cosmos SQL containers (players, inventory) and reports potential worldEvents with test scope keys. Dry-run by default.

**Usage:**

```bash
node scripts/cleanup-test-artifacts.mjs --mode=cosmos --dry-run
```

**Options:**

- `--mode=memory|cosmos` Persistence mode (default: env or memory)
- `--dry-run` Preview only (default)
- `--confirm` Perform deletions (requires safety interlocks)
- `--containers=a,b` Limit to specific containers (e.g. players,inventory)
- `--export=path.json` Write matched artifact metadata before deletion
- `--concurrency=N` Parallel delete limit (default 10)
- `--allow-prod-token` Override production endpoint safety block

**Safety Interlocks:**

- Refuses destructive run on endpoints whose host name contains `prod` or `primary` without `--allow-prod-token`
- Always requires `--confirm` for deletions
- World events are not deleted (append-only ledger retained for auditing)

**Detection Heuristics (initial):**

- ID prefixes: `test-loc-`, `e2e-test-loc-`, `e2e-`, `test-player-`, `demo-player-`
- PlayerDocs inferred from recent world events (scopeKey / actor IDs)
- Inventory items derived from matched test player IDs
- World events matched by scopeKey containing `test` / `e2e` (reported only)

**Examples:**

```bash
# Export then delete players & inventory
node scripts/cleanup-test-artifacts.mjs --mode=cosmos --containers=players,inventory \
  --export=/tmp/test-artifacts.json --confirm --allow-prod-token
```

**Future Enhancements:**

- Direct PlayerDoc listing for exhaustive scan
- Event retention deletion when policy formalized
- Gremlin vertex/edge cleanup pass (needs traversal safeguards)

---

### `cleanup-old-players.mjs`

Identifies and optionally deletes **stale player documents** from the Cosmos SQL `players` container.

**Safety defaults:**

- Dry-run by default (no deletions without `--confirm`)
- Deletes only **guest-like** identities by default (to reduce false positives)
    - guest-like = `externalId` missing OR `externalId` is a GUID
    - linked = `externalId` present AND NOT a GUID (excluded unless `--include-linked`)
- Refuses destructive runs against endpoints that look production unless `--allow-prod-token`

**Usage:**

```bash
node scripts/cleanup-old-players.mjs --mode=cosmos --dry-run
```

**Common options:**

- `--cutoff-days=N` Players with last-seen older than N days are eligible (default: 90)
- `--strategy=max|updatedUtc|lastAction` Which timestamp to use for last-seen calculation
- `--export=path.json` Export candidates + summary to JSON
- `--max-results=N|all` Cap scan size (default: 5000; use `all` to scan everything)
- `--delete-inventory` Also delete inventory items for deleted players

**Example:**

```bash
# Preview candidates older than 180 days
node scripts/cleanup-old-players.mjs --mode=cosmos --cutoff-days=180 --export=/tmp/old-players.json --dry-run

# Delete them (guest-like identities only, by default)
node scripts/cleanup-old-players.mjs --mode=cosmos --cutoff-days=180 --delete-inventory --confirm --allow-prod-token
```

---

### `observability/export-workbooks.mjs`

Exports Application Insights workbook definitions to version-controlled JSON files.

**Usage:**

```bash
node scripts/observability/export-workbooks.mjs
```

**Purpose:**

- Read workbook configuration from `docs/observability/workbooks-index.json`
- Export current workbook definitions from Azure (or local source for MVP)
- Normalize JSON: remove volatile fields, sort keys, stable formatting
- Write to `docs/observability/workbooks/<slug>.workbook.json`

**When to Use:**

- After creating a new workbook in Azure Portal
- After modifying queries, thresholds, or visualizations
- Before committing workbook changes to ensure sync

**Exit Codes:**

- 0 - All workbooks exported successfully (or skipped with placeholder IDs)
- 1 - One or more exports failed

**See also:** `docs/observability/workbooks.md` for detailed workflow documentation.

---

### `observability/verify-workbooks.mjs`

Verifies that committed workbook files match current export state (drift detection).

**Usage:**

```bash
node scripts/observability/verify-workbooks.mjs
```

**Purpose:**

- Prevent drift between Azure workbook definitions and version-controlled files
- Run manually or in CI to catch uncommitted workbook changes

**Exit Codes:**

- 0 - All workbooks match committed state
- 1 - Drift detected (re-export needed)

**See also:** `docs/observability/workbooks.md` for workflow details.

---

## Testing

Script tests are located in `scripts/test/` directory.

Run script tests:

```bash
node --test scripts/test/*.test.mjs
```
