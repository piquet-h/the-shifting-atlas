# Exit Availability Implementation Summary

## Overview

This implementation extends exit representation to distinguish between three states:
- **hard**: Exit exists and is traversable
- **pending**: Exit is valid but awaiting generation
- **forbidden**: Direction is permanently blocked (never generate)

## Changes Made

### 1. Shared Package Types (`shared/src/exitAvailability.ts`)

Created comprehensive type definitions:
- `ExitAvailability` type: `'hard' | 'pending' | 'forbidden'`
- `ExitInfo` interface: Complete exit information including availability state
- `ExitAvailabilityMetadata` interface: Pending/forbidden direction metadata
- `determineExitAvailability()`: Logic to determine availability state with precedence rules
- `buildExitInfoArray()`: Converts location exits to ExitInfo array

**Precedence Rules** (handles data integrity errors):
1. Hard exits take precedence over forbidden/pending
2. Forbidden takes precedence over pending
3. Unknown/not configured returns undefined

### 2. Domain Model Updates

**LocationNode** (`shared/src/domainModels.ts`):
```typescript
export interface LocationNode {
    // ... existing fields
    exitAvailability?: {
        pending?: Partial<Record<Direction, string>>
        forbidden?: Partial<Record<Direction, string>>
    }
}
```

**Location** (`shared/src/location.ts`):
```typescript
export interface Location {
    // ... existing fields
    exitAvailability?: {
        pending?: Record<string, string>
        forbidden?: Record<string, string>
    }
}
```

### 3. Handler Updates

**LocationLookHandler** (`backend/src/handlers/locationLook.ts`):
- Updated to return `ExitInfo[]` instead of simple direction arrays
- Uses `buildExitInfoArray()` to convert location exits
- Backward compatible: works with locations without exitAvailability metadata

**MoveHandler** (`backend/src/handlers/moveCore.ts`):
- Updated `MoveResult` interface to use `ExitInfo[]`
- Added TODO comment for forbidden direction check (requires persistence integration)
- Returns `ExitInfo[]` for destination location after successful move

### 4. Tests

**Unit Tests** (`shared/test/exitAvailability.test.ts`):
- Type guard validation
- Availability determination logic
- ExitInfo array building
- Serialization/deserialization
- Edge cases from acceptance criteria

**Edge Case Tests** (`shared/test/exitAvailability.edgeCases.test.ts`):
- Forbidden direction behavior
- Data integrity errors (hard + forbidden, hard + pending, etc.)
- Backward compatibility (no metadata, empty metadata)
- State transitions (pending → hard)
- Telemetry warning scenarios

**Integration Tests** (`backend/test/integration/exitAvailability.handlers.test.ts`):
- Look handler returns ExitInfo with availability states
- Move handler returns ExitInfo for destination
- Backward compatibility validation
- JSON serialization validation

## Acceptance Criteria Status

✅ **Shared API contract** can express exit availability (hard|pending|forbidden) with optional reason string
✅ **Backend move/look responses** include exit availability for current location (no additional round-trips)
✅ **"Pending" is distinct** from "no exit exists"
⏳ **"Forbidden" directions** never enqueue generation hints (TODO added, requires persistence integration)
✅ **Unit tests** cover serialization/typing for all three availability states

### Edge Cases Addressed

✅ **Location has no exits field** → treated as "unknown/none visible", no pending implied
✅ **Direction is both forbidden and has hard exit** → hard wins (data error, should emit warning)
✅ **Pending exit becomes hard** → client handles gracefully (state transition tested)

## Out of Scope (As Specified)

- Any new UI/UX behavior
- Any new queue processor for generation
- Persistence layer integration (exitAvailability not yet wired from storage)

## Next Steps for Full Integration

1. **Persistence Layer**:
   - Update repository implementations to read/write exitAvailability metadata
   - Add migration for existing locations (optional field)

2. **Forbidden Direction Logic**:
   - Implement the TODO in moveCore.ts to check forbidden before emitting generation hints
   - Add telemetry warning when hard exit conflicts with forbidden (data integrity)

3. **Pending State Management**:
   - Add logic to transition pending → hard when generation completes
   - Clean up pending entries after successful generation

4. **Queue Processing**:
   - Update exit generation hint processor to check forbidden directions
   - Skip processing if direction is forbidden

## API Response Format

### Before (Legacy)
```json
{
  "exits": [
    { "direction": "north", "description": "..." },
    { "direction": "south" }
  ]
}
```

### After (With Exit Availability)
```json
{
  "exits": [
    {
      "direction": "north",
      "availability": "hard",
      "toLocationId": "abc-123",
      "description": "..."
    },
    {
      "direction": "south",
      "availability": "pending",
      "reason": "unexplored"
    },
    {
      "direction": "up",
      "availability": "forbidden",
      "reason": "solid ceiling"
    }
  ]
}
```

## Backward Compatibility

- All exitAvailability fields are optional
- Locations without metadata only return hard exits
- Existing tests continue to work
- Response format extends gracefully (ExitInfo is superset of old format)

## Testing Strategy

- **Unit**: Pure logic and type validation (shared package)
- **Integration**: Handler behavior and response format (backend package)
- **Edge Cases**: Data integrity and state transitions

## Files Changed

### Added
- `shared/src/exitAvailability.ts` (new types and logic)
- `shared/test/exitAvailability.test.ts` (unit tests)
- `shared/test/exitAvailability.edgeCases.test.ts` (edge case tests)
- `backend/test/integration/exitAvailability.handlers.test.ts` (integration tests)
- This summary document

### Modified
- `shared/src/index.ts` (export new types)
- `shared/src/domainModels.ts` (LocationNode.exitAvailability)
- `shared/src/location.ts` (Location.exitAvailability)
- `backend/src/handlers/locationLook.ts` (use ExitInfo[])
- `backend/src/handlers/moveCore.ts` (use ExitInfo[], add TODO)

## Risk Mitigation (DATA-MODEL)

- **Optional fields**: No breaking changes to existing data
- **Backward compatibility tests**: Validate old locations work
- **Precedence rules**: Handle data integrity errors gracefully
- **TODO comments**: Document pending integration points
- **Comprehensive tests**: Cover all three states and edge cases
