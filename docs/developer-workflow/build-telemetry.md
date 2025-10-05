# Build Telemetry

This document describes the separation between build automation telemetry and game domain telemetry in The Shifting Atlas project.

## Overview

The project maintains **two completely separate telemetry systems**:

1. **Build Telemetry** (`scripts/shared/build-telemetry.mjs`) - CI/automation workflows
2. **Game Telemetry** (`shared/src/telemetry.ts`) - In-game domain events

**This separation is critical and must never be mixed.**

## Why Separation Matters

- **Different Audiences**: Build telemetry is for developers/maintainers; game telemetry is for players/designers
- **Different Lifecycles**: Build failures vs runtime game events
- **Cleaner Queries**: Separate data enables focused dashboards without noise
- **Infrastructure vs Domain**: Build telemetry is infrastructure; game telemetry is domain logic
- **Different Destinations**: Build telemetry uses GitHub artifacts; game telemetry uses Application Insights

## Build Telemetry (`scripts/shared/build-telemetry.mjs`)

### Purpose
Tracks CI/automation workflows including:
- Implementation order automation (Stage 1)
- Provisional scheduling (Stage 2)
- Schedule variance tracking
- Variance alerts

### Event Naming Convention
All build events use the `build.` prefix with snake_case:
- `build.ordering_applied`
- `build.ordering_low_confidence`
- `build.ordering_overridden`
- `build.schedule_variance`
- `build.provisional_schedule_created`
- `build.variance_alert`

### Custom Dimensions
All build telemetry events include:
```javascript
{
    telemetrySource: 'build-automation',
    telemetryType: 'ordering' | 'scheduler' | 'variance',
    stage: 1 | 2,
    timestamp: ISO8601 string
}
```

### Storage
Build telemetry stays within the GitHub ecosystem:
- Console logs (GitHub Actions logs)
- Artifact files (JSON export)
- **Does NOT use Application Insights**

### Usage Example

```javascript
import { 
    initBuildTelemetry, 
    trackOrderingApplied, 
    flushBuildTelemetry 
} from './shared/build-telemetry.mjs'

// Initialize at script start
initBuildTelemetry()

// Track events
trackOrderingApplied({
    issueNumber: 123,
    recommendedOrder: 42,
    confidence: 'high',
    score: 150,
    changes: 3,
    strategy: 'auto',
    scope: 'scope:core',
    type: 'feature',
    milestone: 'M0'
})

// Flush to artifact at script end
await flushBuildTelemetry(process.env.TELEMETRY_ARTIFACT)
```

## Game Telemetry (`shared/src/telemetry.ts`)

### Purpose
Tracks in-game domain events:
- Player actions (movement, inventory)
- World generation
- AI interactions
- Navigation events
- Extension hooks
- Multiplayer synchronization

### Event Naming Convention
Game events use `Domain.Subject.Action` format with PascalCase (2-3 segments):
- `Player.Get`
- `Location.Move`
- `World.Location.Generated`
- `Command.Executed`
- `Navigation.Input.Ambiguous`

### Storage
- **Application Insights ONLY**
- NOT in GitHub artifacts
- NOT in console logs (except local dev)

### Location
- **Exclusively in `shared/src/` folder** (game domain code)
- Never in `scripts/` folder (build/automation code)

## Separation Rules (CRITICAL)

### DO NOT:
1. ❌ Add build events to `shared/src/telemetryEvents.ts` (game domain only)
2. ❌ Add game events to `scripts/shared/build-telemetry.mjs` (build automation only)
3. ❌ Use Application Insights for build telemetry (GitHub artifacts only)
4. ❌ Mix `build.` prefix with `Domain.Subject.Action` format
5. ❌ Put build automation code in `shared/src/` folder
6. ❌ Put game domain code in `scripts/` folder

### DO:
1. ✅ Use `scripts/shared/build-telemetry.mjs` for ALL CI/automation events
2. ✅ Use `shared/src/telemetry.ts` for ALL game domain events
3. ✅ Keep build events with `build.` prefix
4. ✅ Keep game events with `Domain.Subject.Action` format
5. ✅ Use GitHub artifacts for build telemetry export
6. ✅ Use Application Insights for game telemetry only

## Querying Telemetry

### Build Telemetry (GitHub Artifacts)

```bash
# View weekly metrics
npm run metrics:weekly

# Check ordering integrity
npm run check:ordering-integrity

# Detect overrides
node scripts/detect-ordering-overrides.mjs
```

Artifacts are stored in `artifacts/ordering/*.json` with retention of last 200 files.

### Game Telemetry (Application Insights)

```kusto
customEvents
| where customDimensions.telemetrySource != "build-automation"
| where name startswith "Player." or name startswith "Location." or name startswith "World."
| summarize count() by name
```

To filter out build events:
```kusto
customEvents
| where customDimensions.telemetrySource != "build-automation"
```

## Event Catalog

### Build Events (Stage 1 Ordering)

| Event Name | When Emitted | Key Properties |
|------------|--------------|----------------|
| `build.ordering_applied` | High confidence order applied | `issueNumber`, `confidence`, `score`, `changes` |
| `build.ordering_low_confidence` | Medium/low confidence (no auto-apply) | `issueNumber`, `confidence`, `reason`, `scope`, `type`, `milestone` |
| `build.ordering_overridden` | Manual change within 24h of automation | `issueNumber`, `previousOrder`, `manualOrder`, `hoursSinceAutomation` |

### Build Events (Stage 2 Scheduling)

| Event Name | When Emitted | Key Properties |
|------------|--------------|----------------|
| `build.provisional_schedule_created` | Provisional schedule calculated | `issueNumber`, `provisionalStart`, `provisionalFinish`, `confidence` |
| `build.schedule_variance` | Variance detected vs provisional | `issueNumber`, `overallVariance`, `startDelta`, `finishDelta` |
| `build.variance_alert` | Alert created/updated/closed | `alertType`, `period`, `variance`, `threshold` |

## Rationale

The separation prevents:
1. **Pollution**: Infrastructure noise doesn't contaminate game analytics
2. **Confusion**: Clear boundary between build and runtime concerns
3. **Cost**: Application Insights pricing doesn't include CI noise
4. **Performance**: Game telemetry initialization doesn't load build dependencies
5. **Maintenance**: Independent evolution of build and game telemetry

## Migration Notes

**For contributors**: If you find build/CI events in `shared/src/telemetryEvents.ts` or game events in `scripts/shared/build-telemetry.mjs`, this is a violation of the separation rule and should be corrected immediately.

**Historical context**: Early development mixed these concerns. The separation was formalized in Stage 2 planning (see `docs/planning/stage2-subissues/06-telemetry-integration.md`).

## Related Documentation

- [Implementation Order Automation](./implementation-order-automation.md) - Stage 1 ordering system
- [Roadmap Scheduling](./roadmap-scheduling.md) - Stage 2 scheduling system
- [`scripts/shared/README.md`](../../scripts/shared/README.md) - Build automation modules
- [`shared/src/telemetryEvents.ts`](../../shared/src/telemetryEvents.ts) - Game event catalog

## Troubleshooting

### "Why is my event not showing up in Application Insights?"

Check: Are you using build telemetry (`scripts/shared/build-telemetry.mjs`)? Build events go to GitHub artifacts, NOT Application Insights.

### "Why is my game event appearing in CI logs?"

Check: Are you using game telemetry (`shared/src/telemetry.ts`) in a build script? Build scripts should only use build telemetry.

### "Can I use both systems in the same file?"

No. Files in `scripts/` use build telemetry only. Files in `shared/src/` use game telemetry only. There should be no overlap.
