# Player Bootstrap Flow

> **Status**: Implemented (M0 Foundation)  
> **Functions**: `backend/src/functions/bootstrapPlayer.ts`, `backend/src/functions/playerGet.ts`  
> **Architecture**: Dual persistence (Cosmos SQL for player state, Gremlin for world graph)

## Purpose

Document the complete sequence for initializing a new player from first HTTP request through successful world entry, including identity creation, persistence, and initial location assignment.

## High-Level Flow

```
1. Client → POST /api/player/bootstrap
2. Backend → Create GUID + persist to Cosmos SQL
3. Client ← Return { playerId }
4. Client → GET /api/player/{playerId}
5. Backend → Fetch player from SQL + assign Mosswell entrance
6. Client ← Return { playerId, displayName, currentLocationId }
7. Client → GET /api/location/look?playerId={id}
8. Backend → Query Gremlin for location + exits
9. Client ← Return { location, exits }
```

## Detailed Sequence

### Step 1: Bootstrap Request

**Endpoint:** `POST /api/player/bootstrap`  
**Auth Level:** Anonymous (guest creation)  
**Payload:** Empty (or optional `{ displayName }`)

**Handler:** `backend/src/functions/bootstrapPlayer.ts`

**Operations:**

1. Generate UUID v4 for player ID
2. Create player document in Cosmos SQL (`players` container):
    ```json
    {
        "id": "<uuid>",
        "displayName": "Traveler <short-id>",
        "createdUtc": "2025-10-24T...",
        "currentLocationId": null,
        "inventory": []
    }
    ```
3. Emit telemetry: `Player.Bootstrap` (success/failure)

**Response:**

```json
{
    "playerId": "a1b2c3d4-...",
    "message": "Player created successfully"
}
```

**Error Cases:**

-   Duplicate ID (extremely rare; retry with new GUID)
-   Cosmos write failure (503)

### Step 2: Get Player State

**Endpoint:** `GET /api/player/{playerId}`  
**Auth Level:** Anonymous (rate-limited per Section 0.6 future)  
**Parameters:** `playerId` (UUID)

**Handler:** `backend/src/functions/playerGet.ts`

**Operations:**

1. Validate UUID format (400 if invalid)
2. Fetch player document from Cosmos SQL by partition key (`/id`)
3. If `currentLocationId` is null:
    - Assign Mosswell entrance location (query Gremlin for `externalId='mosswell_entrance'`)
    - Update player document with location
4. Emit telemetry: `Player.Get` (includes whether location was assigned)

**Response:**

```json
{
    "playerId": "a1b2c3d4-...",
    "displayName": "Traveler 3d4",
    "currentLocationId": "loc-mosswell-entrance-uuid",
    "inventory": []
}
```

**Error Cases:**

-   Player not found (404)
-   Mosswell entrance missing from graph (500 — critical setup error)
-   Cosmos read failure (503)

### Step 3: Initial LOOK

**Endpoint:** `GET /api/location/look?playerId={id}`  
**Auth Level:** Anonymous  
**Parameters:** `playerId` (UUID)

**Handler:** `backend/src/functions/locationLook.ts`

**Operations:**

1. Fetch player from Cosmos SQL (to get `currentLocationId`)
2. Query Gremlin graph for location vertex by ID
3. Query Gremlin for all exit edges from location
4. Generate exits summary cache (ordered: N/S/E/W/NE/NW/SE/SW/U/D/In/Out)
5. Emit telemetry: `Navigation.Look.Issued`

**Response:**

```json
{
    "location": {
        "id": "loc-mosswell-entrance-uuid",
        "name": "Mosswell Entrance",
        "description": "A weathered stone archway marks the entrance...",
        "kind": "entrance"
    },
    "exitsSummary": "Exits: north, east"
}
```

**Error Cases:**

-   Player not found (404)
-   Location vertex missing (500 — data consistency error)
-   No exits (returns "No exits available.")

## Identity & Persistence

### Player ID Generation

**Format:** UUID v4 (RFC 4122)  
**Example:** `a1b2c3d4-5678-4abc-8def-0123456789ab`

**Implementation:**

```typescript
function generatePlayerId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
    })
}
```

**Why UUID v4:**

-   No central coordination required (stateless generation)
-   Collision probability negligible (<10⁻³⁰ for millions of players)
-   Partition-friendly for Cosmos SQL (`/id` partition key)

### Cosmos SQL Schema

**Container:** `players`  
**Partition Key:** `/id`  
**TTL:** None (players persist indefinitely)

**Document Structure:**

```typescript
interface PlayerDocument {
    id: string // UUID v4 (partition key)
    displayName: string // Default: "Traveler <suffix>"
    currentLocationId: string | null // Location UUID (assigned on first GET)
    inventory: string[] // Item IDs (empty initially)
    createdUtc: string // ISO 8601 timestamp
    lastActiveUtc?: string // Optional activity tracking
}
```

### Initial Location Assignment

**Strategy:** Lazy assignment on first `GET /api/player/{id}`

**Why not during bootstrap:**

-   Decouples player creation from world state (bootstrap can succeed even if Gremlin unavailable)
-   Allows world reseeding without invalidating player records
-   Simplifies error handling (bootstrap failures don't leave orphaned location assignments)

**Mosswell Entrance Lookup:**

```gremlin
g.V().has('externalId', 'mosswell_entrance').id()
```

**Fallback:** If entrance missing, bootstrap fails with 500 (requires world seeding per Issue #12)

## Telemetry Checkpoints

| Event                    | When               | Dimensions                            | Purpose                               |
| ------------------------ | ------------------ | ------------------------------------- | ------------------------------------- |
| `Player.Bootstrap`       | POST /bootstrap    | `playerId`, `success`                 | Track new player creation rate        |
| `Player.Get`             | GET /player/{id}   | `playerId`, `locationAssigned`        | Track first-time vs returning players |
| `Navigation.Look.Issued` | GET /location/look | `playerId`, `locationId`, `exitCount` | Track world exploration               |

**Correlation:** All events in single bootstrap flow share same `correlationId` (HTTP request ID).

## Security Considerations

### Rate Limiting (Future — Issue #42)

**Bootstrap endpoint:** Limit to 10 requests/minute per IP to prevent GUID exhaustion attacks.

**Validation:**

-   Reject `displayName` >50 chars (XSS prevention)
-   Sanitize special characters in player input fields

### Authentication Flow (Future — Issue #171)

Current: Anonymous guest access (MVP)  
Planned: OAuth2 + persistent identity linking (M2)

## Error Handling

### Transient Failures

**Cosmos throttling (429):**

-   Retry with exponential backoff (max 3 attempts)
-   Emit telemetry: `Persistence.Throttled`

**Network timeout:**

-   Return 503 Service Unavailable
-   Log correlation ID for debugging

### Permanent Failures

**Invalid UUID format:**

-   Return 400 Bad Request with validation message
-   Do NOT retry

**Missing world data:**

-   Return 500 Internal Server Error
-   Alert ops (critical: world not seeded)

## Integration Testing

**Scenario 1: Happy Path**

```typescript
// Given: Empty player database
const bootstrapRes = await POST('/api/player/bootstrap')
expect(bootstrapRes.status).toBe(200)
const { playerId } = bootstrapRes.body

// When: Fetch player
const getRes = await GET(`/api/player/${playerId}`)
expect(getRes.status).toBe(200)
expect(getRes.body.currentLocationId).toBeTruthy()

// Then: LOOK succeeds
const lookRes = await GET(`/api/location/look?playerId=${playerId}`)
expect(lookRes.status).toBe(200)
expect(lookRes.body.location.name).toBe('Mosswell Entrance')
```

**Scenario 2: Missing Entrance**

```typescript
// Given: Mosswell entrance not seeded
const bootstrapRes = await POST('/api/player/bootstrap')
const { playerId } = bootstrapRes.body

// When: Fetch player (triggers location assignment)
const getRes = await GET(`/api/player/${playerId}`)

// Then: 500 error (critical world state issue)
expect(getRes.status).toBe(500)
expect(getRes.body.error).toContain('Mosswell entrance not found')
```

## Performance Targets

| Operation             | Target (p95) | Measurement                                 |
| --------------------- | ------------ | ------------------------------------------- |
| Bootstrap             | <200ms       | Player document write                       |
| Get (cached location) | <100ms       | SQL read only                               |
| Get (assign location) | <300ms       | SQL read + Gremlin query + SQL write        |
| LOOK                  | <200ms       | SQL read + Gremlin query (location + exits) |

**Optimization Notes:**

-   Player fetch uses point read (partition key + ID) — fastest Cosmos operation
-   Exit query limited to 50 edges per location (prevent runaway queries)
-   Consider caching Mosswell entrance ID in memory (reduces Gremlin query)

## Troubleshooting

| Symptom                    | Likely Cause                       | Fix                                                 |
| -------------------------- | ---------------------------------- | --------------------------------------------------- |
| Bootstrap returns 503      | Cosmos SQL unavailable             | Check Managed Identity permissions, verify endpoint |
| Get returns 404            | Player ID typo or not bootstrapped | Validate UUID format, check SQL container           |
| Get returns 500 (entrance) | World not seeded                   | Run seed script (Issue #12)                         |
| LOOK returns empty exits   | Exit edges missing                 | Verify seed script provisioned exits                |

## Related Documentation

-   [Local Dev Setup](./local-dev-setup.md) — Cosmos connection configuration
-   [Architecture Overview](../architecture/overview.md) — Dual persistence model
-   [ADR-002: Graph Partition Strategy](../adr/ADR-002-graph-partition-strategy.md) — Why `/id` partition key
-   [Player-Location Edge Migration](../architecture/player-location-edge-migration.md) — Future graph-based player positioning
-   Issue #12 — World seed script (provides Mosswell entrance)
-   Issue #42 — Rate limiting implementation
-   Issue #171 — Auth flow integration

---

**Last Updated:** 2025-10-24
