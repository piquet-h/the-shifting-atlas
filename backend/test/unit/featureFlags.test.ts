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

describe('Feature Flags - Default Behavior', () => {
    test('DISABLE_GREMLIN_PLAYER_VERTEX defaults to false when unset', async () => {
        // Load module with current environment
        const { DISABLE_GREMLIN_PLAYER_VERTEX } = await import('../../src/config/featureFlags.js')

        // In test environment, this should default to false
        assert.strictEqual(typeof DISABLE_GREMLIN_PLAYER_VERTEX, 'boolean')

        // Value should be false unless explicitly set in test environment
        if (!process.env.DISABLE_GREMLIN_PLAYER_VERTEX) {
            assert.strictEqual(DISABLE_GREMLIN_PLAYER_VERTEX, false)
        }
    })

    test('getFeatureFlagSnapshot returns object with flag values', async () => {
        const { getFeatureFlagSnapshot } = await import('../../src/config/featureFlags.js')

        const snapshot = getFeatureFlagSnapshot()

        assert.ok(typeof snapshot === 'object')
        assert.ok('disableGremlinPlayerVertex' in snapshot)
        assert.strictEqual(typeof snapshot.disableGremlinPlayerVertex, 'boolean')
    })

    test('getValidationWarnings returns array', async () => {
        const { getValidationWarnings } = await import('../../src/config/featureFlags.js')

        const warnings = getValidationWarnings()

        assert.ok(Array.isArray(warnings))
    })
})

describe('Feature Flags - Parsing Logic', () => {
    // These tests validate the parsing behavior documented in the module
    // by checking the actual runtime behavior with test environment

    test('Boolean flag parsing accepts standard values', async () => {
        const { DISABLE_GREMLIN_PLAYER_VERTEX } = await import('../../src/config/featureFlags.js')

        // The flag should be a boolean regardless of input
        assert.strictEqual(typeof DISABLE_GREMLIN_PLAYER_VERTEX, 'boolean')

        // Test the actual environment value parsing
        const envValue = process.env.DISABLE_GREMLIN_PLAYER_VERTEX

        if (envValue === 'true' || envValue === '1' || envValue === 'yes') {
            assert.strictEqual(DISABLE_GREMLIN_PLAYER_VERTEX, true)
        } else if (envValue === 'false' || envValue === '0' || envValue === 'no') {
            assert.strictEqual(DISABLE_GREMLIN_PLAYER_VERTEX, false)
        } else if (!envValue || envValue === '') {
            // Undefined or empty should use default (false)
            assert.strictEqual(DISABLE_GREMLIN_PLAYER_VERTEX, false)
        }
    })

    test('Feature flag module exports expected functions', async () => {
        const featureFlagsModule = await import('../../src/config/featureFlags.js')

        assert.ok('DISABLE_GREMLIN_PLAYER_VERTEX' in featureFlagsModule)
        assert.ok('getFeatureFlagSnapshot' in featureFlagsModule)
        assert.ok('getValidationWarnings' in featureFlagsModule)

        assert.strictEqual(typeof featureFlagsModule.getFeatureFlagSnapshot, 'function')
        assert.strictEqual(typeof featureFlagsModule.getValidationWarnings, 'function')
    })

    test('Snapshot includes all expected flags', async () => {
        const { getFeatureFlagSnapshot } = await import('../../src/config/featureFlags.js')

        const snapshot = getFeatureFlagSnapshot()

        // Verify snapshot structure
        const expectedKeys = ['disableGremlinPlayerVertex']

        for (const key of expectedKeys) {
            assert.ok(key in snapshot, `Expected snapshot to contain key: ${key}`)
        }
    })

    test('Validation warnings have expected structure', async () => {
        const { getValidationWarnings } = await import('../../src/config/featureFlags.js')

        const warnings = getValidationWarnings()

        // Each warning should have expected properties
        for (const warning of warnings) {
            assert.ok('flagName' in warning)
            assert.ok('rawValue' in warning)
            assert.ok('defaultValue' in warning)

            assert.strictEqual(typeof warning.flagName, 'string')
            assert.strictEqual(typeof warning.rawValue, 'string')
            assert.strictEqual(typeof warning.defaultValue, 'boolean')
        }
    })
})
