import assert from 'node:assert'
import test from 'node:test'
import {
    canonicalizeTemplate,
    computeTemplateHash,
    verifyTemplateHash,
    hashTemplates
} from '../src/prompts/canonicalize.js'
import type { PromptTemplate } from '../src/prompts/schema.js'

const sampleTemplate: PromptTemplate = {
    metadata: {
        id: 'test-template',
        version: '1.0.0',
        name: 'Test Template',
        description: 'A test template'
    },
    template: 'Hello, [name]!'
}

test('canonicalize: produces deterministic JSON', () => {
    const canonical1 = canonicalizeTemplate(sampleTemplate)
    const canonical2 = canonicalizeTemplate(sampleTemplate)

    assert.equal(canonical1, canonical2)
})

test('canonicalize: sorts keys alphabetically', () => {
    const template = {
        metadata: {
            version: '1.0.0',
            id: 'test', // id comes after version alphabetically
            name: 'Test',
            description: 'Test'
        },
        template: 'test'
    }

    const canonical = canonicalizeTemplate(template as PromptTemplate)

    // In canonical form, 'description' < 'id' < 'name' < 'version'
    const idIndex = canonical.indexOf('"id"')
    const versionIndex = canonical.indexOf('"version"')
    const nameIndex = canonical.indexOf('"name"')
    const descIndex = canonical.indexOf('"description"')

    assert.ok(descIndex < idIndex)
    assert.ok(idIndex < nameIndex)
    assert.ok(nameIndex < versionIndex)
})

test('canonicalize: handles nested objects', () => {
    const template: PromptTemplate = {
        metadata: {
            id: 'test',
            version: '1.0.0',
            name: 'Test',
            description: 'Test',
            tags: ['tag2', 'tag1'] // Array order preserved
        },
        template: 'test',
        variables: [
            {
                name: 'var1',
                description: 'Variable 1',
                required: true
            }
        ]
    }

    const canonical = canonicalizeTemplate(template)
    assert.ok(canonical.includes('"tags":["tag2","tag1"]')) // Array order preserved
})

test('canonicalize: removes undefined values', () => {
    const template = {
        metadata: {
            id: 'test',
            version: '1.0.0',
            name: 'Test',
            description: 'Test',
            author: undefined
        },
        template: 'test'
    }

    const canonical = canonicalizeTemplate(template as PromptTemplate)
    assert.equal(canonical.includes('author'), false)
})

test('computeTemplateHash: produces SHA256 hex digest', () => {
    const hash = computeTemplateHash(sampleTemplate)

    assert.equal(typeof hash, 'string')
    assert.equal(hash.length, 64) // SHA256 hex is 64 chars
    assert.ok(/^[a-f0-9]{64}$/.test(hash))
})

test('computeTemplateHash: same input produces same hash', () => {
    const hash1 = computeTemplateHash(sampleTemplate)
    const hash2 = computeTemplateHash(sampleTemplate)

    assert.equal(hash1, hash2)
})

test('computeTemplateHash: different inputs produce different hashes', () => {
    const template2: PromptTemplate = {
        ...sampleTemplate,
        template: 'Different content'
    }

    const hash1 = computeTemplateHash(sampleTemplate)
    const hash2 = computeTemplateHash(template2)

    assert.notEqual(hash1, hash2)
})

test('computeTemplateHash: key order does not affect hash', () => {
    const template1 = {
        template: 'test',
        metadata: {
            description: 'Test',
            name: 'Test',
            version: '1.0.0',
            id: 'test'
        }
    }

    const template2 = {
        metadata: {
            id: 'test',
            version: '1.0.0',
            name: 'Test',
            description: 'Test'
        },
        template: 'test'
    }

    const hash1 = computeTemplateHash(template1 as PromptTemplate)
    const hash2 = computeTemplateHash(template2 as PromptTemplate)

    assert.equal(hash1, hash2)
})

test('verifyTemplateHash: returns true for matching hash', () => {
    const hash = computeTemplateHash(sampleTemplate)
    assert.ok(verifyTemplateHash(sampleTemplate, hash))
})

test('verifyTemplateHash: returns false for mismatched hash', () => {
    const wrongHash = 'a'.repeat(64)
    assert.equal(verifyTemplateHash(sampleTemplate, wrongHash), false)
})

test('hashTemplates: batch hashes multiple templates', () => {
    const templates = {
        template1: sampleTemplate,
        template2: {
            metadata: {
                id: 'template2',
                version: '1.0.0',
                name: 'Template 2',
                description: 'Second template'
            },
            template: 'Goodbye, [name]!'
        }
    }

    const hashes = hashTemplates(templates)

    assert.equal(Object.keys(hashes).length, 2)
    assert.ok(hashes.template1)
    assert.ok(hashes.template2)
    assert.equal(hashes.template1.length, 64)
    assert.equal(hashes.template2.length, 64)
    assert.notEqual(hashes.template1, hashes.template2)
})
