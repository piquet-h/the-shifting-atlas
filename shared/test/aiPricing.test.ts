import assert from 'node:assert'
import test from 'node:test'
import { getPricing, getRegisteredModelIds, applyPricingOverride, _resetPricingForTests } from '../src/aiPricing.js'

test('default pricing includes generic fallback', () => {
    _resetPricingForTests()

    const pricing = getPricing('generic')

    assert.strictEqual(pricing.modelId, 'generic')
    assert.strictEqual(typeof pricing.promptPer1k, 'number')
    assert.strictEqual(typeof pricing.completionPer1k, 'number')
    assert.ok(pricing.promptPer1k > 0, 'Generic prompt pricing should be positive')
    assert.ok(pricing.completionPer1k > 0, 'Generic completion pricing should be positive')
})

test('default pricing includes gpt-4o-mini', () => {
    _resetPricingForTests()

    const pricing = getPricing('gpt-4o-mini')

    assert.strictEqual(pricing.modelId, 'gpt-4o-mini')
    assert.strictEqual(pricing.promptPer1k, 0.00015)
    assert.strictEqual(pricing.completionPer1k, 0.0006)
})

test('unknown model falls back to generic', () => {
    _resetPricingForTests()

    const pricing = getPricing('unknown-model-xyz')

    // Should return generic pricing values
    const genericPricing = getPricing('generic')
    assert.strictEqual(pricing.promptPer1k, genericPricing.promptPer1k)
    assert.strictEqual(pricing.completionPer1k, genericPricing.completionPer1k)

    // But preserve original modelId for telemetry
    assert.strictEqual(pricing.modelId, 'unknown-model-xyz')
})

test('empty override JSON is treated as no-op', () => {
    _resetPricingForTests()

    const result = applyPricingOverride('')

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.reason, null)

    // Should still have default pricing
    const pricing = getPricing('gpt-4o-mini')
    assert.strictEqual(pricing.modelId, 'gpt-4o-mini')
})

test('whitespace-only override JSON is treated as no-op', () => {
    _resetPricingForTests()

    const result = applyPricingOverride('   \n  ')

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.reason, null)
})

test('undefined override is treated as no-op', () => {
    _resetPricingForTests()

    const result = applyPricingOverride(undefined)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.reason, null)
})

test('valid override merges new model', () => {
    _resetPricingForTests()

    const override = JSON.stringify({
        'gpt-4-turbo': {
            promptPer1k: 0.01,
            completionPer1k: 0.03
        }
    })

    const result = applyPricingOverride(override)

    assert.strictEqual(result.success, true)
    assert.strictEqual(result.reason, null)

    const pricing = getPricing('gpt-4-turbo')
    assert.strictEqual(pricing.modelId, 'gpt-4-turbo')
    assert.strictEqual(pricing.promptPer1k, 0.01)
    assert.strictEqual(pricing.completionPer1k, 0.03)

    // Default models should still exist
    const defaultPricing = getPricing('gpt-4o-mini')
    assert.strictEqual(defaultPricing.modelId, 'gpt-4o-mini')
})

test('valid override overwrites existing model', () => {
    _resetPricingForTests()

    const override = JSON.stringify({
        'gpt-4o-mini': {
            promptPer1k: 0.999,
            completionPer1k: 0.888
        }
    })

    const result = applyPricingOverride(override)

    assert.strictEqual(result.success, true)

    const pricing = getPricing('gpt-4o-mini')
    assert.strictEqual(pricing.modelId, 'gpt-4o-mini')
    assert.strictEqual(pricing.promptPer1k, 0.999)
    assert.strictEqual(pricing.completionPer1k, 0.888)
})

test('malformed JSON triggers override rejection', () => {
    _resetPricingForTests()

    const result = applyPricingOverride('{ invalid json }')

    assert.strictEqual(result.success, false)
    assert.ok(result.reason?.includes('parse'))

    // Should preserve default pricing
    const pricing = getPricing('gpt-4o-mini')
    assert.strictEqual(pricing.promptPer1k, 0.00015)
})

test('non-object JSON triggers override rejection', () => {
    _resetPricingForTests()

    const result = applyPricingOverride('["array", "not", "object"]')

    assert.strictEqual(result.success, false)
    assert.ok(result.reason?.includes('object'))
})

test('null JSON triggers override rejection', () => {
    _resetPricingForTests()

    const result = applyPricingOverride('null')

    assert.strictEqual(result.success, false)
    assert.ok(result.reason?.includes('object'))
})

test('missing promptPer1k triggers override rejection', () => {
    _resetPricingForTests()

    const override = JSON.stringify({
        'test-model': {
            completionPer1k: 0.5
        }
    })

    const result = applyPricingOverride(override)

    assert.strictEqual(result.success, false)
    assert.ok(result.reason?.includes('promptPer1k'))
    assert.ok(result.reason?.includes('numbers'))
})

test('missing completionPer1k triggers override rejection', () => {
    _resetPricingForTests()

    const override = JSON.stringify({
        'test-model': {
            promptPer1k: 0.5
        }
    })

    const result = applyPricingOverride(override)

    assert.strictEqual(result.success, false)
    assert.ok(result.reason?.includes('completionPer1k'))
    assert.ok(result.reason?.includes('numbers'))
})

test('string pricing values trigger override rejection', () => {
    _resetPricingForTests()

    const override = JSON.stringify({
        'test-model': {
            promptPer1k: '0.5',
            completionPer1k: '0.6'
        }
    })

    const result = applyPricingOverride(override)

    assert.strictEqual(result.success, false)
    assert.ok(result.reason?.includes('numbers'))
})

test('negative pricing values trigger override rejection', () => {
    _resetPricingForTests()

    const override = JSON.stringify({
        'test-model': {
            promptPer1k: -0.5,
            completionPer1k: 0.6
        }
    })

    const result = applyPricingOverride(override)

    assert.strictEqual(result.success, false)
    assert.ok(result.reason?.includes('non-negative'))
})

test('zero pricing values are allowed', () => {
    _resetPricingForTests()

    const override = JSON.stringify({
        'free-model': {
            promptPer1k: 0,
            completionPer1k: 0
        }
    })

    const result = applyPricingOverride(override)

    assert.strictEqual(result.success, true)

    const pricing = getPricing('free-model')
    assert.strictEqual(pricing.promptPer1k, 0)
    assert.strictEqual(pricing.completionPer1k, 0)
})

test('large pricing table loads quickly', () => {
    _resetPricingForTests()

    // Generate pricing for 20+ models
    const largePricing: Record<string, { promptPer1k: number; completionPer1k: number }> = {}
    for (let i = 0; i < 25; i++) {
        largePricing[`model-${i}`] = {
            promptPer1k: 0.001 * i,
            completionPer1k: 0.002 * i
        }
    }

    const startTime = performance.now()
    const result = applyPricingOverride(JSON.stringify(largePricing))
    const endTime = performance.now()

    const loadTimeMs = endTime - startTime

    assert.strictEqual(result.success, true)
    assert.ok(loadTimeMs < 50, `Load time ${loadTimeMs}ms should be < 50ms`)

    // Verify a sample model loaded correctly
    const pricing = getPricing('model-10')
    assert.strictEqual(pricing.promptPer1k, 0.01)
})

test('getRegisteredModelIds returns all models', () => {
    _resetPricingForTests()

    const override = JSON.stringify({
        'custom-model-1': {
            promptPer1k: 0.1,
            completionPer1k: 0.2
        },
        'custom-model-2': {
            promptPer1k: 0.3,
            completionPer1k: 0.4
        }
    })

    applyPricingOverride(override)

    const modelIds = getRegisteredModelIds()

    // Should include defaults + overrides
    assert.ok(modelIds.includes('generic'))
    assert.ok(modelIds.includes('gpt-4o-mini'))
    assert.ok(modelIds.includes('custom-model-1'))
    assert.ok(modelIds.includes('custom-model-2'))
    assert.ok(modelIds.length >= 4)
})

test('multiple models in override are all registered', () => {
    _resetPricingForTests()

    const override = JSON.stringify({
        'model-a': { promptPer1k: 0.1, completionPer1k: 0.2 },
        'model-b': { promptPer1k: 0.3, completionPer1k: 0.4 },
        'model-c': { promptPer1k: 0.5, completionPer1k: 0.6 }
    })

    const result = applyPricingOverride(override)

    assert.strictEqual(result.success, true)

    const pricingA = getPricing('model-a')
    assert.strictEqual(pricingA.promptPer1k, 0.1)

    const pricingB = getPricing('model-b')
    assert.strictEqual(pricingB.promptPer1k, 0.3)

    const pricingC = getPricing('model-c')
    assert.strictEqual(pricingC.promptPer1k, 0.5)
})

test('override rejection preserves default pricing', () => {
    _resetPricingForTests()

    const result = applyPricingOverride('{ invalid }')

    assert.strictEqual(result.success, false)

    // All default models should still be accessible
    const generic = getPricing('generic')
    assert.ok(generic.promptPer1k > 0)

    const gpt4oMini = getPricing('gpt-4o-mini')
    assert.strictEqual(gpt4oMini.promptPer1k, 0.00015)
})
