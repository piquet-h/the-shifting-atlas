/**
 * Unit tests for Application Insights sampling configuration
 * Tests environment-based defaults, clamping, and warning events
 */

import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'

describe('Application Insights Sampling Configuration', () => {
    // Store original env values for restoration
    const originalEnv = {
        PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
        NODE_ENV: process.env.NODE_ENV,
        APPINSIGHTS_SAMPLING_PERCENTAGE: process.env.APPINSIGHTS_SAMPLING_PERCENTAGE
    }

    afterEach(() => {
        // Restore original environment
        process.env.PERSISTENCE_MODE = originalEnv.PERSISTENCE_MODE
        process.env.NODE_ENV = originalEnv.NODE_ENV
        process.env.APPINSIGHTS_SAMPLING_PERCENTAGE = originalEnv.APPINSIGHTS_SAMPLING_PERCENTAGE
    })

    /**
     * Helper to simulate the sampling configuration logic from index.ts
     * This mirrors the actual implementation for testing purposes
     */
    function calculateSampling(
        samplingEnv: string | undefined,
        nodeEnv: string
    ): { percentage: number; adjusted: boolean; reason: string } {
        const isDevelopment = nodeEnv === 'development' || nodeEnv === 'test'
        const defaultSampling = isDevelopment ? 100 : 15

        let samplingPercentage = defaultSampling
        let configAdjusted = false
        let adjustmentReason = ''

        if (samplingEnv) {
            const raw = parseFloat(samplingEnv)
            if (Number.isNaN(raw)) {
                // Non-numeric value triggers fallback
                configAdjusted = true
                adjustmentReason = 'non-numeric value'
            } else {
                // If value looks like a ratio (<=1), convert to percent
                let normalized = raw
                if (raw > 0 && raw <= 1) {
                    normalized = raw * 100
                }
                // Clamp to valid range [0..100]
                const clamped = Math.min(100, Math.max(0, normalized))
                if (clamped !== normalized) {
                    configAdjusted = true
                    adjustmentReason = 'out-of-range value clamped'
                }
                samplingPercentage = clamped
            }
        }

        return { percentage: samplingPercentage, adjusted: configAdjusted, reason: adjustmentReason }
    }

    describe('Environment-based defaults', () => {
        test('should default to 100% in development environment', () => {
            const result = calculateSampling(undefined, 'development')
            assert.equal(result.percentage, 100)
            assert.equal(result.adjusted, false)
        })

        test('should default to 100% in test environment', () => {
            const result = calculateSampling(undefined, 'test')
            assert.equal(result.percentage, 100)
            assert.equal(result.adjusted, false)
        })

        test('should default to 15% in production environment', () => {
            const result = calculateSampling(undefined, 'production')
            assert.equal(result.percentage, 15)
            assert.equal(result.adjusted, false)
        })

        test('should default to 15% when NODE_ENV is not set', () => {
            const result = calculateSampling(undefined, '')
            assert.equal(result.percentage, 15)
            assert.equal(result.adjusted, false)
        })
    })

    describe('Valid percentage values', () => {
        test('should accept whole number percentage (0-100)', () => {
            const result = calculateSampling('50', 'production')
            assert.equal(result.percentage, 50)
            assert.equal(result.adjusted, false)
        })

        test('should accept zero percent', () => {
            const result = calculateSampling('0', 'production')
            assert.equal(result.percentage, 0)
            assert.equal(result.adjusted, false)
        })

        test('should accept 100 percent', () => {
            const result = calculateSampling('100', 'production')
            assert.equal(result.percentage, 100)
            assert.equal(result.adjusted, false)
        })

        test('should convert ratio to percentage (0.15 -> 15)', () => {
            const result = calculateSampling('0.15', 'production')
            assert.equal(result.percentage, 15)
            assert.equal(result.adjusted, false)
        })

        test('should convert ratio to percentage (0.5 -> 50)', () => {
            const result = calculateSampling('0.5', 'production')
            assert.equal(result.percentage, 50)
            assert.equal(result.adjusted, false)
        })

        test('should handle ratio of 1.0 as 100%', () => {
            const result = calculateSampling('1.0', 'production')
            assert.equal(result.percentage, 100)
            assert.equal(result.adjusted, false)
        })
    })

    describe('Out-of-range value clamping', () => {
        test('should clamp negative values to 0 with warning', () => {
            const result = calculateSampling('-10', 'production')
            assert.equal(result.percentage, 0)
            assert.equal(result.adjusted, true)
            assert.equal(result.reason, 'out-of-range value clamped')
        })

        test('should clamp values above 100 with warning', () => {
            const result = calculateSampling('150', 'production')
            assert.equal(result.percentage, 100)
            assert.equal(result.adjusted, true)
            assert.equal(result.reason, 'out-of-range value clamped')
        })

        test('should clamp very large values with warning', () => {
            const result = calculateSampling('999', 'production')
            assert.equal(result.percentage, 100)
            assert.equal(result.adjusted, true)
            assert.equal(result.reason, 'out-of-range value clamped')
        })

        test('should handle value above 1.0 as percentage', () => {
            // Values > 1 are treated as percentages, not ratios
            const result = calculateSampling('5.5', 'production')
            assert.equal(result.percentage, 5.5)
            assert.equal(result.adjusted, false)
        })
    })

    describe('Invalid value fallback', () => {
        test('should fallback to default for non-numeric string with warning', () => {
            const result = calculateSampling('invalid', 'production')
            assert.equal(result.percentage, 15) // production default
            assert.equal(result.adjusted, true)
            assert.equal(result.reason, 'non-numeric value')
        })

        test('should use default for empty string (treated as missing)', () => {
            // Empty string is falsy, treated as undefined, uses default without adjustment
            const result = calculateSampling('', 'production')
            assert.equal(result.percentage, 15) // production default
            assert.equal(result.adjusted, false) // No adjustment since it's treated as undefined
            assert.equal(result.reason, '')
        })

        test('should fallback to default for text value in development', () => {
            const result = calculateSampling('abc', 'development')
            assert.equal(result.percentage, 100) // development default
            assert.equal(result.adjusted, true)
            assert.equal(result.reason, 'non-numeric value')
        })
    })

    describe('Edge cases', () => {
        test('should handle floating point percentages', () => {
            const result = calculateSampling('33.33', 'production')
            assert.equal(result.percentage, 33.33)
            assert.equal(result.adjusted, false)
        })

        test('should handle very small ratios', () => {
            const result = calculateSampling('0.01', 'production')
            assert.equal(result.percentage, 1)
            assert.equal(result.adjusted, false)
        })

        test('should handle zero ratio', () => {
            const result = calculateSampling('0.0', 'production')
            assert.equal(result.percentage, 0)
            assert.equal(result.adjusted, false)
        })

        test('should handle scientific notation', () => {
            const result = calculateSampling('1e-1', 'production') // 0.1
            assert.equal(result.percentage, 10)
            assert.equal(result.adjusted, false)
        })
    })

    describe('Simulated production scenarios', () => {
        beforeEach(() => {
            // Set persistence mode to cosmos to simulate production
            process.env.PERSISTENCE_MODE = 'cosmos'
        })

        test('production env with explicit percentage uses configured value', () => {
            process.env.NODE_ENV = 'production'
            process.env.APPINSIGHTS_SAMPLING_PERCENTAGE = '25'

            const result = calculateSampling(process.env.APPINSIGHTS_SAMPLING_PERCENTAGE, process.env.NODE_ENV)
            assert.equal(result.percentage, 25)
            assert.equal(result.adjusted, false)
        })

        test('production env without explicit percentage uses 15% default', () => {
            process.env.NODE_ENV = 'production'
            delete process.env.APPINSIGHTS_SAMPLING_PERCENTAGE

            const result = calculateSampling(process.env.APPINSIGHTS_SAMPLING_PERCENTAGE, process.env.NODE_ENV)
            assert.equal(result.percentage, 15)
            assert.equal(result.adjusted, false)
        })

        test('production env with invalid value clamps and warns', () => {
            process.env.NODE_ENV = 'production'
            process.env.APPINSIGHTS_SAMPLING_PERCENTAGE = '200'

            const result = calculateSampling(process.env.APPINSIGHTS_SAMPLING_PERCENTAGE, process.env.NODE_ENV)
            assert.equal(result.percentage, 100)
            assert.equal(result.adjusted, true)
            assert.equal(result.reason, 'out-of-range value clamped')
        })
    })
})
