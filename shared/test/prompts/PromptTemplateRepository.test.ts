/**
 * Tests for PromptTemplateRepository
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import { PromptTemplateRepository } from '../../src/prompts/PromptTemplateRepository.js'
import { computeTemplateHash } from '../../src/prompts/hash.js'

describe('PromptTemplateRepository', () => {
    describe('getLatest', () => {
        test('retrieves latest version of a known template', async () => {
            const repo = new PromptTemplateRepository()
            const template = await repo.getLatest('location')

            assert.ok(template, 'Template should be found')
            assert.strictEqual(template.id, 'location')
            assert.strictEqual(template.version, '1.0.0')
            assert.ok(template.content.length > 0, 'Content should not be empty')
            assert.ok(template.hash, 'Hash should be present')
            assert.strictEqual(template.hash, computeTemplateHash(template.content), 'Hash should match content')
        })

        test('returns undefined for unknown template id', async () => {
            const repo = new PromptTemplateRepository()
            const template = await repo.getLatest('nonexistent')

            assert.strictEqual(template, undefined)
        })
    })

    describe('getByVersion', () => {
        test('retrieves specific version of a template', async () => {
            const repo = new PromptTemplateRepository()
            const template = await repo.getByVersion('npc_dialogue', '1.0.0')

            assert.ok(template, 'Template should be found')
            assert.strictEqual(template.id, 'npc_dialogue')
            assert.strictEqual(template.version, '1.0.0')
        })

        test('returns undefined for non-existent version', async () => {
            const repo = new PromptTemplateRepository()
            const template = await repo.getByVersion('location', '2.0.0')

            assert.strictEqual(template, undefined)
        })
    })

    describe('get with query', () => {
        test('retrieves template by id only (latest version)', async () => {
            const repo = new PromptTemplateRepository()
            const template = await repo.get({ id: 'quest' })

            assert.ok(template, 'Template should be found')
            assert.strictEqual(template.id, 'quest')
            assert.strictEqual(template.version, '1.0.0')
        })

        test('retrieves template by id and version', async () => {
            const repo = new PromptTemplateRepository()
            const template = await repo.get({ id: 'location', version: '1.0.0' })

            assert.ok(template, 'Template should be found')
            assert.strictEqual(template.id, 'location')
            assert.strictEqual(template.version, '1.0.0')
        })

        test('verifies hash if provided and matches', async () => {
            const repo = new PromptTemplateRepository()
            // First get the template to obtain its hash
            const template1 = await repo.get({ id: 'location' })
            assert.ok(template1, 'Template should be found')

            // Now query with the hash
            const template2 = await repo.get({ id: 'location', hash: template1.hash })
            assert.ok(template2, 'Template should be found with matching hash')
            assert.strictEqual(template2.id, 'location')
        })

        test('returns undefined if hash does not match', async () => {
            const repo = new PromptTemplateRepository()
            const template = await repo.get({
                id: 'location',
                hash: 'invalid-hash-that-will-not-match'
            })

            assert.strictEqual(template, undefined, 'Should not return template with mismatched hash')
        })
    })

    describe('caching', () => {
        test('caches templates and serves from cache on subsequent requests', async () => {
            const repo = new PromptTemplateRepository({ ttlMs: 5000 })

            // First request
            const template1 = await repo.getLatest('location')
            assert.ok(template1)

            // Second request (should hit cache)
            const template2 = await repo.getLatest('location')
            assert.ok(template2)
            assert.deepStrictEqual(template2, template1, 'Cached template should be identical')
        })

        test('respects TTL and reloads after expiration', async () => {
            const repo = new PromptTemplateRepository({ ttlMs: 50 }) // 50ms TTL

            // First request
            const template1 = await repo.getLatest('location')
            assert.ok(template1)

            // Wait for TTL to expire
            await new Promise((resolve) => setTimeout(resolve, 100))

            // Second request (should reload, not from cache)
            const template2 = await repo.getLatest('location')
            assert.ok(template2)
            // Both should have same content, but they are freshly loaded
            assert.strictEqual(template2.content, template1.content)
        })

        test('clearCache removes all cached templates', async () => {
            const repo = new PromptTemplateRepository()

            // Load a template
            const template1 = await repo.getLatest('location')
            assert.ok(template1)

            // Clear cache
            repo.clearCache()

            // Next request should reload (we can't directly verify this, but it should still work)
            const template2 = await repo.getLatest('location')
            assert.ok(template2)
            assert.strictEqual(template2.content, template1.content)
        })
    })

    describe('listIds', () => {
        test('returns all available template ids', async () => {
            const repo = new PromptTemplateRepository()
            const ids = await repo.listIds()

            assert.ok(Array.isArray(ids))
            assert.ok(ids.length > 0)
            assert.ok(ids.includes('location'))
            assert.ok(ids.includes('npc_dialogue'))
            assert.ok(ids.includes('quest'))
        })
    })

    describe('metadata', () => {
        test('includes metadata in returned templates', async () => {
            const repo = new PromptTemplateRepository()
            const template = await repo.getLatest('location')

            assert.ok(template, 'Template should be found')
            assert.ok(template.metadata, 'Metadata should be present')
            assert.ok(template.metadata.description, 'Description should be present')
            assert.ok(Array.isArray(template.metadata.tags), 'Tags should be an array')
        })
    })
})
