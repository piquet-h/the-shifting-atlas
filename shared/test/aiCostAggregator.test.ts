import assert from 'node:assert'
import test from 'node:test'
import { recordEstimatedAICost, forceFlushAICostSummary, getCurrentHourStart, _resetAggregationForTests } from '../src/aiCostAggregator.js'

test('getCurrentHourStart: should truncate to hour (UTC)', () => {
    // 2025-11-05T20:28:36.812Z → 2025-11-05T20:00:00.000Z
    const timestamp = new Date('2025-11-05T20:28:36.812Z').getTime()
    const hourStart = getCurrentHourStart(timestamp)
    assert.strictEqual(hourStart, '2025-11-05T20:00:00.000Z')
})

test('getCurrentHourStart: should handle exact hour boundary', () => {
    const timestamp = new Date('2025-11-05T20:00:00.000Z').getTime()
    const hourStart = getCurrentHourStart(timestamp)
    assert.strictEqual(hourStart, '2025-11-05T20:00:00.000Z')
})

test('getCurrentHourStart: should handle different hours', () => {
    const ts1 = new Date('2025-11-05T23:59:59.999Z').getTime()
    const ts2 = new Date('2025-11-06T00:00:00.001Z').getTime()

    assert.strictEqual(getCurrentHourStart(ts1), '2025-11-05T23:00:00.000Z')
    assert.strictEqual(getCurrentHourStart(ts2), '2025-11-06T00:00:00.000Z')
})

test('recordEstimatedAICost: should aggregate single model single hour', () => {
    _resetAggregationForTests()

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // Record first event
    const summaries1 = recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        now
    )

    // No summaries yet (same hour)
    assert.strictEqual(summaries1.length, 0)

    // Record second event (same hour)
    const summaries2 = recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 200,
            completionTokens: 600,
            estimatedCostMicros: 500
        },
        now + 1000 // +1 second
    )

    // Still no summaries (same hour)
    assert.strictEqual(summaries2.length, 0)

    // Force flush to get current hour summary
    const summaries = forceFlushAICostSummary(now)

    assert.strictEqual(summaries.length, 1)
    assert.strictEqual(summaries[0].hourStart, '2025-11-05T20:00:00.000Z')
    assert.strictEqual(summaries[0].modelId, 'gpt-4o-mini')
    assert.strictEqual(summaries[0].calls, 2)
    assert.strictEqual(summaries[0].totalPromptTokens, 350)
    assert.strictEqual(summaries[0].totalCompletionTokens, 1050)
    assert.strictEqual(summaries[0].totalEstimatedCostMicros, 875)
    assert.strictEqual(summaries[0].delayedFlush, false)
})

test('recordEstimatedAICost: should flush on hour rollover', () => {
    _resetAggregationForTests()

    const hour1 = new Date('2025-11-05T20:30:00.000Z').getTime()
    const hour2 = new Date('2025-11-05T21:15:00.000Z').getTime()

    // Record event in hour 1
    const summaries1 = recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        hour1
    )

    assert.strictEqual(summaries1.length, 0)

    // Record event in hour 2 (should flush hour 1)
    const summaries2 = recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 200,
            completionTokens: 600,
            estimatedCostMicros: 500
        },
        hour2
    )

    // Should emit hour 1 summary
    assert.strictEqual(summaries2.length, 1)
    assert.strictEqual(summaries2[0].hourStart, '2025-11-05T20:00:00.000Z')
    assert.strictEqual(summaries2[0].modelId, 'gpt-4o-mini')
    assert.strictEqual(summaries2[0].calls, 1)
    assert.strictEqual(summaries2[0].totalPromptTokens, 150)
    assert.strictEqual(summaries2[0].totalCompletionTokens, 450)
    assert.strictEqual(summaries2[0].totalEstimatedCostMicros, 375)
    assert.strictEqual(summaries2[0].delayedFlush, false)

    // Force flush to get hour 2
    const summaries3 = forceFlushAICostSummary(hour2)
    assert.strictEqual(summaries3.length, 1)
    assert.strictEqual(summaries3[0].hourStart, '2025-11-05T21:00:00.000Z')
    assert.strictEqual(summaries3[0].calls, 1)
})

test('recordEstimatedAICost: should set delayedFlush=true when idle >1 hour', () => {
    _resetAggregationForTests()

    const hour1 = new Date('2025-11-05T20:30:00.000Z').getTime()
    const hour3 = new Date('2025-11-05T23:15:00.000Z').getTime() // >2 hours later

    // Record event in hour 1
    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        hour1
    )

    // Record event in hour 3 (delayed flush)
    const summaries = recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 200,
            completionTokens: 600,
            estimatedCostMicros: 500
        },
        hour3
    )

    // Should emit hour 1 summary with delayedFlush=true
    assert.strictEqual(summaries.length, 1)
    assert.strictEqual(summaries[0].hourStart, '2025-11-05T20:00:00.000Z')
    assert.strictEqual(summaries[0].delayedFlush, true)
})

test('recordEstimatedAICost: should handle multiple models', () => {
    _resetAggregationForTests()

    const hour1 = new Date('2025-11-05T20:30:00.000Z').getTime()
    const hour2 = new Date('2025-11-05T21:15:00.000Z').getTime()

    // Record events for different models in hour 1
    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        hour1
    )

    recordEstimatedAICost(
        {
            modelId: 'gpt-4o',
            promptTokens: 200,
            completionTokens: 600,
            estimatedCostMicros: 1000
        },
        hour1
    )

    // Rollover to hour 2
    const summaries = recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 100,
            completionTokens: 300,
            estimatedCostMicros: 250
        },
        hour2
    )

    // Should emit 2 summaries (one per model)
    assert.strictEqual(summaries.length, 2)

    const summariesByModel = summaries.sort((a, b) => a.modelId.localeCompare(b.modelId))

    assert.strictEqual(summariesByModel[0].modelId, 'gpt-4o')
    assert.strictEqual(summariesByModel[0].calls, 1)
    assert.strictEqual(summariesByModel[0].totalEstimatedCostMicros, 1000)

    assert.strictEqual(summariesByModel[1].modelId, 'gpt-4o-mini')
    assert.strictEqual(summariesByModel[1].calls, 1)
    assert.strictEqual(summariesByModel[1].totalEstimatedCostMicros, 375)
})

test('recordEstimatedAICost: should handle high model cardinality (≥10 models)', () => {
    _resetAggregationForTests()

    const hour1 = new Date('2025-11-05T20:30:00.000Z').getTime()
    const hour2 = new Date('2025-11-05T21:15:00.000Z').getTime()

    // Record events for 10 different models
    for (let i = 0; i < 10; i++) {
        recordEstimatedAICost(
            {
                modelId: `model-${i}`,
                promptTokens: 100 + i * 10,
                completionTokens: 300 + i * 20,
                estimatedCostMicros: 500 + i * 50
            },
            hour1
        )
    }

    // Measure flush time
    const startTime = Date.now()
    const summaries = recordEstimatedAICost(
        {
            modelId: 'model-0',
            promptTokens: 100,
            completionTokens: 300,
            estimatedCostMicros: 250
        },
        hour2
    )
    const flushTime = Date.now() - startTime

    // Should emit 10 summaries
    assert.strictEqual(summaries.length, 10)

    // Flush should be fast (<100ms expected, but allow some overhead in CI)
    assert.ok(flushTime < 200, `Flush took ${flushTime}ms, expected <200ms`)

    // Verify all models are present
    const modelIds = summaries.map((s) => s.modelId).sort()
    for (let i = 0; i < 10; i++) {
        assert.strictEqual(modelIds[i], `model-${i}`)
    }
})

test('forceFlushAICostSummary: should skip zero-call hours', () => {
    _resetAggregationForTests()

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // Record event to create bucket
    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        now
    )

    // Force flush should emit the summary
    const summaries1 = forceFlushAICostSummary(now)
    assert.strictEqual(summaries1.length, 1)

    // Second flush with no new events should emit nothing
    const summaries2 = forceFlushAICostSummary(now)
    assert.strictEqual(summaries2.length, 0)
})

test('forceFlushAICostSummary: should clear aggregation store', () => {
    _resetAggregationForTests()

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // Record events
    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        now
    )

    // Force flush
    const summaries1 = forceFlushAICostSummary(now)
    assert.strictEqual(summaries1.length, 1)

    // Second flush should return nothing (store cleared)
    const summaries2 = forceFlushAICostSummary(now)
    assert.strictEqual(summaries2.length, 0)
})

test('forceFlushAICostSummary: should handle current hour (not complete)', () => {
    _resetAggregationForTests()

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // Record event in current hour
    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        now
    )

    // Force flush should emit current hour (even if incomplete)
    const summaries = forceFlushAICostSummary(now)
    assert.strictEqual(summaries.length, 1)
    assert.strictEqual(summaries[0].hourStart, '2025-11-05T20:00:00.000Z')
    assert.strictEqual(summaries[0].delayedFlush, false) // Not delayed (current hour)
})

test('recordEstimatedAICost: should accumulate totals correctly', () => {
    _resetAggregationForTests()

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // Record 3 events with different values
    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 100,
            completionTokens: 200,
            estimatedCostMicros: 150
        },
        now
    )

    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 250,
            completionTokens: 350,
            estimatedCostMicros: 400
        },
        now
    )

    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 50,
            completionTokens: 100,
            estimatedCostMicros: 75
        },
        now
    )

    // Force flush
    const summaries = forceFlushAICostSummary(now)

    assert.strictEqual(summaries.length, 1)
    assert.strictEqual(summaries[0].calls, 3)
    assert.strictEqual(summaries[0].totalPromptTokens, 400) // 100 + 250 + 50
    assert.strictEqual(summaries[0].totalCompletionTokens, 650) // 200 + 350 + 100
    assert.strictEqual(summaries[0].totalEstimatedCostMicros, 625) // 150 + 400 + 75
})

test('recordEstimatedAICost: should handle exact hour boundary transitions', () => {
    _resetAggregationForTests()

    const hour1End = new Date('2025-11-05T20:59:59.999Z').getTime()
    const hour2Start = new Date('2025-11-05T21:00:00.000Z').getTime()

    // Record at end of hour 1
    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        hour1End
    )

    // Record at start of hour 2 (should flush hour 1)
    const summaries = recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 200,
            completionTokens: 600,
            estimatedCostMicros: 500
        },
        hour2Start
    )

    assert.strictEqual(summaries.length, 1)
    assert.strictEqual(summaries[0].hourStart, '2025-11-05T20:00:00.000Z')
    assert.strictEqual(summaries[0].calls, 1)
    assert.strictEqual(summaries[0].delayedFlush, false)
})

test('recordEstimatedAICost: edge case - zero tokens and cost', () => {
    _resetAggregationForTests()

    const now = new Date('2025-11-05T20:30:00.000Z').getTime()

    // Record event with zero values
    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 0,
            completionTokens: 0,
            estimatedCostMicros: 0
        },
        now
    )

    // Force flush
    const summaries = forceFlushAICostSummary(now)

    // Should still emit (calls > 0, even if tokens/cost are 0)
    assert.strictEqual(summaries.length, 1)
    assert.strictEqual(summaries[0].calls, 1)
    assert.strictEqual(summaries[0].totalPromptTokens, 0)
    assert.strictEqual(summaries[0].totalCompletionTokens, 0)
    assert.strictEqual(summaries[0].totalEstimatedCostMicros, 0)
})
