import assert from 'node:assert'
import test from 'node:test'
import {
    checkSoftThreshold,
    initSoftThresholdFromEnv,
    setSoftThreshold,
    getSoftThreshold,
    _resetGuardrailsForTests
} from '../src/aiCostGuardrails.js'

test('initSoftThresholdFromEnv: should initialize from valid env var', () => {
    _resetGuardrailsForTests()

    // Pass valid value
    initSoftThresholdFromEnv('1000000')

    assert.strictEqual(getSoftThreshold(), 1000000)
})

test('initSoftThresholdFromEnv: should disable when env var not set', () => {
    _resetGuardrailsForTests()

    // Pass undefined
    initSoftThresholdFromEnv(undefined)

    assert.strictEqual(getSoftThreshold(), null)
})

test('initSoftThresholdFromEnv: should disable when env var is 0', () => {
    _resetGuardrailsForTests()

    initSoftThresholdFromEnv('0')

    assert.strictEqual(getSoftThreshold(), null)
})

test('initSoftThresholdFromEnv: should disable when env var is negative', () => {
    _resetGuardrailsForTests()

    initSoftThresholdFromEnv('-1000')

    assert.strictEqual(getSoftThreshold(), null)
})

test('initSoftThresholdFromEnv: should disable when env var is invalid', () => {
    _resetGuardrailsForTests()

    initSoftThresholdFromEnv('invalid')

    assert.strictEqual(getSoftThreshold(), null)
})

test('setSoftThreshold: should set threshold programmatically', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(2000000)
    assert.strictEqual(getSoftThreshold(), 2000000)
})

test('setSoftThreshold: should disable when set to null', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)
    assert.strictEqual(getSoftThreshold(), 1000000)

    setSoftThreshold(null)
    assert.strictEqual(getSoftThreshold(), null)
})

test('setSoftThreshold: should disable when set to 0', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)
    setSoftThreshold(0)
    assert.strictEqual(getSoftThreshold(), null)
})

test('setSoftThreshold: should disable when set to negative', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)
    setSoftThreshold(-500)
    assert.strictEqual(getSoftThreshold(), null)
})

test('checkSoftThreshold: should return null when threshold not set', () => {
    _resetGuardrailsForTests()

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    const result = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 2000000,
            calls: 10
        },
        now
    )

    assert.strictEqual(result.thresholdEvent, null)
    assert.strictEqual(result.adjustedEvent, null)
})

test('checkSoftThreshold: should return null when cost below threshold', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    const result = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 500000,
            calls: 5
        },
        now
    )

    assert.strictEqual(result.thresholdEvent, null)
    assert.strictEqual(result.adjustedEvent, null)
})

test('checkSoftThreshold: should emit event on first crossing', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    const result = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 1500000,
            calls: 15
        },
        now
    )

    assert.notStrictEqual(result.thresholdEvent, null)
    assert.strictEqual(result.thresholdEvent?.hourStart, '2025-11-05T20:00:00.000Z')
    assert.strictEqual(result.thresholdEvent?.modelId, 'gpt-4o-mini')
    assert.strictEqual(result.thresholdEvent?.totalEstimatedCostMicros, 1500000)
    assert.strictEqual(result.thresholdEvent?.threshold, 1000000)
    assert.strictEqual(result.thresholdEvent?.calls, 15)
    assert.strictEqual(result.adjustedEvent, null)
})

test('checkSoftThreshold: should suppress second crossing in same hour', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // First crossing
    const result1 = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 1500000,
            calls: 15
        },
        now
    )

    assert.notStrictEqual(result1.thresholdEvent, null)

    // Second crossing (same model, same hour)
    const result2 = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 2000000,
            calls: 20
        },
        now
    )

    assert.strictEqual(result2.thresholdEvent, null)
})

test('checkSoftThreshold: should re-emit on new hour', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now1 = new Date('2025-11-05T20:30:00.000Z').getTime()
    const now2 = new Date('2025-11-05T21:30:00.000Z').getTime()

    // First crossing in hour 1
    const result1 = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 1500000,
            calls: 15
        },
        now1
    )

    assert.notStrictEqual(result1.thresholdEvent, null)
    assert.strictEqual(result1.thresholdEvent?.hourStart, '2025-11-05T20:00:00.000Z')

    // Second crossing in hour 2 (should emit again)
    const result2 = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T21:00:00.000Z',
            totalEstimatedCostMicros: 1800000,
            calls: 18
        },
        now2
    )

    assert.notStrictEqual(result2.thresholdEvent, null)
    assert.strictEqual(result2.thresholdEvent?.hourStart, '2025-11-05T21:00:00.000Z')
})

test('checkSoftThreshold: should track multiple models independently', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // Crossing for model 1
    const result1 = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 1500000,
            calls: 15
        },
        now
    )

    assert.notStrictEqual(result1.thresholdEvent, null)
    assert.strictEqual(result1.thresholdEvent?.modelId, 'gpt-4o-mini')

    // Crossing for model 2 (same hour, different model)
    const result2 = checkSoftThreshold(
        {
            modelId: 'gpt-4o',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 2000000,
            calls: 10
        },
        now
    )

    assert.notStrictEqual(result2.thresholdEvent, null)
    assert.strictEqual(result2.thresholdEvent?.modelId, 'gpt-4o')

    // Second crossing for model 1 (should be suppressed)
    const result3 = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 2500000,
            calls: 25
        },
        now
    )

    assert.strictEqual(result3.thresholdEvent, null)
})

test('checkSoftThreshold: should handle exact threshold boundary', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // Exactly at threshold (should emit)
    const result = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 1000000,
            calls: 10
        },
        now
    )

    assert.notStrictEqual(result.thresholdEvent, null)
})

test('checkSoftThreshold: should cap integer overflow and emit InputAdjusted', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()
    const overflowValue = Number.MAX_SAFE_INTEGER + 1000

    const result = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: overflowValue,
            calls: 100
        },
        now
    )

    // Should emit both threshold event and adjustment event
    assert.notStrictEqual(result.thresholdEvent, null)
    assert.notStrictEqual(result.adjustedEvent, null)

    assert.strictEqual(result.adjustedEvent?.reason, 'overflow_protection')
    assert.strictEqual(result.adjustedEvent?.originalValue, overflowValue)
    assert.strictEqual(result.adjustedEvent?.adjustedValue, Number.MAX_SAFE_INTEGER)
    assert.strictEqual(result.adjustedEvent?.field, 'totalEstimatedCostMicros')

    // Threshold event should use capped value
    assert.strictEqual(result.thresholdEvent?.totalEstimatedCostMicros, Number.MAX_SAFE_INTEGER)
})

test('checkSoftThreshold: should emit InputAdjusted without threshold event when threshold disabled', () => {
    _resetGuardrailsForTests()

    // No threshold set
    const now = new Date('2025-11-05T20:30:00.000Z').getTime()
    const overflowValue = Number.MAX_SAFE_INTEGER + 5000

    const result = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: overflowValue,
            calls: 50
        },
        now
    )

    // Should emit adjustment event but not threshold event
    assert.strictEqual(result.thresholdEvent, null)
    assert.notStrictEqual(result.adjustedEvent, null)

    assert.strictEqual(result.adjustedEvent?.reason, 'overflow_protection')
    assert.strictEqual(result.adjustedEvent?.originalValue, overflowValue)
    assert.strictEqual(result.adjustedEvent?.adjustedValue, Number.MAX_SAFE_INTEGER)
})

test('checkSoftThreshold: should handle exact MAX_SAFE_INTEGER without adjustment', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    const result = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: Number.MAX_SAFE_INTEGER,
            calls: 100
        },
        now
    )

    // Should emit threshold event but NOT adjustment event
    assert.notStrictEqual(result.thresholdEvent, null)
    assert.strictEqual(result.adjustedEvent, null)
})

test('checkSoftThreshold: should clean up old hours automatically', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const hour1 = new Date('2025-11-05T20:30:00.000Z').getTime()
    const hour3 = new Date('2025-11-05T22:30:00.000Z').getTime()

    // Crossing in hour 1
    const result1 = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 1500000,
            calls: 15
        },
        hour1
    )

    assert.notStrictEqual(result1.thresholdEvent, null)

    // Crossing in hour 3 (hour 1 should be cleaned up, allowing re-emit for old hour if needed)
    // But we're checking a NEW hour, so it should emit
    const result2 = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T22:00:00.000Z',
            totalEstimatedCostMicros: 1600000,
            calls: 16
        },
        hour3
    )

    assert.notStrictEqual(result2.thresholdEvent, null)

    // Verify that if we try to check hour 1 again from hour 3 context, it would emit
    // (because hour 1 was cleaned up from tracker)
    const result3 = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 1700000,
            calls: 17
        },
        hour3
    )

    assert.notStrictEqual(result3.thresholdEvent, null) // Should re-emit since cleaned
})

test('checkSoftThreshold: should handle high model cardinality (≥10 models)', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // Cross threshold for 10 different models
    for (let i = 0; i < 10; i++) {
        const result = checkSoftThreshold(
            {
                modelId: `model-${i}`,
                hourStart: '2025-11-05T20:00:00.000Z',
                totalEstimatedCostMicros: 1100000 + i * 10000,
                calls: 10 + i
            },
            now
        )

        assert.notStrictEqual(result.thresholdEvent, null)
        assert.strictEqual(result.thresholdEvent?.modelId, `model-${i}`)
    }

    // Second crossing for each model should be suppressed
    for (let i = 0; i < 10; i++) {
        const result = checkSoftThreshold(
            {
                modelId: `model-${i}`,
                hourStart: '2025-11-05T20:00:00.000Z',
                totalEstimatedCostMicros: 2000000 + i * 10000,
                calls: 20 + i
            },
            now
        )

        assert.strictEqual(result.thresholdEvent, null)
    }
})

test('checkSoftThreshold: edge case - cost exactly at MAX_SAFE_INTEGER', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    const result = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: Number.MAX_SAFE_INTEGER,
            calls: 100
        },
        now
    )

    assert.notStrictEqual(result.thresholdEvent, null)
    assert.strictEqual(result.adjustedEvent, null) // No adjustment needed
    assert.strictEqual(result.thresholdEvent?.totalEstimatedCostMicros, Number.MAX_SAFE_INTEGER)
})

test('checkSoftThreshold: edge case - zero cost with threshold enabled', () => {
    _resetGuardrailsForTests()

    setSoftThreshold(1000000)

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    const result = checkSoftThreshold(
        {
            modelId: 'gpt-4o-mini',
            hourStart: '2025-11-05T20:00:00.000Z',
            totalEstimatedCostMicros: 0,
            calls: 1
        },
        now
    )

    assert.strictEqual(result.thresholdEvent, null) // Below threshold
    assert.strictEqual(result.adjustedEvent, null)
})
