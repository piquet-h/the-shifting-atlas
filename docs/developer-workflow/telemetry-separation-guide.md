# Telemetry Separation Reference for Issue Authors

**CRITICAL**: When creating issues that involve telemetry, you MUST specify which telemetry system is appropriate.

## Two Separate Systems

### 1. Build Telemetry (CI/Automation)
- **File**: `scripts/shared/build-telemetry.mjs`
- **Use for**: Implementation order automation, scheduling, variance tracking, CI workflows
- **Event prefix**: `build.` (e.g., `build.ordering_applied`)
- **Destination**: GitHub Actions logs + artifacts
- **NOT Application Insights**

### 2. Game Telemetry (Domain Events)
- **File**: `shared/src/telemetry.ts`
- **Use for**: Player actions, world generation, navigation, AI interactions, gameplay events
- **Event format**: `Domain.Subject.Action` (e.g., `Player.Get`, `Location.Move`)
- **Destination**: Application Insights
- **NOT GitHub artifacts**

## Issue Template Checklist

When creating issues involving telemetry, include:

```markdown
## Telemetry Specification

- [ ] **Build telemetry** - Use `scripts/shared/build-telemetry.mjs`
  - Events: `build.<event_name>` format
  - Destination: GitHub artifacts
  - Examples: ordering automation, scheduling, CI metrics

- [ ] **Game telemetry** - Use `shared/src/telemetry.ts`
  - Events: `Domain.Subject.Action` format
  - Destination: Application Insights
  - Examples: player actions, world events, gameplay

**Selected**: [Build / Game]
**Rationale**: [Why this telemetry system?]
```

## Common Mistakes to Avoid

❌ **DON'T**:
- Add build events to `shared/src/telemetryEvents.ts`
- Add game events to `scripts/shared/build-telemetry.mjs`
- Use Application Insights for build/CI metrics
- Mix `build.` prefix with `Domain.Subject.Action` format

✅ **DO**:
- Always specify telemetry system in acceptance criteria
- Use correct file and event naming for each system
- Reference `docs/developer-workflow/build-telemetry.md` for clarification
- Ask maintainers if unsure which system applies

## Example Issue Text

### Bad (Ambiguous):
```
Add telemetry event names for ordering automation to telemetryEvents.ts
```

### Good (Clear):
```
Add build telemetry event names for ordering automation to `scripts/shared/build-telemetry.mjs` (NOT `shared/src/telemetryEvents.ts` which is game domain only).

Events to add:
- `build.ordering_applied`
- `build.ordering_low_confidence`
- `build.ordering_overridden`

**Telemetry System**: Build (CI/Automation)
**Rationale**: These events track implementation order automation workflow, which is infrastructure/CI, not game domain.
```

## Quick Decision Tree

1. Is this event about **game content** (players, locations, world, NPCs)?
   → **Game telemetry** (`shared/src/telemetry.ts`)

2. Is this event about **build/CI/automation** (workflows, scheduling, ordering)?
   → **Build telemetry** (`scripts/shared/build-telemetry.mjs`)

3. Still unsure?
   → Check `docs/developer-workflow/build-telemetry.md`
   → Ask in issue comments

## References

- [Build Telemetry Documentation](../developer-workflow/build-telemetry.md)
- [Copilot Instructions (Section 6)](../../.github/copilot-instructions.md#6-telemetry)
- [Build Telemetry Module](../../scripts/shared/build-telemetry.mjs)
- [Game Telemetry Events](../../shared/src/telemetryEvents.ts)
