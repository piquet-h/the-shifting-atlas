import assert from 'node:assert'
import test from 'node:test'
import {
    validatePromptTemplate,
    validatePromptBundle,
    containsProtectedTokens,
    type PromptTemplate
} from '../src/prompts/schema.js'

test('prompt template schema: valid minimal template', () => {
    const template = {
        metadata: {
            id: 'test-template',
            version: '1.0.0',
            name: 'Test Template',
            description: 'A test template'
        },
        template: 'Hello, world!'
    }

    const result = validatePromptTemplate(template)
    assert.ok(result.valid)
    assert.ok(result.template)
    assert.equal(result.template.metadata.id, 'test-template')
})

test('prompt template schema: valid template with variables', () => {
    const template = {
        metadata: {
            id: 'location-gen',
            version: '1.0.0',
            name: 'Location Generator',
            description: 'Generates location descriptions'
        },
        template: 'Generate a [terrain_type] location',
        variables: [
            {
                name: 'terrain_type',
                description: 'Type of terrain',
                required: true
            }
        ]
    }

    const result = validatePromptTemplate(template)
    assert.ok(result.valid)
    assert.ok(result.template)
    assert.equal(result.template.variables?.length, 1)
})

test('prompt template schema: invalid id format', () => {
    const template = {
        metadata: {
            id: 'Invalid ID!', // Uppercase and special chars
            version: '1.0.0',
            name: 'Test',
            description: 'Test'
        },
        template: 'test'
    }

    const result = validatePromptTemplate(template)
    assert.equal(result.valid, false)
    assert.ok(result.errors)
})

test('prompt template schema: invalid version format', () => {
    const template = {
        metadata: {
            id: 'test',
            version: 'v1.0', // Invalid semver
            name: 'Test',
            description: 'Test'
        },
        template: 'test'
    }

    const result = validatePromptTemplate(template)
    assert.equal(result.valid, false)
})

test('prompt template schema: missing required fields', () => {
    const template = {
        metadata: {
            id: 'test',
            version: '1.0.0'
            // Missing name and description
        },
        template: 'test'
    }

    const result = validatePromptTemplate(template)
    assert.equal(result.valid, false)
})

test('prompt template schema: template too long', () => {
    const template = {
        metadata: {
            id: 'test',
            version: '1.0.0',
            name: 'Test',
            description: 'Test'
        },
        template: 'x'.repeat(50001) // Exceeds max length
    }

    const result = validatePromptTemplate(template)
    assert.equal(result.valid, false)
})

test('prompt bundle schema: valid bundle', () => {
    const bundle = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        templates: {
            'test-1': {
                metadata: {
                    id: 'test-1',
                    version: '1.0.0',
                    name: 'Test 1',
                    description: 'First test'
                },
                template: 'Test 1'
            }
        },
        hashes: {
            'test-1': 'abc123def456'
        }
    }

    const result = validatePromptBundle(bundle)
    assert.ok(result.valid)
    assert.ok(result.bundle)
})

test('protected tokens: detects api key', () => {
    assert.ok(containsProtectedTokens('Use API_KEY: sk-abc123'))
    assert.ok(containsProtectedTokens('Set the api_key variable'))
})

test('protected tokens: detects secret', () => {
    assert.ok(containsProtectedTokens('Store in SECRET_VALUE'))
    assert.ok(containsProtectedTokens('password=hunter2'))
})

test('protected tokens: detects OpenAI-style keys', () => {
    assert.ok(containsProtectedTokens('sk-proj-abcdefghijklmnopqrstuvwxyz123456'))
})

test('protected tokens: safe template passes', () => {
    assert.equal(containsProtectedTokens('Generate a location with [terrain_type]'), false)
    assert.equal(containsProtectedTokens('Hello, [player_name]!'), false)
})

test('protected tokens: detects private key', () => {
    assert.ok(containsProtectedTokens('-----BEGIN RSA PRIVATE KEY-----'))
})
