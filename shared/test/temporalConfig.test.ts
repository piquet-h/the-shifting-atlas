import assert from 'node:assert'
import { describe, test } from 'node:test'
import { getTemporalConfig } from '../src/temporal/config.js'

describe('TemporalConfig', () => {
    describe('default configuration', () => {
        test('loads with default values when no env vars set', () => {
            // This test assumes no temporal env vars are set in the test environment
            const config = getTemporalConfig()

            assert.strictEqual(config.epsilonMs, 300000, 'epsilon should default to 5 minutes')
            assert.strictEqual(config.slowThresholdMs, 3600000, 'slowThreshold should default to 1 hour')
            assert.strictEqual(config.compressThresholdMs, 86400000, 'compressThreshold should default to 1 day')
            assert.strictEqual(config.driftRate, 1.0, 'driftRate should default to 1.0')
            assert.strictEqual(config.waitMaxStepMs, 1800000, 'waitMaxStep should default to 30 minutes')
            assert.strictEqual(config.slowMaxStepMs, 600000, 'slowMaxStep should default to 10 minutes')
        })
    })

    describe('singleton behavior', () => {
        test('returns same instance on multiple calls', () => {
            const config1 = getTemporalConfig()
            const config2 = getTemporalConfig()

            assert.strictEqual(config1, config2, 'should return same instance')
        })
    })

    describe('configuration structure', () => {
        test('has all required fields', () => {
            const config = getTemporalConfig()

            assert.ok('epsilonMs' in config)
            assert.ok('slowThresholdMs' in config)
            assert.ok('compressThresholdMs' in config)
            assert.ok('driftRate' in config)
            assert.ok('waitMaxStepMs' in config)
            assert.ok('slowMaxStepMs' in config)
        })

        test('all threshold values are numbers', () => {
            const config = getTemporalConfig()

            assert.strictEqual(typeof config.epsilonMs, 'number')
            assert.strictEqual(typeof config.slowThresholdMs, 'number')
            assert.strictEqual(typeof config.compressThresholdMs, 'number')
            assert.strictEqual(typeof config.driftRate, 'number')
            assert.strictEqual(typeof config.waitMaxStepMs, 'number')
            assert.strictEqual(typeof config.slowMaxStepMs, 'number')
        })

        test('values satisfy ordering constraints', () => {
            const config = getTemporalConfig()

            assert.ok(config.epsilonMs < config.slowThresholdMs, 'epsilon < slowThreshold')
            assert.ok(config.slowThresholdMs < config.compressThresholdMs, 'slowThreshold < compressThreshold')
        })

        test('values are positive or non-negative as required', () => {
            const config = getTemporalConfig()

            assert.ok(config.epsilonMs > 0, 'epsilonMs is positive')
            assert.ok(config.slowThresholdMs > 0, 'slowThresholdMs is positive')
            assert.ok(config.compressThresholdMs > 0, 'compressThresholdMs is positive')
            assert.ok(config.driftRate >= 0, 'driftRate is non-negative')
            assert.ok(config.waitMaxStepMs > 0, 'waitMaxStepMs is positive')
            assert.ok(config.slowMaxStepMs > 0, 'slowMaxStepMs is positive')
        })
    })
})
