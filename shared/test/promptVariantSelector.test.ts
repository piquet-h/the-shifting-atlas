import assert from 'node:assert'
import test from 'node:test'
import { VariantBucketing, VariantSelector, type VariantConfig } from '../src/prompts/variantSelector.js'

test('bucketing: deterministic hash-based bucketing', () => {
    const userId1 = 'user-123'
    const userId2 = 'user-456'
    const templateId = 'location-gen'

    // Same user + template should always get same bucket
    const bucket1a = VariantBucketing.getBucket(userId1, templateId)
    const bucket1b = VariantBucketing.getBucket(userId1, templateId)
    assert.equal(bucket1a, bucket1b)

    // Different users should get different buckets (high probability)
    const bucket2 = VariantBucketing.getBucket(userId2, templateId)
    assert.notEqual(bucket1a, bucket2)

    // Bucket should be in [0, 100) range
    assert.ok(bucket1a >= 0 && bucket1a < 100)
    assert.ok(bucket2 >= 0 && bucket2 < 100)
})

test('bucketing: distribution uniformity', () => {
    const templateId = 'test-template'
    const buckets: number[] = []

    // Generate 1000 buckets with different user IDs
    for (let i = 0; i < 1000; i++) {
        const userId = `user-${i}`
        const bucket = VariantBucketing.getBucket(userId, templateId)
        buckets.push(bucket)
    }

    // Check distribution across 10 ranges
    const ranges = Array(10).fill(0)
    buckets.forEach((bucket) => {
        const rangeIndex = Math.floor(bucket / 10)
        ranges[rangeIndex]++
    })

    // Each range should have approximately 100 entries (±30% tolerance)
    ranges.forEach((count, index) => {
        assert.ok(count >= 70 && count <= 130, `Range ${index} has ${count} entries, expected ~100`)
    })
})

test('bucketing: anonymous user fallback', () => {
    const templateId = 'test-template'

    // Anonymous user gets a valid bucket
    const bucket = VariantBucketing.getBucket('anonymous', templateId)
    assert.ok(bucket >= 0 && bucket < 100)

    // Same anonymous user gets same bucket
    const bucket2 = VariantBucketing.getBucket('anonymous', templateId)
    assert.equal(bucket, bucket2)
})

test('variant selector: single variant 100% rollout', async () => {
    const config: VariantConfig = {
        templateId: 'location-gen',
        variants: [
            {
                id: 'control',
                templateId: 'location-gen-v1',
                rolloutPercent: 100
            }
        ],
        defaultVariant: 'control'
    }

    const selector = new VariantSelector()
    selector.setConfig('location-gen', config)

    // All users get the control variant
    const variant1 = selector.selectVariant('location-gen', 'user-123', 'stable')
    const variant2 = selector.selectVariant('location-gen', 'user-456', 'stable')

    assert.equal(variant1.id, 'control')
    assert.equal(variant2.id, 'control')
})

test('variant selector: 50/50 split', async () => {
    const config: VariantConfig = {
        templateId: 'location-gen',
        variants: [
            {
                id: 'control',
                templateId: 'location-gen-v1',
                rolloutPercent: 50
            },
            {
                id: 'experiment',
                templateId: 'location-gen-v2',
                rolloutPercent: 50
            }
        ],
        defaultVariant: 'control'
    }

    const selector = new VariantSelector()
    selector.setConfig('location-gen', config)

    // Generate many selections to verify distribution
    const counts = { control: 0, experiment: 0 }
    for (let i = 0; i < 1000; i++) {
        const variant = selector.selectVariant('location-gen', `user-${i}`, 'stable')
        counts[variant.id as keyof typeof counts]++
    }

    // Should be approximately 50/50 (±10% tolerance)
    assert.ok(counts.control >= 450 && counts.control <= 550, `Control: ${counts.control}`)
    assert.ok(counts.experiment >= 450 && counts.experiment <= 550, `Experiment: ${counts.experiment}`)
})

test('variant selector: gradual rollout', async () => {
    const config: VariantConfig = {
        templateId: 'location-gen',
        variants: [
            {
                id: 'control',
                templateId: 'location-gen-v1',
                rolloutPercent: 90
            },
            {
                id: 'experiment',
                templateId: 'location-gen-v2',
                rolloutPercent: 10
            }
        ],
        defaultVariant: 'control'
    }

    const selector = new VariantSelector()
    selector.setConfig('location-gen', config)

    // Generate many selections
    const counts = { control: 0, experiment: 0 }
    for (let i = 0; i < 1000; i++) {
        const variant = selector.selectVariant('location-gen', `user-${i}`, 'stable')
        counts[variant.id as keyof typeof counts]++
    }

    // Should be approximately 90/10 (±5% tolerance)
    assert.ok(counts.control >= 850 && counts.control <= 950, `Control: ${counts.control}`)
    assert.ok(counts.experiment >= 50 && counts.experiment <= 150, `Experiment: ${counts.experiment}`)
})

test('variant selector: channel-specific variants (stable vs canary)', async () => {
    const config: VariantConfig = {
        templateId: 'location-gen',
        variants: [
            {
                id: 'stable',
                templateId: 'location-gen-v1',
                rolloutPercent: 100,
                channels: ['stable']
            },
            {
                id: 'canary',
                templateId: 'location-gen-v2',
                rolloutPercent: 100,
                channels: ['canary']
            }
        ],
        defaultVariant: 'stable'
    }

    const selector = new VariantSelector()
    selector.setConfig('location-gen', config)

    const userId = 'user-123'

    // Stable channel gets stable variant
    const stableVariant = selector.selectVariant('location-gen', userId, 'stable')
    assert.equal(stableVariant.id, 'stable')

    // Canary channel gets canary variant
    const canaryVariant = selector.selectVariant('location-gen', userId, 'canary')
    assert.equal(canaryVariant.id, 'canary')
})

test('variant selector: default variant fallback', async () => {
    const config: VariantConfig = {
        templateId: 'location-gen',
        variants: [
            {
                id: 'control',
                templateId: 'location-gen-v1',
                rolloutPercent: 100
            }
        ],
        defaultVariant: 'control'
    }

    const selector = new VariantSelector()
    selector.setConfig('location-gen', config)

    // Unknown template falls back gracefully
    const variant = selector.selectVariant('unknown-template', 'user-123', 'stable')
    assert.ok(variant) // Should return some fallback variant
})

test('variant selector: consistent selection for same user', async () => {
    const config: VariantConfig = {
        templateId: 'location-gen',
        variants: [
            {
                id: 'control',
                templateId: 'location-gen-v1',
                rolloutPercent: 50
            },
            {
                id: 'experiment',
                templateId: 'location-gen-v2',
                rolloutPercent: 50
            }
        ],
        defaultVariant: 'control'
    }

    const selector = new VariantSelector()
    selector.setConfig('location-gen', config)

    const userId = 'user-stable-123'

    // Same user should always get same variant
    const variant1 = selector.selectVariant('location-gen', userId, 'stable')
    const variant2 = selector.selectVariant('location-gen', userId, 'stable')
    const variant3 = selector.selectVariant('location-gen', userId, 'stable')

    assert.equal(variant1.id, variant2.id)
    assert.equal(variant2.id, variant3.id)
})

test('variant selector: rollout percent validation', async () => {
    const selector = new VariantSelector()

    // Invalid: rollout percentages don't sum to 100
    assert.throws(() => {
        selector.setConfig('test', {
            templateId: 'test',
            variants: [
                { id: 'v1', templateId: 'test-v1', rolloutPercent: 60 },
                { id: 'v2', templateId: 'test-v2', rolloutPercent: 60 }
            ],
            defaultVariant: 'v1'
        })
    }, /sum to 100/)
})

test('variant selector: anonymous user handling', async () => {
    const config: VariantConfig = {
        templateId: 'location-gen',
        variants: [
            {
                id: 'control',
                templateId: 'location-gen-v1',
                rolloutPercent: 100
            }
        ],
        defaultVariant: 'control'
    }

    const selector = new VariantSelector()
    selector.setConfig('location-gen', config)

    // Anonymous users should get deterministic selection
    const variant1 = selector.selectVariant('location-gen', 'anonymous', 'stable')
    const variant2 = selector.selectVariant('location-gen', 'anonymous', 'stable')

    assert.equal(variant1.id, variant2.id)
})

test('variant selector: config update handling', async () => {
    const selector = new VariantSelector()

    // Initial config
    selector.setConfig('test', {
        templateId: 'test',
        variants: [{ id: 'v1', templateId: 'test-v1', rolloutPercent: 100 }],
        defaultVariant: 'v1'
    })

    const variant1 = selector.selectVariant('test', 'user-123', 'stable')
    assert.equal(variant1.id, 'v1')

    // Update config (rapid rollout change)
    selector.setConfig('test', {
        templateId: 'test',
        variants: [{ id: 'v2', templateId: 'test-v2', rolloutPercent: 100 }],
        defaultVariant: 'v2'
    })

    // Should immediately use new config
    const variant2 = selector.selectVariant('test', 'user-123', 'stable')
    assert.equal(variant2.id, 'v2')
})
