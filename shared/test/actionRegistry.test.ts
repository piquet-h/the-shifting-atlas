import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionRegistry } from '../src/temporal/actionRegistry.js'

// ---------------------------------------------------------------------------
// Happy path: get duration for known action types
// ---------------------------------------------------------------------------
test('getDuration: returns base duration for known action without context', () => {
    const registry = new ActionRegistry()

    // Initial actions defined in spec
    assert.equal(registry.getDuration('move'), 60000) // 1 minute
    assert.equal(registry.getDuration('look'), 5000) // 5 seconds
    assert.equal(registry.getDuration('examine'), 30000) // 30 seconds
    assert.equal(registry.getDuration('rest'), 28800000) // 8 hours
    assert.equal(registry.getDuration('battle_round'), 6000) // 6 seconds
    assert.equal(registry.getDuration('idle'), 0) // 0 seconds
    assert.equal(registry.getDuration('move_overland'), 3600000) // 1 hour
    assert.equal(registry.getDuration('move_long_distance'), 86400000) // 1 day
})

// ---------------------------------------------------------------------------
// Modifier evaluation: single modifier
// ---------------------------------------------------------------------------
test('getDuration: applies single modifier when condition matches', () => {
    const registry = new ActionRegistry()

    // Register action with modifier
    registry.registerAction({
        actionType: 'encumbered_move',
        baseDurationMs: 60000, // 1 minute base
        modifiers: [{ condition: 'inventory_weight > 50', multiplier: 1.5 }]
    })

    // Should apply 1.5x multiplier when condition true
    const durationHeavy = registry.getDuration('encumbered_move', { inventory_weight: 75 })
    assert.equal(durationHeavy, 90000) // 60000 * 1.5

    // Should not apply multiplier when condition false
    const durationLight = registry.getDuration('encumbered_move', { inventory_weight: 25 })
    assert.equal(durationLight, 60000) // Base duration
})

// ---------------------------------------------------------------------------
// Modifier evaluation: multiple modifiers (multiplicative)
// ---------------------------------------------------------------------------
test('getDuration: applies multiple modifiers multiplicatively', () => {
    const registry = new ActionRegistry()

    registry.registerAction({
        actionType: 'modified_move',
        baseDurationMs: 60000, // 1 minute base
        modifiers: [
            { condition: 'inventory_weight > 50', multiplier: 1.5 },
            { condition: 'is_wounded', multiplier: 2.0 }
        ]
    })

    // Both conditions true: 60000 * 1.5 * 2.0 = 180000
    const duration = registry.getDuration('modified_move', {
        inventory_weight: 75,
        is_wounded: true
    })
    assert.equal(duration, 180000)
})

// ---------------------------------------------------------------------------
// Unknown action type: returns default + emits warning
// ---------------------------------------------------------------------------
test('getDuration: returns default duration for unknown action type', () => {
    const registry = new ActionRegistry()

    // Unknown action should return default (60000ms = 1 minute per spec)
    const duration = registry.getDuration('unknown_action')
    assert.equal(duration, 60000)
})

// ---------------------------------------------------------------------------
// Register new action
// ---------------------------------------------------------------------------
test('registerAction: adds new action type to registry', () => {
    const registry = new ActionRegistry()

    // Register custom action
    registry.registerAction({
        actionType: 'custom_action',
        baseDurationMs: 45000 // 45 seconds
    })

    // Should be retrievable
    const duration = registry.getDuration('custom_action')
    assert.equal(duration, 45000)
})

test('registerAction: updates existing action type', () => {
    const registry = new ActionRegistry()

    // Get original duration
    const originalDuration = registry.getDuration('move')
    assert.equal(originalDuration, 60000)

    // Update the action
    registry.registerAction({
        actionType: 'move',
        baseDurationMs: 90000 // 1.5 minutes
    })

    // Should return new duration
    const newDuration = registry.getDuration('move')
    assert.equal(newDuration, 90000)
})

// ---------------------------------------------------------------------------
// Edge case: invalid modifier condition syntax
// ---------------------------------------------------------------------------
test('getDuration: skips modifier with invalid condition syntax', () => {
    const registry = new ActionRegistry()

    registry.registerAction({
        actionType: 'invalid_modifier_test',
        baseDurationMs: 60000,
        modifiers: [
            { condition: 'invalid syntax @#$', multiplier: 2.0 }, // Invalid
            { condition: 'valid_flag', multiplier: 1.5 } // Valid
        ]
    })

    // Should apply only the valid modifier
    const duration = registry.getDuration('invalid_modifier_test', { valid_flag: true })
    assert.equal(duration, 90000) // 60000 * 1.5 (invalid modifier skipped)
})

// ---------------------------------------------------------------------------
// Edge case: context-less call with modifiers defined
// ---------------------------------------------------------------------------
test('getDuration: returns base duration when no context provided but modifiers exist', () => {
    const registry = new ActionRegistry()

    registry.registerAction({
        actionType: 'contextual_action',
        baseDurationMs: 60000,
        modifiers: [{ condition: 'some_condition', multiplier: 2.0 }]
    })

    // Without context, should return base duration
    const duration = registry.getDuration('contextual_action')
    assert.equal(duration, 60000)
})
