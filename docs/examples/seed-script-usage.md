# Example: Seed Script Usage

Practical example of populating the world with anchor locations and exits using the idempotent seed script.

---

## Purpose

Demonstrate how to initialize or reset world data (locations + exits) using the provided seed script. Safe to re-run without creating duplicates.

---

## Quick Start

### Default (In-Memory Mode)

```bash
node scripts/seed-anchor-locations.mjs
```

**What happens**:

- Loads `backend/src/data/villageLocations.json`
- Creates location vertices in memory store
- Creates exit edges between locations
- Prints summary (locations + exits processed)

---

## Usage Patterns

### 1. Seed to Cosmos DB (Production/Staging)

```bash
# Set environment variables
export PERSISTENCE_MODE=cosmos
export COSMOS_GREMLIN_ENDPOINT="wss://your-cosmos.gremlin.cosmos.azure.com:443/"
export COSMOS_GREMLIN_DATABASE="game"
export COSMOS_GREMLIN_GRAPH="world"
export COSMOS_SQL_ENDPOINT="https://your-cosmos.documents.azure.com:443/"
export COSMOS_SQL_DATABASE="game"
export COSMOS_SQL_CONTAINER_PLAYERS="players"
export COSMOS_SQL_CONTAINER_INVENTORY="inventory"
export COSMOS_SQL_CONTAINER_LAYERS="descriptionLayers"
export COSMOS_SQL_CONTAINER_EVENTS="worldEvents"

# Run seed script
node scripts/seed-anchor-locations.mjs --mode=cosmos
```

### 2. Seed Custom Data File

```bash
# Use alternative location data
node scripts/seed-anchor-locations.mjs --data=custom-locations.json
```

**Custom data format** (see `backend/src/data/villageLocations.json` for template):

```json
[
    {
        "id": "location-guid-1",
        "name": "Enchanted Forest",
        "description": "A mystical woodland shrouded in mist.",
        "exits": {
            "north": "location-guid-2",
            "east": "location-guid-3"
        }
    }
]
```

### 3. Help & Options

```bash
node scripts/seed-anchor-locations.mjs --help
```

---

## Command-Line Options

| Option          | Description                                       | Default                                  |
| --------------- | ------------------------------------------------- | ---------------------------------------- |
| `--mode=memory` | Use in-memory persistence (no Cosmos required)    | From `PERSISTENCE_MODE` env or `memory`  |
| `--mode=cosmos` | Use Cosmos DB persistence (requires env vars)     | -                                        |
| `--data=path`   | Path to JSON data file (relative to project root) | `backend/src/data/villageLocations.json` |
| `--help`, `-h`  | Show help message and exit                        | -                                        |

---

## Example Output

### Success (Memory Mode)

```
🌍 Seed Script: Anchor Locations & Exits
Mode: memory
Data: backend/src/data/villageLocations.json

📍 Processing 5 locations...
  ✅ Village Square (village-square-001)
  ✅ Market District (market-district-002)
  ✅ Blacksmith's Workshop (blacksmith-003)
  ✅ Town Hall (town-hall-004)
  ✅ Ancient Library (ancient-library-005)

🔗 Processing exits...
  ✅ Village Square → Market District (exit_north)
  ✅ Market District → Village Square (exit_south)
  ✅ Market District → Blacksmith's Workshop (exit_east)
  ✅ Blacksmith's Workshop → Market District (exit_west)
  ✅ Village Square → Town Hall (exit_west)
  ✅ Town Hall → Village Square (exit_east)
  ✅ Town Hall → Ancient Library (exit_north)
  ✅ Ancient Library → Town Hall (exit_south)

✅ Seed complete: 5 locations, 8 exits
```

### Error (Missing Cosmos Config)

```
❌ Error: COSMOS_GREMLIN_ENDPOINT is required when PERSISTENCE_MODE=cosmos
Set environment variables or use --mode=memory for local development.
```

---

## Idempotency Guarantees

The seed script is safe to re-run:

1. **Location vertices**: Checked by `id` before creation (no duplicates)
2. **Exit edges**: Checked by direction label before creation (no duplicate exits)
3. **Upsert pattern**: If entity exists, skip creation silently

**Result**: Re-running the script multiple times produces the same final state.

---

## Data File Format

### Location Schema

```json
{
    "id": "unique-guid-or-slug",
    "name": "Human-readable location name",
    "description": "Base description (immutable prose)",
    "exits": {
        "direction": "target-location-id"
    }
}
```

**Valid directions**:

- Cardinal: `north`, `south`, `east`, `west`
- Vertical: `up`, `down`
- Semantic: `in`, `out`

### Example Data File

```json
[
    {
        "id": "village-square",
        "name": "Village Square",
        "description": "The heart of the village, bustling with activity.",
        "exits": {
            "north": "market-district",
            "west": "town-hall"
        }
    },
    {
        "id": "market-district",
        "name": "Market District",
        "description": "Colorful stalls line the cobblestone streets.",
        "exits": {
            "south": "village-square",
            "east": "blacksmith-workshop"
        }
    }
]
```

---

## Exit Reciprocity

The seed script **does NOT automatically create reciprocal exits**. If you want bidirectional movement, define both directions explicitly:

```json
// Location A
{
  "id": "location-a",
  "exits": {
    "north": "location-b"
  }
}

// Location B
{
  "id": "location-b",
  "exits": {
    "south": "location-a"  // Reciprocal exit required
  }
}
```

**Rationale**: Some exits are intentionally one-way (e.g., falling into a pit, teleportation, locked doors).

---

## Troubleshooting

### Issue: "Module not found" errors

**Cause**: Missing dependencies in `backend/` or `shared/`

**Fix**:

```bash
cd shared && npm install
cd ../backend && npm install
```

### Issue: "Connection refused" to Cosmos DB

**Cause**: Invalid `COSMOS_GREMLIN_ENDPOINT` or network firewall

**Fix**:

- Verify endpoint URL (should start with `wss://`)
- Check Azure Firewall rules (allow your IP or enable public access)
- Test connectivity: `curl -I https://your-cosmos.documents.azure.com`

### Issue: "Duplicate key error" in Cosmos

**Cause**: Location ID collision (rare if using GUIDs)

**Fix**:

- Ensure all location IDs are unique in data file
- Clear Cosmos container and re-run seed

---

## Integration with CI/CD

The seed script can be integrated into deployment pipelines:

```yaml
# .github/workflows/deploy.yml (example)
- name: Seed production data
  env:
      PERSISTENCE_MODE: cosmos
      COSMOS_GREMLIN_ENDPOINT: ${{ secrets.COSMOS_ENDPOINT }}
      # ... other secrets ...
  run: |
      node scripts/seed-anchor-locations.mjs --mode=cosmos
```

---

## Related Examples

- [Example: Gremlin Traversal Query](./gremlin-traversal-query.md)
- [Example: Azure Function Endpoint](./function-endpoint-player.md)

---

## Related Documentation

| Topic                  | Document                                          |
| ---------------------- | ------------------------------------------------- |
| Seed Script Acceptance | `../developer-workflow/seed-script-acceptance.md` |
| Exit Invariants        | `../concept/exits.md`                             |
| Navigation Module      | `../design-modules/navigation-and-traversal.md`   |
| Partition Strategy     | `../adr/ADR-002-graph-partition-strategy.md`      |
| Local Dev Setup        | `../developer-workflow/local-dev-setup.md`        |

---

_Last updated: 2025-11-07 (initial creation for MECE documentation hierarchy)_
