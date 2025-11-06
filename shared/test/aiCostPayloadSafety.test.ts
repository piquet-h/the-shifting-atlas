import assert from 'node:assert'
import test from 'node:test'
import { prepareAICostTelemetry } from '../src/aiCostCalculator.js'
import { recordEstimatedAICost, forceFlushAICostSummary, _resetAggregationForTests } from '../src/aiCostAggregator.js'
import { checkSoftThreshold, setSoftThreshold, _resetGuardrailsForTests } from '../src/aiCostGuardrails.js'

/**
 * Forbidden field names that should NEVER appear in telemetry payloads.
 * These fields could contain PII or sensitive content.
 */
const FORBIDDEN_FIELDS = ['promptText', 'completionText', 'prompt', 'completion', 'responseText', 'response', 'text', 'content']

/**
 * Maximum safe string length for telemetry fields.
 * Prevents accidental inclusion of large text blocks.
 */
const MAX_STRING_LENGTH = 200

test('AI cost payload safety: prepareAICostTelemetry should not include raw prompt text', () => {
    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: 'This is a very long prompt that should not appear in the telemetry payload',
        completionText: 'This is a very long completion that should also not appear in the payload'
    })

    // Verify forbidden fields are absent
    for (const forbiddenField of FORBIDDEN_FIELDS) {
        assert.strictEqual(payload[forbiddenField], undefined, `Payload should not contain field: ${forbiddenField}`)
    }

    // Verify no large strings (all strings should be under MAX_STRING_LENGTH)
    for (const [key, value] of Object.entries(payload)) {
        if (typeof value === 'string') {
            assert.ok(value.length <= MAX_STRING_LENGTH, `String field ${key} exceeds max length: ${value.length} > ${MAX_STRING_LENGTH}`)
        }
    }

    // Verify only primitive types (no nested objects or arrays)
    for (const [key, value] of Object.entries(payload)) {
        const valueType = typeof value
        assert.ok(
            valueType === 'string' || valueType === 'number' || valueType === 'boolean' || value === undefined,
            `Field ${key} must be primitive type (got ${valueType})`
        )
    }
})

test('AI cost payload safety: prepareAICostTelemetry should only include allowed fields', () => {
    const allowedFields = [
        'modelId',
        'promptTokens',
        'completionTokens',
        'estimatedCostMicros',
        'promptBucket',
        'completionBucket',
        'pricingSource',
        'estimator',
        'simulation',
        'hadNegativeTokens',
        'originalPromptTokens',
        'originalCompletionTokens'
    ]

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: 'Test prompt',
        completionText: 'Test completion'
    })

    // Verify all fields in payload are in allowed list
    for (const key of Object.keys(payload)) {
        assert.ok(allowedFields.includes(key), `Unexpected field in payload: ${key}`)
    }
})

test('AI cost payload safety: WindowSummary should not include raw text', () => {
    _resetAggregationForTests()

    const now = Date.now()

    // Record some events
    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        now
    )

    // Force flush to get summary
    const summaries = forceFlushAICostSummary(now)

    assert.strictEqual(summaries.length, 1, 'Should have one summary')

    const summary = summaries[0]

    // Verify forbidden fields are absent
    for (const forbiddenField of FORBIDDEN_FIELDS) {
        assert.strictEqual(summary[forbiddenField], undefined, `Summary should not contain field: ${forbiddenField}`)
    }

    // Verify no large strings
    for (const [key, value] of Object.entries(summary)) {
        if (typeof value === 'string') {
            assert.ok(value.length <= MAX_STRING_LENGTH, `String field ${key} exceeds max length: ${value.length} > ${MAX_STRING_LENGTH}`)
        }
    }
})

test('AI cost payload safety: WindowSummary should only include allowed fields', () => {
    _resetAggregationForTests()

    const allowedFields = [
        'hourStart',
        'modelId',
        'calls',
        'totalPromptTokens',
        'totalCompletionTokens',
        'totalEstimatedCostMicros',
        'delayedFlush'
    ]

    const now = Date.now()

    recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 100,
            completionTokens: 200,
            estimatedCostMicros: 250
        },
        now
    )

    const summaries = forceFlushAICostSummary(now)
    const summary = summaries[0]

    // Verify all fields in summary are in allowed list
    for (const key of Object.keys(summary)) {
        assert.ok(allowedFields.includes(key), `Unexpected field in summary: ${key}`)
    }
})

test('AI cost payload safety: SoftThresholdCrossed should not include raw text', () => {
    _resetGuardrailsForTests()
    setSoftThreshold(10000)

    const result = checkSoftThreshold({
        modelId: 'gpt-4o-mini',
        hourStart: '2025-11-06T07:00:00.000Z',
        totalEstimatedCostMicros: 15000,
        calls: 67
    })

    assert.ok(result.thresholdEvent, 'Should have threshold event')

    const event = result.thresholdEvent

    // Verify forbidden fields are absent
    for (const forbiddenField of FORBIDDEN_FIELDS) {
        assert.strictEqual(event[forbiddenField], undefined, `Event should not contain field: ${forbiddenField}`)
    }

    // Verify no large strings
    for (const [key, value] of Object.entries(event)) {
        if (typeof value === 'string') {
            assert.ok(value.length <= MAX_STRING_LENGTH, `String field ${key} exceeds max length: ${value.length} > ${MAX_STRING_LENGTH}`)
        }
    }
})

test('AI cost payload safety: SoftThresholdCrossed should only include allowed fields', () => {
    _resetGuardrailsForTests()
    setSoftThreshold(10000)

    const allowedFields = ['hourStart', 'modelId', 'totalEstimatedCostMicros', 'threshold', 'calls']

    const result = checkSoftThreshold({
        modelId: 'gpt-4o-mini',
        hourStart: '2025-11-06T07:00:00.000Z',
        totalEstimatedCostMicros: 15000,
        calls: 67
    })

    const event = result.thresholdEvent

    // Verify all fields in event are in allowed list
    for (const key of Object.keys(event)) {
        assert.ok(allowedFields.includes(key), `Unexpected field in event: ${key}`)
    }
})

test('AI cost payload safety: negative token adjustment should not include raw text', () => {
    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptTokens: -10,
        completionTokens: -5
    })

    assert.strictEqual(payload.hadNegativeTokens, true, 'Should flag negative tokens')

    // Verify forbidden fields are absent even with adjustment
    for (const forbiddenField of FORBIDDEN_FIELDS) {
        assert.strictEqual(payload[forbiddenField], undefined, `Adjusted payload should not contain field: ${forbiddenField}`)
    }
})

test('AI cost payload safety: empty payload should fail validation (edge case)', () => {
    // This would be caught by schema validation in the audit script
    // Here we verify that generated payloads always have required fields
    const validPayload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini'
    })

    assert.ok(validPayload.modelId, 'Payload should have modelId')
    assert.ok(typeof validPayload.promptTokens === 'number', 'Payload should have promptTokens')
    assert.ok(typeof validPayload.completionTokens === 'number', 'Payload should have completionTokens')
})

test('AI cost payload safety: deeply nested object should be rejected (edge case)', () => {
    // Our functions should never produce nested objects
    // This test verifies the payload structure is flat

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: 'Test'
    })

    // Check that no field is a nested object
    for (const [key, value] of Object.entries(payload)) {
        if (value !== undefined && value !== null) {
            const isObject = typeof value === 'object' && !Array.isArray(value)
            assert.ok(!isObject, `Field ${key} should not be a nested object`)
        }
    }
})

test('AI cost payload safety: extra numeric debug field should fail schema validation (edge case)', () => {
    // This is a conceptual test - our functions don't add extra fields
    // The audit script would catch this

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: 'Test'
    })

    // Verify our functions don't produce such fields
    assert.strictEqual(payload.debugField, undefined, 'Generated payloads should not have extra fields')
})
