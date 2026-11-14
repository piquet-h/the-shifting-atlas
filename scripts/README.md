# Scripts

Utility scripts for development, maintenance, and repo automation.

## Script map (what’s still relevant)

This repo intentionally keeps a small set of scripts that are either:

- **CI automation** (run in GitHub Actions)
- **Operator/developer tools** (run locally for maintenance)

If a script is not referenced by npm scripts, GitHub workflows, or documentation, it should be treated as a candidate for deletion.

## Available scripts

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

### `analyze-implicit-exits.mjs`

Scans location descriptions for directional language patterns and reports directions that are narratively implied but not yet represented as explicit exits or `exitAvailability` entries.

**Usage:**

```bash
node scripts/analyze-implicit-exits.mjs [--data=path] [--output=report.json]
```

**Options:**

- `--data=<path>` — Path to locations JSON file relative to project root (default: `backend/src/data/villageLocations.json`)
- `--output=<path>` — Write JSON report to file instead of stdout
- `--help, -h` — Show help message

**Output format (stdout or file):**

```json
{
  "scannedAt": "...",
  "summary": { "totalLocations": 34, "totalCandidates": 0, ... },
  "candidates": [
    {
      "locationId": "...",
      "locationName": "...",
      "direction": "north",
      "evidencePhrase": "…to the north, hills rise…",
      "confidence": "medium",
      "suggestedAvailability": "pending"
    }
  ],
  "skipped": []
}
```

**Pattern detection:**

- **Forbidden indicators** (high confidence): "sheer cliffs block passage west", "impassable north", "no way through east"
- **Pending indicators** (medium confidence): "to the north", "northward", "rises toward the south", "stretches beyond east"
- **Pending indicators** (low confidence): "distant mountains north", "far to the west"

Directions already covered by a hard exit, `exitAvailability.pending`, or `exitAvailability.forbidden` are automatically skipped.

**Workflow:**

```
1. node scripts/analyze-implicit-exits.mjs --output=report.json
2. Curator reviews report → edits scripts/implicit-exits-additions.json
3. node scripts/apply-implicit-exits.mjs --dry-run   # preview
4. node scripts/apply-implicit-exits.mjs             # apply
5. git diff → review → commit
```

---

### `apply-implicit-exits.mjs`

Merges curated additions from `scripts/implicit-exits-additions.json` into `villageLocations.json` without overwriting existing exits or `exitAvailability` entries.

**Usage:**

```bash
node scripts/apply-implicit-exits.mjs [--data=path] [--additions=path] [--dry-run]
```

**Options:**

- `--data=<path>` — Path to locations JSON file relative to project root (default: `backend/src/data/villageLocations.json`)
- `--additions=<path>` — Path to curated additions JSON (default: `scripts/implicit-exits-additions.json`)
- `--dry-run` — Preview proposed changes without modifying any file
- `--help, -h` — Show help message

**Additions JSON format** (`scripts/implicit-exits-additions.json`):

```json
[
    {
        "locationId": "<uuid>",
        "direction": "north",
        "availability": "pending",
        "reason": "Open countryside awaiting exploration"
    },
    {
        "locationId": "<uuid>",
        "direction": "west",
        "availability": "forbidden",
        "reason": "Sheer cliffs block passage",
        "motif": "cliff",
        "reveal": "onLook"
    }
]
```

**Safety guarantees:**

- Hard exits are never overwritten
- Existing `exitAvailability.pending` / `.forbidden` entries are never overwritten
- Additions for unknown `locationId` values are skipped with a warning
- All entries are validated before any writes

**Manual review workflow:**

1. Run `analyze-implicit-exits.mjs` to generate a candidate report
2. Copy relevant candidates into `scripts/implicit-exits-additions.json`, editing `reason`, `motif`, and `reveal` as appropriate
3. Run `apply-implicit-exits.mjs --dry-run` to preview
4. Run `apply-implicit-exits.mjs` to apply
5. Review `git diff backend/src/data/villageLocations.json` before committing

---

### `scan-exits-consistency.mjs`

Detects structural anomalies in the location graph (dangling exits, orphan locations).

**Usage:**

```bash
node scripts/scan-exits-consistency.mjs [--output=report.json] [--seed-locations=loc1,loc2]
```

---

### `render-boundary-map.mjs`

Renders an internal Mermaid map (similar mental model to `/api/world/graph`) focused on frontier boundaries, and flags pending directions that may point inward toward town using a geometric heuristic.

**Usage:**

```bash
node scripts/render-boundary-map.mjs [--data=path] [--scope=boundary|full] [--output=map.mmd] [--json=report.json]
```

**Options:**

- `--data=<path>` — Seed data JSON file (default: `backend/src/data/villageLocations.json`)
- `--scope=boundary|full` — Boundary-focused view (default: `boundary`) or full graph
- `--output=<path>` — Write Mermaid diagram to file (stdout if omitted)
- `--json=<path>` — Write structured finding report to file

**Example:**

```bash
# Generate boundary-focused mermaid + JSON findings
node scripts/render-boundary-map.mjs --scope=boundary --output=/tmp/mosswell-boundaries.mmd --json=/tmp/mosswell-boundaries.json
```

**Notes:**

- This is an **internal review aid**; it does not modify seed data.
- Pending directions are tagged as `outward`, `borderline`, or `suspect-inward` for human curation.
- Great pre-flight step before editing frontier `exitAvailability.pending` or running production reseed.

---

### `long-reach-authoring.mjs`

Validates the unified Schema v1 authoring overlay sidecar, renders a two-panel SVG and full-canvas PNG preview over `the-long-reach.jpg`, and generates the next-to-author expansion queue report.

```bash
npm run map:long-reach
npm run map:mosswell
npm run map:mosswell -- --world-graph=/tmp/world-graph.json
npm run report:long-reach -- --world-graph=/tmp/world-graph.json --signals=/tmp/frontier-events.json --format=json
node --test scripts/test/long-reach-authoring*.test.mjs
```

The single source contract is [the-long-reach-authoring-overlay.json](../docs/architecture/the-long-reach-authoring-overlay.json), validated against [long-reach-authoring-overlay.schema.json](../docs/architecture/long-reach-authoring-overlay.schema.json):

- `authoringState`: `authored` (green), `transition-ready` (blue), `next-to-author` (amber), `blocked` (red), or `inspiration-only` (dashed slate).
- `coverage`: `complete`, `partial`, or `none`, maintained independently of runtime readiness.
- `authoringReadiness`: reviewed `AreaReadinessState` snapshot (`ready`, `partial`, `blocked`, `deferred`) — required except on `inspiration-only` entries. `transition-ready` means `partial`, never an automatically open boundary.
- `geometry`: normalized `marker`, `line`, or `polygon` coordinates in `[0, 1]`, approximate for planning rather than GIS.
- `entryAnchorId`, `areaRefs`, `corridorRefs`, `barrierRefs`, `entrySegmentRef`: validated against `theLongReachMacroAtlas.json` and `villageLocations.json` before rendering or reporting.

`npm run map:long-reach` regenerates **both** tracked artifacts from the sidecar:

1. `docs/architecture/the-long-reach-authoring-overlay.svg` — deterministic, lightweight (<35 KB) two-panel vector view combining the full Long Reach overview on the left with a 4.5× zoomed Milford Sound / Mosswell Fiordhead inset (including the river trace feeding Mosswell, village-scale settlement marker, legend, and static queue summary) on the right.
2. `docs/architecture/the-long-reach-authoring-overlay.png` — `2240×1696` full-canvas raster preview rendered via Playwright so GitHub PRs and Markdown previews show the complete map without relative-image stripping or viewport cropping. Pass `--no-png` when running custom SVG-only test outputs.

`npm run map:mosswell` regenerates the `1:50,000` Milford Sound / Mosswell Fiordhead district overlay (`docs/architecture/mosswell-fiordhead-overlay.svg` and `2400×1536` `.png`) over the CC-BY 4.0 LINZ NZTopo50 CB08 base map (`docs/architecture/mosswell-fiordhead-topo50.jpg`), plotting the ~230m × 290m Mosswell hamlet street graph alongside any player-expanded rooms/edges from `--world-graph=<path>` and reporting walkable district + landmass exploration percentages.

The queue command (`npm run report:long-reach`) lists `next-to-author` candidates ordered outward from authored Mosswell anchors, and accepts an optional JSON array of Application Insights events:

```json
[
    {
        "name": "World.Frontier.BoundaryReached",
        "customDimensions": {
            "sourceAreaRef": "lr-area-mosswell-fiordhead",
            "dir": "east",
            "destinationAreaRef": "lr-area-eastfall-foothills",
            "destinationReadiness": "partial",
            "entrySegmentRef": "lr-area-braidwater-basin"
        }
    }
]
```

Non-ready `World.Frontier.BoundaryReached` and `World.Frontier.BoundaryApproach` signals roll up onto their canonical outbound transition, rank pressured candidates ahead of static priority, and dynamically promote any `blocked` or `transition-ready` boundary that receives live player pressure. Markdown is the default report format; use `--format=json` for structured output.

---

### `verify-deployable.mjs`

Verifies the project is deployable (checks for file-based dependencies and other issues).

**Usage:**

```bash
node scripts/verify-deployable.mjs
```

---

### `package-backend-function.mjs`

Stages a standalone Azure Functions archive at `backend/.deploy` with production-only dependencies, non-symlinked `@piquet-h/shared`, and compiled-test leak assertions.

```bash
npm run package:backend
```

---

### CI & CD scope / handoff scripts

- `pr-validation-scope.mjs` — computes affected PR validation lanes (`--base` / `--head`) or deploy-unit scope since `deployed-<unit>` (`--deploy-unit <backend|frontend|infrastructure>`).
- `pr-validation-bicep.mjs` — compiles Bicep templates offline with zero Azure credentials and runs advisory workbook drift checks.
- `release-handoff.mjs` — advances `deployed-<unit>` tags after green production deploys and transitions referenced `#NNN` issues to `state:testing`.

---

### `milestone-board.mjs` & `board-pulse.mjs`

GitHub-native milestone Kanban flow (`state:new` → `state:ready` → `state:in-progress` → `state:testing` → closed):

```bash
npm run board:snapshot
node scripts/milestone-board.mjs refine --max 2 --apply
node scripts/milestone-board.mjs dispatch-ready --max 1 --worker 1 --apply
node scripts/milestone-board.mjs release-claims --run-id <id> --attempt <n> --apply
node scripts/board-pulse.mjs prove --offset 24h --apply
node scripts/board-pulse.mjs sense --offset 24h --apply --create-bugs
```

---

### `verify-instructions.mjs`

Repo hygiene check for instruction/prompt docs (freshness, deprecated patterns) used by CI.

**Usage:**

```bash
node scripts/verify-instructions.mjs
```

---

### `generate-concept-issues.mjs`

Generates concept issues (used by GitHub Actions).

**Usage:**

```bash
node scripts/generate-concept-issues.mjs
```

---

### Milestone automation (GitHub Actions)

These scripts maintain the milestone description “delivery slices” format.

- `ensure-milestone-has-delivery-slices.mjs`
- `reanalyze-milestone.mjs`

Recommended usage:

- Use `ensure-milestone-has-delivery-slices.mjs` to bootstrap a milestone that has no `## Delivery slices` section yet.
- Use `reanalyze-milestone.mjs` after issue CRUD within an existing milestone to preserve slice ordering, refresh the impact report, and surface gaps conservatively.

Drift control note: milestone descriptions are kept in sync deterministically on issue changes (milestoned/demilestoned/edited/closed/reopened).

They are designed primarily for CI usage; see workflow files under `.github/workflows/`.

---

### Prompt registry tooling

- `validate-prompts.mjs` — schema + secret scanning for prompt templates
- `bundle-prompts.mjs` — produce `prompts.bundle.json`
- `migrate-prompts-v2.mjs` — one-time migration helper (manual; see `scripts/MIGRATION_SCRIPT_README.md`)

---

### AI cost telemetry tooling

- `verify-ai-cost-payload.mjs` — schema guardrails for AI cost telemetry payloads
- `simulate-ai-cost.mjs` — local harness that generates synthetic AI cost events

---

### Cosmos SQL partition distribution tooling

#### `validate-partition-distribution.ts`

Analyzes **document distribution** by the container’s partition key.

**Usage:**

```bash
npm run validate:partitions
npm run validate:partitions -- --container players
npm run validate:partitions -- --format csv > partition-report.csv
npm run validate:partitions -- --dry-run
```

Notes:

- This script reports **document-count distribution**, not RU/operation hotness.
- Use Application Insights / Azure metrics for RU and latency hot partition analysis.

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

## Removed scripts

These scripts were deleted because they were redundant or misleading:

- `validate-package-refs.mjs` — redundant with `verify-deployable.mjs` (which already validates `file:` dependency patterns)
- `migrate-prompts.mjs` — superseded; created incorrect prompt IDs compared to the current prompt registry

## Testing

Script tests are located in `scripts/test/` directory.

Run script tests:

```bash
node --test scripts/test/*.test.mjs
```
