/**
 * Feature Flag Tests
 *
 * Validates feature flag parsing, validation, and startup behavior.
 *
 * Note: These tests cannot truly test dynamic reload of the feature flags module
 * because the module is evaluated once on import and the flag values are constants.
 * These tests validate the parsing logic through different scenarios but use
 * separate test processes or describe blocks to isolate environment state.
 */
import assert from 'node:assert'
import { describe, test } from 'node:test'

// Post ADR-004: dual persistence feature flag removed. Retain minimal API surface.
describe('Feature Flags - SQL-only model', () => {
    test('getFeatureFlagSnapshot returns empty object', async () => {
        const { getFeatureFlagSnapshot } = await import('../../src/config/featureFlags.js')
        const snapshot = getFeatureFlagSnapshot()
        assert.ok(typeof snapshot === 'object')
        assert.strictEqual(Object.keys(snapshot).length, 0, 'Snapshot should be empty after flag removal')
    })

    test('getValidationWarnings returns empty array', async () => {
        const { getValidationWarnings } = await import('../../src/config/featureFlags.js')
        const warnings = getValidationWarnings()
        assert.ok(Array.isArray(warnings))
        assert.strictEqual(warnings.length, 0)
    })

    test('module exports expected functions only', async () => {
        const featureFlagsModule = await import('../../src/config/featureFlags.js')
        assert.ok('getFeatureFlagSnapshot' in featureFlagsModule)
        assert.ok('getValidationWarnings' in featureFlagsModule)
        assert.strictEqual(typeof featureFlagsModule.getFeatureFlagSnapshot, 'function')
        assert.strictEqual(typeof featureFlagsModule.getValidationWarnings, 'function')
        // Removed legacy flag constant should not exist
        assert.ok(!('DISABLE_GREMLIN_PLAYER_VERTEX' in featureFlagsModule))
    })
})
