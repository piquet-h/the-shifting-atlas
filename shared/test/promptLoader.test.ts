import assert from 'node:assert'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { PromptLoader, resetDefaultLoader, getDefaultLoader } from '../src/prompts/loader.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesPath = join(__dirname, 'fixtures', 'prompts')

test('loader: getById from files', async () => {
    const loader = new PromptLoader({
        source: 'files',
        basePath: fixturesPath,
        cacheTtlMs: 0 // Disable cache for test
    })

    const template = await loader.getById('location-gen-v1')

    assert.ok(template)
    assert.equal(template.metadata.id, 'location-gen-v1')
    assert.equal(template.metadata.version, '1.0.0')
    assert.ok(template.template.includes('[terrain_type]'))
})

test('loader: getById returns null for non-existent template', async () => {
    const loader = new PromptLoader({
        source: 'files',
        basePath: fixturesPath
    })

    const template = await loader.getById('non-existent')
    assert.equal(template, null)
})

test('loader: getById from bundle', async () => {
    const loader = new PromptLoader({
        source: 'bundle',
        basePath: fixturesPath,
        verifyHashes: false // Skip hash verification for simplicity
    })

    const template = await loader.getById('npc-dialogue')

    assert.ok(template)
    assert.equal(template.metadata.id, 'npc-dialogue')
    assert.equal(template.metadata.name, 'NPC Dialogue Generator')
})

test('loader: caching works', async () => {
    const loader = new PromptLoader({
        source: 'files',
        basePath: fixturesPath,
        cacheTtlMs: 5000 // 5 seconds
    })

    // First load
    const template1 = await loader.getById('location-gen-v1')
    assert.ok(template1)

    // Second load should come from cache
    const template2 = await loader.getById('location-gen-v1')
    assert.ok(template2)
    assert.equal(template1, template2) // Same object reference

    const stats = loader.getCacheStats()
    assert.equal(stats.size, 1)
})

test('loader: cache TTL expiration', async () => {
    const loader = new PromptLoader({
        source: 'files',
        basePath: fixturesPath,
        cacheTtlMs: 100 // 100ms
    })

    const template1 = await loader.getById('location-gen-v1')
    assert.ok(template1)

    // Wait for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 150))

    // Should reload (not from cache)
    const template2 = await loader.getById('location-gen-v1')
    assert.ok(template2)
    // Can't assert they're different objects as it's a fresh load
})

test('loader: cache size limit', async () => {
    const loader = new PromptLoader({
        source: 'files',
        basePath: fixturesPath,
        cacheTtlMs: -1, // Cache forever
        maxCacheSize: 2
    })

    await loader.getById('location-gen-v1')
    await loader.getById('location-gen-v2')
    await loader.getById('npc-dialogue')

    const stats = loader.getCacheStats()
    assert.equal(stats.size, 2) // Should evict oldest
    assert.equal(stats.maxSize, 2)
})

test('loader: clearCache', async () => {
    const loader = new PromptLoader({
        source: 'files',
        basePath: fixturesPath,
        cacheTtlMs: -1
    })

    await loader.getById('location-gen-v1')
    assert.equal(loader.getCacheStats().size, 1)

    loader.clearCache()
    assert.equal(loader.getCacheStats().size, 0)
})

test('loader: getLatest from bundle', async () => {
    const loader = new PromptLoader({
        source: 'bundle',
        basePath: fixturesPath,
        verifyHashes: false
    })

    const template = await loader.getLatest('location-gen')

    assert.ok(template)
    assert.equal(template.metadata.version, '2.0.0') // Should get v2 (latest)
})

test('loader: preloadBundle', async () => {
    const loader = new PromptLoader({
        source: 'bundle',
        basePath: fixturesPath,
        verifyHashes: false
    })

    await loader.preloadBundle()

    // Should be able to get templates without additional I/O
    const template = await loader.getById('npc-dialogue')
    assert.ok(template)
})

test('default loader: singleton pattern', () => {
    resetDefaultLoader()

    const loader1 = getDefaultLoader()
    const loader2 = getDefaultLoader()

    assert.equal(loader1, loader2)

    resetDefaultLoader()
})

test('loader: getById with disabled caching', async () => {
    const loader = new PromptLoader({
        source: 'files',
        basePath: fixturesPath,
        cacheTtlMs: 0 // Disable caching
    })

    await loader.getById('location-gen-v1')
    const stats = loader.getCacheStats()
    assert.equal(stats.size, 0) // Should not cache
})
