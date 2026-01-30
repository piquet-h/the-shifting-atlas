# Hero-Prose Layer Convention

> STATUS: DEFINED (2026-01-15). Provides a convention for replacing base descriptions with AI-generated "hero prose" without mutating seed JSON files. Uses existing `LayerType` infrastructure.

## Summary

Hero-prose layers enable cached, cohesive first-look descriptions by storing AI-generated prose in the `descriptionLayers` container. They use the existing `dynamic` layer type with special metadata flags to indicate replace-base semantics.

## Goals

- Enable AI-generated location descriptions that feel cohesive and polished
- Preserve immutability of seed JSON files (base descriptions remain unchanged)
- Use existing layer infrastructure (no new LayerType enum values)
- Support deterministic layer selection when multiple hero layers exist
- Provide clear fallback behavior when hero layers are missing or invalid

## Convention

### Layer Identification

A hero-prose layer is identified by:

```typescript
{
  layerType: 'dynamic',
  metadata: {
    replacesBase: true,
    role: 'hero',
    promptHash: '<hash-of-prompt-template-used>'
  }
}
```

**Field semantics:**

- `layerType: 'dynamic'` — Uses existing structural event layer type
- `metadata.replacesBase: true` — Signals that this layer should replace (not append to) the base description
- `metadata.role: 'hero'` — Identifies this as a hero-prose layer (distinguishes from other replacesBase scenarios)
- `metadata.promptHash` — Hash of the prompt template used to generate this prose (for idempotency and versioning)

### Idempotency Strategy

Hero-prose layers use composite idempotency based on:

1. **Scope:** `scopeId = 'loc:<locationId>'` (location-specific)
2. **Type:** `layerType = 'dynamic'`
3. **Role:** `metadata.role = 'hero'`
4. **Prompt Version:** `metadata.promptHash = '<hash>'`

**Uniqueness constraint:** At most one hero-prose layer per `(scopeId, promptHash)` combination should exist at any given time.

**Write semantics:**

- When generating new hero prose with a specific prompt, check for existing layer with same `(scopeId, promptHash)`
- If exists and valid, reuse it (idempotent)
- If exists but invalid/outdated, replace it with new layer
- Multiple hero layers with different `promptHash` values may coexist (e.g., during prompt evolution)

### Content Constraints

Hero-prose layers must adhere to strict content policies:

**Length:**

- Target: 1–2 paragraphs
- Hard limit: ≤1200 characters
- Rationale: Provides enough room for vivid description without overwhelming players

**Semantic constraints:**

- **No new structural facts:** Hero prose elaborates on existing location attributes but introduces no permanent new entities
- **Atmospheric only:** Focus on mood, sensory details, and contextual flourishes
- **Canon-safe:** Must not contradict location attributes or established lore

**Example (valid):**

```
The marketplace square sprawls before you, its cobblestones worn smooth by
countless footfalls. Morning light slants through the gaps between timber-
framed buildings, casting long shadows across vendor stalls already bustling
with activity. The mingled scents of fresh bread, spiced wine, and tanned
leather drift on the breeze.
```

**Example (invalid - introduces new fact):**

```
The marketplace square sprawls before you, dominated by a massive bronze
fountain depicting the city's founder.
```

_(Invalid: introduces "bronze fountain" not in location attributes)_

## Assembly Behavior

### Replace-Base Semantics

When a hero-prose layer is active:

1. Base description from `Location.description` is **replaced** (not appended to)
2. Hero-prose content becomes the new foundation
3. Other active layers (ambient, structural events) are applied **on top** of hero prose
4. Supersede masking still applies (structural events can mask hero-prose sentences)

**Assembly order with hero-prose:**

```
Hero Prose (if active) → Structural Events → Ambient → Enhancement
```

**Assembly order without hero-prose (fallback):**

```
Base Description → Structural Events → Ambient → Enhancement
```

### Fallback Behavior

Hero-prose layers are **optional**. Fallback occurs when:

1. **No hero layer exists:** Use base description from `Location.description`
2. **Hero layer invalid:** Treat as if no hero layer exists
    - Empty string or whitespace-only content
    - Content exceeds 1200 character limit
    - Missing required metadata fields
3. **Multiple hero layers:** Use deterministic selection rule (see below)

### Multiple Hero Layers (Edge Case)

If multiple hero-prose layers are active for the same location:

**Selection priority (deterministic):**

1. **Most recent `authoredAt` timestamp** wins
    - Rationale: Newer prompt templates produce better prose as AI models improve
    - Allows gradual rollout of improved hero prose without breaking existing content

2. **Tie-breaker:** Lexicographic sort by `id` (GUID)
    - Ensures deterministic selection even if timestamps are identical

**Example:**

```typescript
// Two hero-prose layers exist
layer1: { authoredAt: '2026-01-10T10:00:00Z', id: 'aaa-111' }
layer2: { authoredAt: '2026-01-15T14:00:00Z', id: 'bbb-222' }

// layer2 is selected (more recent)
```

## Implementation Notes

### DescriptionComposer Integration

The `DescriptionComposer` service must be updated to:

1. Detect hero-prose layers among fetched layers
2. When hero-prose layer is present and valid:
    - Use hero-prose content as the "effective base"
    - Skip using `options.baseDescription`
3. Apply existing supersede masking and layer assembly logic unchanged

### Telemetry

Track hero-prose usage with event metadata:

```typescript
telemetryService.trackGameEvent('Description.Compile', {
    locationId,
    hasHeroProse: true, // New field
    heroProseFallback: false // New field - true if hero layer was invalid
    // ... existing fields
})
```

### Future: Prompt Registry

This convention is designed to be forward-compatible with a future **Prompt Registry** system:

- `metadata.promptHash` will reference versioned prompt templates
- Registry will track prompt evolution and rollback capabilities
- Hero-prose layers generated from deprecated prompts can be batch-regenerated

**Out of scope for this convention:**

- Automatic prompt versioning
- Agent sandbox validate/apply patterns
- Batch regeneration tooling

## Testing Strategy

### Unit Tests

Test layer identification and selection logic:

- ✅ Identify hero-prose layer by metadata flags
- ✅ Reject layers missing required metadata
- ✅ Select most recent layer from multiple candidates
- ✅ Fallback to base when no valid hero layer exists

### Integration Tests

Test compilation behavior with hero-prose:

- ✅ Hero-prose replaces base description
- ✅ Other layers apply on top of hero prose
- ✅ Supersede masking works with hero-prose base
- ✅ Fallback to base description when hero layer invalid
- ✅ Empty/whitespace hero layer triggers fallback
- ✅ Multiple hero layers use deterministic selection

### Edge Cases

- Empty hero-prose content → fallback
- Whitespace-only hero-prose → fallback
- Multiple hero layers with same timestamp → lexicographic tie-break
- Hero layer with malformed metadata → fallback
- Hero layer exceeding length limit → fallback (or truncate, policy decision)

## Security Considerations

### Content Validation

Hero-prose layers must pass same validation as structural layers:

- Content policy checks (profanity, disallowed themes)
- XSS/injection prevention (escaped on render)
- No embedding of player-specific data in shared hero prose

### Idempotency Protection

The `(scopeId, promptHash)` idempotency key prevents:

- Duplicate hero-prose generation for same location + prompt
- Wasted AI API calls
- Storage bloat from redundant layers

**Caveat:** Different prompt versions will create separate layers. Cleanup of obsolete hero-prose layers is a future operational concern.

## Related Documents

- [Description Layering & Variation](../design-modules/description-layering-and-variation.md) — Overall layering model
- [Layer Overlap Policy](./layer-overlap-policy.md) — Temporal layer management
- Epic: #735 (Prompt Registry & Versioning)

## Revision History

- 2026-01-15: Initial convention defined (issue #TBD)
