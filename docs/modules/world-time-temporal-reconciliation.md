# World Time & Temporal Reconciliation Framework

**Focus**: Technical implementation of coherent, persistent time simulation balancing narrative richness with multiplayer playability

**Status**: Planned (M5+)

---

## Objectives

- Enable asynchronous player actions to reconcile into a shared, consistent timeline
- Provide simulation accuracy (travel takes days, battles take minutes) without breaking playability
- Ensure locations act as temporal anchors where player timelines align
- Generate narratively rich "time passes" text when players wait or drift
- Support future episodic content (dungeons, quests) with discrete time costs

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Global World Clock                       │
│  (Continuous tick advancement, persisted in TemporalLedger)  │
└───────────────────────────┬─────────────────────────────────┘
                            │
          ┌─────────────────┼─────────────────┐
          ↓                 ↓                 ↓
    ┌─────────┐       ┌─────────┐       ┌─────────┐
    │ Player  │       │ Player  │       │ Player  │
    │ Clock 1 │       │ Clock 2 │       │ Clock N │
    └────┬────┘       └────┬────┘       └────┬────┘
         │                 │                 │
         └─────────────────┼─────────────────┘
                           ↓
                ┌──────────────────────┐
                │  Location Anchors    │
                │ (Reconciliation pts) │
                └──────────────────────┘
```

### Key Invariants

1. **World Clock never rewinds**: All events logged immutably in TemporalLedger
2. **Player Clocks advance by action duration**: Each command has a time cost
3. **Idle drift prevents paradoxes**: Inactive players advance slowly (configurable rate)
4. **Location-based reconciliation**: When players share a location, their timelines align to location's WC anchor
5. **Narrative compression**: Waiting/idle time smoothed into lore-consistent text output

---

## Core Components

### 1. WorldClockService

**Purpose**: Manage global world time progression

**API**:

```typescript
interface WorldClockService {
    // Get current world clock tick (milliseconds since epoch or game-relative)
    getCurrentTick(): Promise<number>

    // Advance world clock by duration (admin/system only)
    advanceTick(durationMs: number, reason: string): Promise<void>

    // Query world clock at specific past tick (for historical queries)
    getTickAt(timestamp: Date): Promise<number>
}
```

**Storage**:

- `worldClock` document in Cosmos SQL API (single document, PK: `/id` = `"global"`)
- Fields: `currentTick: number`, `lastAdvanced: string (ISO)`, `advancementHistory: AdvancementLog[]`

**Advancement Strategy**:

- Initial implementation: Manual advancement (dev/admin triggered)
- Future (M6+): Scheduled advancement (e.g., 1 real hour = 1 in-game hour)
- Advancement emits `World.Clock.Advanced` telemetry event

**Edge Cases**:

- Concurrent advancement attempts → optimistic concurrency control via document ETag
- Rollback requests → denied (immutable progression per tenet)

---

### 2. PlayerClockAPI

**Purpose**: Track individual player time and reconcile with world clock

**API**:

```typescript
interface PlayerClockAPI {
    // Advance player clock by action duration
    advancePlayerTime(playerId: string, durationMs: number, actionType: string): Promise<void>

    // Apply idle drift (called periodically or on reconnect)
    applyDrift(playerId: string, realTimeElapsedMs: number): Promise<void>

    // Reconcile player clock to location's world clock anchor
    reconcile(playerId: string, locationId: string): Promise<ReconciliationResult>

    // Get player's current time offset from world clock
    getPlayerOffset(playerId: string): Promise<number>
}

interface ReconciliationResult {
    playerTickBefore: number
    playerTickAfter: number
    worldClockTick: number
    reconciliationMethod: 'wait' | 'slow' | 'compress'
    narrativeText?: string // Optional "time passes" narration
}
```

**Storage**:

- Add to existing `players` container (SQL API, PK: `/id`)
- New fields: `clockTick: number`, `lastAction: string (ISO)`, `lastDrift: string (ISO)`

**Drift Calculation**:

```typescript
// Configurable drift rate (default: 1 real minute = 1 in-game minute)
const DRIFT_RATE = 1.0 // Can be tuned (e.g., 0.1 for slower drift)

function calculateDrift(realTimeElapsedMs: number): number {
    return Math.floor(realTimeElapsedMs * DRIFT_RATE)
}
```

**Reconciliation Policies**:

1. **Wait**: Player clock behind location → increment player clock to location anchor, emit "you wait" narrative
2. **Slow**: Player clock ahead by <threshold (e.g., 1 hour) → location advances to meet player (rare, for small desync)
3. **Compress**: Player clock far ahead → generate narrative summary ("days pass") and align to location

**Edge Cases**:

- Player disconnected for days → massive drift → reconciliation compresses narrative ("You lost track of time...")
- Multiple players at same location with different offsets → reconcile all to location anchor sequentially

---

### 3. LocationClockManager

**Purpose**: Maintain temporal anchors for each location

**API**:

```typescript
interface LocationClockManager {
    // Get location's current world clock anchor
    getLocationAnchor(locationId: string): Promise<number>

    // Sync location to new world clock tick (called on WC advancement)
    syncLocation(locationId: string, worldClockTick: number): Promise<void>

    // Query all players present at location at specific tick
    getOccupantsAtTick(locationId: string, tick: number): Promise<string[]> // playerIds
}
```

**Storage**:

- Add to location vertices in Gremlin graph: `clockAnchor: number` property
- Alternative (if graph updates expensive): Separate `locationClocks` SQL container (PK: `/id` = locationId)

**Synchronization**:

- On `World.Clock.Advanced` event → update all location anchors
- Batch update strategy for performance (avoid N sequential graph writes)

**Occupant Queries**:

- Cross-reference player clocks + player locations at requested tick
- Used for: "Who was here when Fred arrived?" historical queries

---

### 4. ActionRegistry

**Purpose**: Define time costs for player actions

**Status**: ✅ **IMPLEMENTED** (M3c Temporal PI-0)

**Location**: `shared/src/temporal/actionRegistry.ts`

**Data Structure**:

```typescript
interface ActionDuration {
    actionType: string
    baseDurationMs: number
    modifiers?: ActionModifier[]
}

interface ActionModifier {
    condition: string // e.g., "inventory_weight > 50"
    multiplier: number // e.g., 1.5 for encumbered movement
}
```

**Default Action Duration Table**:

| Action Type          | Base Duration | Time Unit  | Notes                              |
| -------------------- | ------------- | ---------- | ---------------------------------- |
| `move`               | 60000 ms      | 1 minute   | Standard location-to-location move |
| `move_overland`      | 3600000 ms    | 1 hour     | Long-distance overland travel      |
| `move_long_distance` | 86400000 ms   | 1 day      | Very long journey                  |
| `look`               | 5000 ms       | 5 seconds  | Quick look at current location     |
| `examine`            | 30000 ms      | 30 seconds | Detailed examination of object     |
| `rest`               | 28800000 ms   | 8 hours    | Full rest period                   |
| `battle_round`       | 6000 ms       | 6 seconds  | Single combat round (D&D standard) |
| `idle`               | 0 ms          | 0 seconds  | No time cost (drift applies)       |

**API**:

```typescript
interface IActionRegistry {
    // Get duration for action type with optional context
    getDuration(actionType: string, context?: Record<string, any>): number

    // Register new action type (admin/system)
    registerAction(action: ActionDuration): void
}
```

**Storage**:

- Initial: In-memory registry (code-defined) ✅ **IMPLEMENTED**
- Future (M6+): Cosmos SQL `actionDurations` container for runtime configuration

**Modifier Evaluation**:

- Simple condition parser supporting:
    - Comparison operators: `>`, `<`, `>=`, `<=`, `===`, `==`
    - Boolean flags: `is_wounded`, `is_encumbered`
    - Example: `inventory_weight > 50`
- Multiple modifiers applied multiplicatively: `finalDuration = baseDuration * modifier1 * modifier2`

**Unknown Action Types**:

- Returns default duration of 60000ms (1 minute)
- Emits console warning (telemetry integration pending)

**Example Usage**:

```typescript
import { ActionRegistry } from '@piquet-h/shared'

const registry = new ActionRegistry()

// Get base duration
const moveDuration = registry.getDuration('move')
// => 60000

// Get duration with context
registry.registerAction({
    actionType: 'encumbered_move',
    baseDurationMs: 60000,
    modifiers: [
        { condition: 'inventory_weight > 50', multiplier: 1.5 },
        { condition: 'is_wounded', multiplier: 2.0 }
    ]
})

const duration = registry.getDuration('encumbered_move', {
    inventory_weight: 75,
    is_wounded: true
})
// => 180000 (60000 * 1.5 * 2.0)
```

---

### 5. ReconcileEngine

**Purpose**: Implement reconciliation policies and narrative compression

**Algorithm**:

```typescript
interface ReconcileEngine {
    reconcile(playerClock: number, locationClock: number, playerId: string, locationId: string): Promise<ReconciliationResult>
}

// Pseudo-implementation
async function reconcile(playerClock: number, locationClock: number, playerId: string, locationId: string): Promise<ReconciliationResult> {
    const offset = playerClock - locationClock

    if (offset === 0) {
        // Already synchronized
        return { method: 'none', playerTickAfter: playerClock }
    }

    if (offset < 0) {
        // Player behind → WAIT policy
        const waitDuration = Math.abs(offset)
        await updatePlayerClock(playerId, locationClock)
        const narrative = await generateWaitNarrative(waitDuration)
        return {
            method: 'wait',
            playerTickBefore: playerClock,
            playerTickAfter: locationClock,
            worldClockTick: locationClock,
            narrativeText: narrative
        }
    }

    if (offset > 0 && offset < SLOW_THRESHOLD) {
        // Player slightly ahead → SLOW policy (rare, location catches up)
        await updateLocationAnchor(locationId, playerClock)
        return {
            method: 'slow',
            playerTickBefore: playerClock,
            playerTickAfter: playerClock,
            worldClockTick: playerClock
        }
    }

    // Player far ahead → COMPRESS policy
    await updatePlayerClock(playerId, locationClock)
    const narrative = await generateCompressNarrative(offset)
    return {
        method: 'compress',
        playerTickBefore: playerClock,
        playerTickAfter: locationClock,
        worldClockTick: locationClock,
        narrativeText: narrative
    }
}

const SLOW_THRESHOLD = 3600000 // 1 hour
```

**Reconciliation Triggers**:

- Player moves to new location (explicit reconcile)
- Player logs in after disconnect (reconcile to current location)
- Admin reconciliation command (manual)

**Edge Cases**:

- Two players with opposite offsets (one ahead, one behind) → reconcile each independently to location anchor
- Location with no anchor set → initialize to current world clock

---

### 6. NarrativeLayer (Temporal Compression Text Generator)

**Purpose**: Generate lore-consistent "time passes" text for waiting/drift scenarios

**Status**: ✅ **IMPLEMENTED** (M3c Temporal PI-0)

**Location**: `shared/src/temporal/narrativeLayer.ts`

**API**:

```typescript
interface INarrativeLayer {
    // Generate wait narrative (player behind, catching up)
    generateWaitNarrative(durationMs: number, context?: NarrativeContext): string

    // Generate compression narrative (player far ahead, time summarized)
    generateCompressNarrative(durationMs: number, context?: NarrativeContext): string
}

interface NarrativeContext {
    locationId: string
    locationDescription?: string
    weatherLayer?: string
    playerState?: unknown
}
```

**Implementation Strategy**:

- **Phase 1 (M3c)**: ✅ Template-based generation with duration buckets (short, medium, long, veryLong)
- **Phase 2 (M6+)**: AI-generated narrative using prompt templates
    - Input: duration, location description, player state
    - Output: Contextual narrative (e.g., "You spend the afternoon watching travelers cross the bridge...")

**AI Integration (Future Phase 2)**:

- Prompt template: "Generate a 1-2 sentence narrative describing {duration} passing at {location}. Tone: {dmPersona}. Context: {weatherLayer}."
- Caching: Store generated narratives by duration bucket + location hash for reuse
- Contextual enrichment: Weather, player state, time of day, location ambiance

---

### 7. TemporalLedger (Storage & Audit)

**Purpose**: Immutable log of all temporal events for audit, replay, and debugging

**Schema**:

```typescript
interface TemporalLedgerEntry {
    id: string // GUID
    eventType: 'WorldClockAdvanced' | 'PlayerActionAdvanced' | 'PlayerDriftApplied' | 'Reconciled'
    timestamp: string // ISO 8601
    worldClockTick: number // WC state at time of event
    actorId?: string // playerId or 'system'
    locationId?: string
    durationMs?: number
    reconciliationMethod?: 'wait' | 'slow' | 'compress'
    metadata?: Record<string, any>
}
```

**Storage**:

- Cosmos SQL API container: `temporalLedger`
- Partition key: `/scopeKey` (pattern: `wc` for world clock, `player:<id>` for player events)
- TTL: Configurable (default: 90 days for audit, then archive or delete)

**Queries**:

- Get all events for player: `SELECT * FROM c WHERE c.scopeKey = 'player:<id>' ORDER BY c.timestamp`
- Get world clock advancement history: `SELECT * FROM c WHERE c.scopeKey = 'wc' AND c.eventType = 'WorldClockAdvanced'`
- Debugging timeline: Reconstruct player's clock state at any point by replaying log

**Telemetry Integration**:

- Emit Application Insights events for real-time monitoring
- TemporalLedger provides durable audit trail (telemetry may have sampling/retention limits)

---

## Integration Points

### Player Action Flow (HTTP Function)

```typescript
// Example: HttpMovePlayer integration
async function handleMovePlayer(playerId: string, direction: string) {
    // 1. Validate direction
    const exit = await validateExit(playerId, direction)

    // 2. Get action duration from registry
    const duration = actionRegistry.getDuration('move')

    // 3. Advance player clock
    await playerClockAPI.advancePlayerTime(playerId, duration, 'move')

    // 4. Update player location (existing logic)
    await movePlayerToLocation(playerId, exit.targetLocationId)

    // 5. Reconcile player to new location's clock
    const reconciliation = await playerClockAPI.reconcile(playerId, exit.targetLocationId)

    // 6. Emit telemetry
    telemetry.trackEvent('Player.Move', {
        playerId,
        durationMs: duration,
        reconciliationMethod: reconciliation.reconciliationMethod
    })

    // 7. Return response with narrative (if reconciliation generated text)
    return {
        success: true,
        location: exit.targetLocationId,
        narrative: reconciliation.narrativeText
    }
}
```

### World Event Processing (Queue Function)

```typescript
// Example: Queue trigger for world clock advancement
async function processWorldClockAdvancement(event: WorldEvent) {
    const { durationMs, reason } = event.payload

    // 1. Advance world clock
    await worldClockService.advanceTick(durationMs, reason)

    // 2. Sync all location anchors
    const locations = await locationRepository.listAll()
    const newTick = await worldClockService.getCurrentTick()
    await Promise.all(locations.map((loc) => locationClockManager.syncLocation(loc.id, newTick)))

    // 3. Log to temporal ledger
    await temporalLedger.log({
        eventType: 'WorldClockAdvanced',
        worldClockTick: newTick,
        durationMs,
        metadata: { reason }
    })

    // 4. Emit telemetry
    telemetry.trackEvent('World.Clock.Advanced', { durationMs, reason })
}
```

### Idle Drift Application (Scheduled Task or On-Reconnect)

```typescript
// Example: Apply drift on player reconnect
async function onPlayerReconnect(playerId: string) {
    const player = await playerRepository.getById(playerId)
    const lastAction = new Date(player.lastAction)
    const now = new Date()
    const realTimeElapsed = now.getTime() - lastAction.getTime()

    // Apply drift
    await playerClockAPI.applyDrift(playerId, realTimeElapsed)

    // Reconcile to current location (if known)
    if (player.currentLocationId) {
        const reconciliation = await playerClockAPI.reconcile(playerId, player.currentLocationId)

        // Optionally send narrative to player as "catch-up" message
        if (reconciliation.narrativeText) {
            await sendMessageToPlayer(playerId, reconciliation.narrativeText)
        }
    }
}
```

---

## Telemetry Events

Add to `shared/src/telemetry.ts`:

```typescript
export enum TelemetryEvent {
    // Existing events...

    // World Clock
    WorldClockAdvanced = 'World.Clock.Advanced',
    WorldClockQueried = 'World.Clock.Queried',

    // Player Clock
    PlayerClockAdvanced = 'Player.Clock.Advanced',
    PlayerDriftApplied = 'Player.Clock.DriftApplied',
    PlayerReconciled = 'Player.Clock.Reconciled',

    // Narrative
    TemporalNarrativeGenerated = 'Temporal.Narrative.Generated'
}
```

**Event Properties**:

- `World.Clock.Advanced`: `{ durationMs, newTick, reason }`
- `Player.Clock.Advanced`: `{ playerId, actionType, durationMs, newTick }`
- `Player.Clock.DriftApplied`: `{ playerId, realTimeElapsedMs, driftMs, newTick }`
- `Player.Clock.Reconciled`: `{ playerId, locationId, method, offsetMs, narrativeGenerated }`

---

## Configuration

### Temporal Configuration Module

The temporal system configuration is centralized in `shared/src/temporal/config.ts` and provides tunable parameters for reconciliation behavior. Configuration is loaded from environment variables at startup with validation.

**Configuration Interface** (`TemporalConfig`):

```typescript
interface TemporalConfig {
    epsilonMs: number          // Silent snap window (default: 300000 = 5 minutes)
    slowThresholdMs: number    // Small nudge window (default: 3600000 = 1 hour)
    compressThresholdMs: number // Narrative compression trigger (default: 86400000 = 1 day)
    driftRate: number          // Idle drift multiplier (default: 1.0)
    waitMaxStepMs: number      // Max wait advance per reconcile (default: 1800000 = 30 minutes)
    slowMaxStepMs: number      // Max slow nudge per WC advancement (default: 600000 = 10 minutes)
}
```

**Environment Variables** (add to `backend/local.settings.json` and Azure App Settings):

```json
{
    "TEMPORAL_EPSILON_MS": "300000",
    "TEMPORAL_SLOW_THRESHOLD_MS": "3600000",
    "TEMPORAL_COMPRESS_THRESHOLD_MS": "86400000",
    "TEMPORAL_DRIFT_RATE": "1.0",
    "TEMPORAL_WAIT_MAX_STEP_MS": "1800000",
    "TEMPORAL_SLOW_MAX_STEP_MS": "600000",
    "TEMPORAL_LEDGER_TTL_DAYS": "90",
    "TEMPORAL_ENABLE_AUTO_ADVANCEMENT": "false"
}
```

**Validation Rules**:
- All time values (Ms) must be positive integers
- `driftRate` must be non-negative (0 = paused time)
- Thresholds must satisfy: `epsilonMs < slowThresholdMs < compressThresholdMs`
- Invalid configuration throws error at startup (fail-fast)

**Usage**:

```typescript
import { getTemporalConfig } from '@piquet-h/shared/temporal'

const config = getTemporalConfig() // Singleton, loads once
const offsetMs = playerClockTick - worldClockTick

if (Math.abs(offsetMs) <= config.epsilonMs) {
    // Within epsilon window - silent snap
} else if (offsetMs > 0 && offsetMs < config.slowThresholdMs) {
    // Player ahead by less than slow threshold - slow nudge
} else if (offsetMs >= config.compressThresholdMs) {
    // Player far ahead - narrative compression
}
```

**Notes**:
- Configuration requires application restart to change (no runtime reload)
- Missing environment variables use defaults (no error)
- Per-location or per-player threshold overrides are out of scope for M3c

---

## Testing Strategy

### Unit Tests

- ActionRegistry: duration lookup with modifiers
- ReconcileEngine: all three policies (wait, slow, compress)
- PlayerClockAPI: drift calculation accuracy
- NarrativeLayer: template selection by duration bucket

### Integration Tests

- Full flow: player action → clock advance → reconcile → narrative
- Multi-player scenario: two players at same location, different offsets → both reconcile
- Drift accumulation: simulate 24h offline → verify drift applied correctly

### Edge Case Tests

- Massive drift (player offline for months)
- Reconciliation race condition (two players reconcile simultaneously)
- World clock rollback attempt (should fail)

---

## Performance Considerations

### Optimization Strategies

1. **Batch Location Anchor Updates**: Update all locations in parallel when WC advances
2. **Cache Action Durations**: In-memory registry avoids repeated lookups
3. **Lazy Reconciliation**: Only reconcile on player action or location entry, not continuously
4. **Narrative Template Caching**: Reuse generated narratives for common duration buckets

### Monitoring

- Track median reconciliation latency (target: <50ms)
- Alert on drift accumulation >7 days (indicates inactive player cleanup needed)
- Monitor TemporalLedger growth (storage costs)

---

## Future Enhancements (M6+)

### Phase 2: AI-Generated Narratives

- Replace template-based NarrativeLayer with AI prompt calls
- Context-aware generation (weather, player state, location ambiance)
- Caching by duration + context hash

### Phase 3: Scheduled World Clock Advancement

- Configurable real-time → game-time ratio
- Background job advancing WC every N real minutes
- Player notifications on significant time shifts

### Phase 4: Temporal Queries & Time Travel

- "Who was at this location 3 days ago?" queries
- Event replay from TemporalLedger
- Admin time rewind (limited, audited)

### Phase 5: Episodic Time Zones (Dungeons)

- Dungeon instances with independent time flow (e.g., "time moves faster inside")
- Special reconciliation on dungeon exit

---

## Dependencies

### Existing Systems

- **World Events**: Temporal events may emit world events (e.g., "season changed")
- **Player State**: Extends existing player documents with clock fields
- **Location Model**: Adds clockAnchor property to location vertices
- **Telemetry**: Uses existing Application Insights infrastructure

### New Infrastructure

- Cosmos SQL API container: `temporalLedger` (PK: `/scopeKey`)
- Optional: Cosmos SQL API container: `locationClocks` (if not storing in graph)
- Optional: Cosmos SQL API container: `actionDurations` (for runtime config)

---

## Non-Goals (Out of Scope for MVP)

- Real-time tick synchronization (tick-based instead)
- Player-controllable time manipulation (no time spells, no rewind)
- Calendar/season system (add in M6+ if gameplay value proven)
- Cross-region time zone differences (single world time for MVP)
- Multiplayer party time coordination (M7 Multiplayer feature)

---

## Success Metrics

1. **Consistency**: 0 timeline paradoxes (player sees event before it happens)
2. **Performance**: Reconciliation latency <50ms (p95)
3. **Narrative Quality**: Player feedback on "time passes" text (manual review)
4. **Drift Accuracy**: Drift calculation error <1% over 24h period

---

## Related Documentation

| Topic                           | Document                                          |
| ------------------------------- | ------------------------------------------------- |
| Design Module (40k ft)          | `../design-modules/README.md` (World Time module) |
| World Event Contract            | `../architecture/world-event-contract.md`         |
| Player State (SQL API)          | `../architecture/cosmos-sql-containers.md`        |
| Realm Hierarchy (zones)         | `../architecture/realm-hierarchy.md`              |
| Telemetry Standards             | `../observability.md`                             |
| Multiplayer Mechanics (future)  | `../modules/multiplayer-mechanics.md`             |
| Dungeon Temporal Zones (future) | `../modules/dungeons.md`                          |

---

_Last updated: 2025-12-13 (adds realm hierarchy reference; aligns with Design Module updates)_
