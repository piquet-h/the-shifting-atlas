import assert from 'node:assert'
import test from 'node:test'
import { calculateCost, getTokenBucket, prepareAICostTelemetry } from '../src/aiCostCalculator.js'
import { _resetPricingForTests } from '../src/aiPricing.js'

test('getTokenBucket: should return "0-32" for tokens <= 32', () => {
    assert.strictEqual(getTokenBucket(0), '0-32')
    assert.strictEqual(getTokenBucket(1), '0-32')
    assert.strictEqual(getTokenBucket(32), '0-32')
})

test('getTokenBucket: should return "33-128" for tokens 33-128', () => {
    assert.strictEqual(getTokenBucket(33), '33-128')
    assert.strictEqual(getTokenBucket(64), '33-128')
    assert.strictEqual(getTokenBucket(128), '33-128')
})

test('getTokenBucket: should return "129-512" for tokens 129-512', () => {
    assert.strictEqual(getTokenBucket(129), '129-512')
    assert.strictEqual(getTokenBucket(256), '129-512')
    assert.strictEqual(getTokenBucket(512), '129-512')
})

test('getTokenBucket: should return "513-2k" for tokens 513-2000', () => {
    assert.strictEqual(getTokenBucket(513), '513-2k')
    assert.strictEqual(getTokenBucket(1000), '513-2k')
    assert.strictEqual(getTokenBucket(2000), '513-2k')
})

test('getTokenBucket: should return "2k+" for tokens > 2000', () => {
    assert.strictEqual(getTokenBucket(2001), '2k+')
    assert.strictEqual(getTokenBucket(10000), '2k+')
    assert.strictEqual(getTokenBucket(100000), '2k+')
})

test('getTokenBucket: boundary tests', () => {
    // Lower boundaries
    assert.strictEqual(getTokenBucket(32), '0-32')
    assert.strictEqual(getTokenBucket(33), '33-128')

    assert.strictEqual(getTokenBucket(128), '33-128')
    assert.strictEqual(getTokenBucket(129), '129-512')

    assert.strictEqual(getTokenBucket(512), '129-512')
    assert.strictEqual(getTokenBucket(513), '513-2k')

    assert.strictEqual(getTokenBucket(2000), '513-2k')
    assert.strictEqual(getTokenBucket(2001), '2k+')
})

test('calculateCost: should calculate cost using model pricing', () => {
    _resetPricingForTests()

    // gpt-4o-mini: promptPer1k=0.00015, completionPer1k=0.0006
    // 100 prompt tokens: (100/1000) * 0.00015 = 0.000015 USD = 15 microdollars
    // 200 completion tokens: (200/1000) * 0.0006 = 0.00012 USD = 120 microdollars
    // Total: 135 microdollars
    const result = calculateCost('gpt-4o-mini', 100, 200)

    assert.strictEqual(result.estimatedCostMicros, 135)
    assert.strictEqual(result.pricingSource, 'model')
    assert.strictEqual(result.promptBucket, '33-128')
    assert.strictEqual(result.completionBucket, '129-512')
})

test('calculateCost: should use fallback pricing for unknown model', () => {
    _resetPricingForTests()

    // generic fallback: promptPer1k=0.0015, completionPer1k=0.002
    // 100 prompt tokens: (100/1000) * 0.0015 = 0.00015 USD = 150 microdollars
    // 200 completion tokens: (200/1000) * 0.002 = 0.0004 USD = 400 microdollars
    // Total: 550 microdollars
    const result = calculateCost('unknown-model-xyz', 100, 200)

    assert.strictEqual(result.estimatedCostMicros, 550)
    assert.strictEqual(result.pricingSource, 'fallback')
})

test('calculateCost: should clamp negative prompt tokens to 0', () => {
    _resetPricingForTests()

    const result = calculateCost('gpt-4o-mini', -100, 200)

    // Only completion tokens counted: (200/1000) * 0.0006 = 120 microdollars
    assert.strictEqual(result.estimatedCostMicros, 120)
    assert.strictEqual(result.promptBucket, '0-32')
})

test('calculateCost: should clamp negative completion tokens to 0', () => {
    _resetPricingForTests()

    const result = calculateCost('gpt-4o-mini', 100, -200)

    // Only prompt tokens counted: (100/1000) * 0.00015 = 15 microdollars
    assert.strictEqual(result.estimatedCostMicros, 15)
    assert.strictEqual(result.completionBucket, '0-32')
})

test('calculateCost: should handle zero tokens', () => {
    _resetPricingForTests()

    const result = calculateCost('gpt-4o-mini', 0, 0)

    assert.strictEqual(result.estimatedCostMicros, 0)
    assert.strictEqual(result.promptBucket, '0-32')
    assert.strictEqual(result.completionBucket, '0-32')
})

test('calculateCost: should handle missing completion tokens (0)', () => {
    _resetPricingForTests()

    const result = calculateCost('gpt-4o-mini', 100, 0)

    // Only prompt: (100/1000) * 0.00015 = 15 microdollars
    assert.strictEqual(result.estimatedCostMicros, 15)
    assert.strictEqual(result.completionBucket, '0-32')
})

test('calculateCost: should round to whole microdollars', () => {
    _resetPricingForTests()

    // Use pricing that creates fractional microdollars
    // 1 prompt token: (1/1000) * 0.00015 = 0.00000015 USD = 0.15 microdollars → rounds to 0
    const result1 = calculateCost('gpt-4o-mini', 1, 0)
    assert.strictEqual(result1.estimatedCostMicros, 0)

    // 5 prompt tokens: (5/1000) * 0.00015 = 0.00000075 USD = 0.75 microdollars → rounds to 1
    const result2 = calculateCost('gpt-4o-mini', 5, 0)
    assert.strictEqual(result2.estimatedCostMicros, 1)

    // 10 prompt tokens: (10/1000) * 0.00015 = 0.0000015 USD = 1.5 microdollars → rounds to 2 (banker's rounding)
    const result3 = calculateCost('gpt-4o-mini', 10, 0)
    assert.strictEqual(result3.estimatedCostMicros, 1)
})

test('calculateCost: should handle large token counts', () => {
    _resetPricingForTests()

    // 100K prompt + 50K completion
    // Prompt: (100000/1000) * 0.00015 = 15000 microdollars
    // Completion: (50000/1000) * 0.0006 = 30000 microdollars
    // Total: 45000 microdollars
    const result = calculateCost('gpt-4o-mini', 100_000, 50_000)

    assert.strictEqual(result.estimatedCostMicros, 45000)
    assert.strictEqual(result.promptBucket, '2k+')
    assert.strictEqual(result.completionBucket, '2k+')
})

test('prepareAICostTelemetry: should prepare payload with text estimation', () => {
    _resetPricingForTests()

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: 'Hello world', // 11 chars → 3 tokens
        completionText: 'Test response' // 13 chars → 4 tokens
    })

    assert.strictEqual(payload.modelId, 'gpt-4o-mini')
    assert.strictEqual(payload.promptTokens, 3)
    assert.strictEqual(payload.completionTokens, 4)
    assert.ok(typeof payload.estimatedCostMicros === 'number')
    assert.strictEqual(payload.promptBucket, '0-32')
    assert.strictEqual(payload.completionBucket, '0-32')
    assert.strictEqual(payload.pricingSource, 'model')
    assert.strictEqual(payload.estimator, 'charDiv4')
    assert.strictEqual(payload.simulation, true)
    assert.strictEqual(payload.hadNegativeTokens, false)
})

test('prepareAICostTelemetry: should prepare payload with explicit token counts', () => {
    _resetPricingForTests()

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptTokens: 150,
        completionTokens: 450
    })

    assert.strictEqual(payload.promptTokens, 150)
    assert.strictEqual(payload.completionTokens, 450)
    assert.strictEqual(payload.promptBucket, '129-512')
    assert.strictEqual(payload.completionBucket, '129-512')
})

test('prepareAICostTelemetry: should mark negative tokens and include original values', () => {
    _resetPricingForTests()

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptTokens: -100,
        completionTokens: 200
    })

    assert.strictEqual(payload.hadNegativeTokens, true)
    assert.strictEqual(payload.originalPromptTokens, -100)
    assert.strictEqual(payload.originalCompletionTokens, undefined)
    assert.strictEqual(payload.promptTokens, 0)
    assert.strictEqual(payload.completionTokens, 200)
})

test('prepareAICostTelemetry: should NOT include raw promptText in payload', () => {
    _resetPricingForTests()

    const sensitivePrompt = 'Secret API key: sk-1234567890'
    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: sensitivePrompt,
        completionText: 'Response'
    })

    const payloadJson = JSON.stringify(payload)
    assert.ok(!payloadJson.includes(sensitivePrompt), 'Raw prompt text found in payload!')
    assert.ok(!payloadJson.includes('promptText'), 'promptText field found in payload!')
})

test('prepareAICostTelemetry: should NOT include raw completionText in payload', () => {
    _resetPricingForTests()

    const sensitiveCompletion = 'User password: hunter2'
    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: 'Test',
        completionText: sensitiveCompletion
    })

    const payloadJson = JSON.stringify(payload)
    assert.ok(!payloadJson.includes(sensitiveCompletion), 'Raw completion text found in payload!')
    assert.ok(!payloadJson.includes('completionText'), 'completionText field found in payload!')
})

test('prepareAICostTelemetry: should handle missing completion text (0 tokens)', () => {
    _resetPricingForTests()

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: 'Hello'
    })

    assert.strictEqual(payload.completionTokens, 0)
})

test('prepareAICostTelemetry: should use fallback pricing source for unknown model', () => {
    _resetPricingForTests()

    const payload = prepareAICostTelemetry({
        modelId: 'unknown-model-xyz',
        promptTokens: 100,
        completionTokens: 200
    })

    assert.strictEqual(payload.pricingSource, 'fallback')
})

test('prepareAICostTelemetry: should set simulation flag based on estimator', () => {
    _resetPricingForTests()

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptTokens: 100,
        completionTokens: 200
    })

    // charDiv4 estimator → simulation = true
    assert.strictEqual(payload.estimator, 'charDiv4')
    assert.strictEqual(payload.simulation, true)
})

test('Edge case: both negative tokens should mark payload appropriately', () => {
    _resetPricingForTests()

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptTokens: -50,
        completionTokens: -100
    })

    assert.strictEqual(payload.hadNegativeTokens, true)
    assert.strictEqual(payload.originalPromptTokens, -50)
    assert.strictEqual(payload.originalCompletionTokens, -100)
    assert.strictEqual(payload.promptTokens, 0)
    assert.strictEqual(payload.completionTokens, 0)
})

test('Edge case: explicit tokens override text estimation', () => {
    _resetPricingForTests()

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: 'This should be ignored',
        completionText: 'This too',
        promptTokens: 999, // Explicit tokens win
        completionTokens: 888
    })

    assert.strictEqual(payload.promptTokens, 999)
    assert.strictEqual(payload.completionTokens, 888)
})

test('Edge case: zero explicit tokens should work', () => {
    _resetPricingForTests()

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptTokens: 0,
        completionTokens: 0
    })

    assert.strictEqual(payload.estimatedCostMicros, 0)
})

test('Privacy test: grep-style check for raw text fields', () => {
    _resetPricingForTests()

    const testPrompt = 'SENSITIVE_PROMPT_DATA_XYZ'
    const testCompletion = 'SENSITIVE_COMPLETION_DATA_ABC'

    const payload = prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: testPrompt,
        completionText: testCompletion
    })

    const payloadJson = JSON.stringify(payload)

    // Assert no raw text appears anywhere in payload
    assert.ok(!payloadJson.includes(testPrompt), 'Prompt text leaked into payload!')
    assert.ok(!payloadJson.includes(testCompletion), 'Completion text leaked into payload!')

    // Assert no field names that suggest raw text
    assert.ok(!payloadJson.includes('"promptText"'), 'promptText field name in payload!')
    assert.ok(!payloadJson.includes('"completionText"'), 'completionText field name in payload!')
    assert.ok(!payloadJson.includes('"text"'), 'Generic text field in payload!')
    assert.ok(!payloadJson.includes('"content"'), 'Generic content field in payload!')
})
