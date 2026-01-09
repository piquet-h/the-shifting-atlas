import assert from 'node:assert'
import test from 'node:test'
import type { TokenMetadata, TokenMetadataCollector } from '../src/types/tokenMetadata.js'

test('TokenMetadata interface: should have required properties', () => {
    const metadata: TokenMetadata = {
        modelId: 'gpt-4o-mini',
        promptTokens: 150,
        completionTokens: 50,
        totalTokens: 200,
        estimatorName: 'charDiv4'
    }

    assert.strictEqual(metadata.modelId, 'gpt-4o-mini')
    assert.strictEqual(metadata.promptTokens, 150)
    assert.strictEqual(metadata.completionTokens, 50)
    assert.strictEqual(metadata.totalTokens, 200)
    assert.strictEqual(metadata.estimatorName, 'charDiv4')
})

test('TokenMetadata interface: should accept optional cachedTokens property', () => {
    const metadata: TokenMetadata = {
        modelId: 'gpt-4o-mini',
        promptTokens: 150,
        completionTokens: 50,
        totalTokens: 200,
        estimatorName: 'charDiv4',
        cachedTokens: 100
    }

    assert.strictEqual(metadata.cachedTokens, 100)
})

test('TokenMetadata interface: should work without optional cachedTokens property', () => {
    const metadata: TokenMetadata = {
        modelId: 'gpt-4o-mini',
        promptTokens: 150,
        completionTokens: 50,
        totalTokens: 200,
        estimatorName: 'charDiv4'
    }

    assert.strictEqual(metadata.cachedTokens, undefined)
})

test('TokenMetadataCollector interface: should have collect method', () => {
    const collector: TokenMetadataCollector = {
        collect: (modelId: string, promptTokens: number, completionTokens: number, estimatorName: string) => ({
            modelId,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimatorName
        })
    }

    const result = collector.collect('gpt-4o-mini', 100, 50, 'charDiv4')

    assert.strictEqual(result.modelId, 'gpt-4o-mini')
    assert.strictEqual(result.promptTokens, 100)
    assert.strictEqual(result.completionTokens, 50)
    assert.strictEqual(result.totalTokens, 150)
    assert.strictEqual(result.estimatorName, 'charDiv4')
})

test('TokenMetadataCollector interface: should handle cachedTokens parameter', () => {
    const collector: TokenMetadataCollector = {
        collect: (modelId: string, promptTokens: number, completionTokens: number, estimatorName: string, cachedTokens?: number) => ({
            modelId,
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
            estimatorName,
            cachedTokens
        })
    }

    const result = collector.collect('gpt-4o-mini', 100, 50, 'charDiv4', 75)

    assert.strictEqual(result.cachedTokens, 75)
})

test('Edge case: should handle zero tokens', () => {
    const metadata: TokenMetadata = {
        modelId: 'gpt-4o-mini',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        estimatorName: 'charDiv4'
    }

    assert.strictEqual(metadata.promptTokens, 0)
    assert.strictEqual(metadata.completionTokens, 0)
    assert.strictEqual(metadata.totalTokens, 0)
})

test('Edge case: should handle large token counts', () => {
    const metadata: TokenMetadata = {
        modelId: 'gpt-4o-mini',
        promptTokens: 128_000,
        completionTokens: 16_000,
        totalTokens: 144_000,
        estimatorName: 'charDiv4'
    }

    assert.strictEqual(metadata.promptTokens, 128_000)
    assert.strictEqual(metadata.completionTokens, 16_000)
    assert.strictEqual(metadata.totalTokens, 144_000)
})

test('Edge case: cachedTokens should not exceed promptTokens (validation responsibility)', () => {
    // This test documents that cachedTokens validation happens at collection time,
    // not in the type definition. Type system allows invalid values; runtime must validate.
    const metadata: TokenMetadata = {
        modelId: 'gpt-4o-mini',
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        estimatorName: 'charDiv4',
        cachedTokens: 150 // Invalid: exceeds promptTokens, but type system allows it
    }

    // Type allows this; downstream validation should catch it
    assert.ok(metadata.cachedTokens > metadata.promptTokens)
})
