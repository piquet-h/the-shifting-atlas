/**
 * Unit tests for GetPromptTemplate handler
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { HttpRequest, InvocationContext } from '@azure/functions'
import type { IPromptTemplateRepository, PromptTemplate } from '@piquet-h/shared'
import { GetPromptTemplateHandler } from '../../src/handlers/getPromptTemplate.js'
import { UnitTestFixture } from '../helpers/UnitTestFixture.js'

// Helper to create a mock HttpRequest with query and headers
function createMockRequest(params: Record<string, string>, queryParams?: Map<string, string>, headers?: Map<string, string>): HttpRequest {
    return {
        params,
        query: {
            get: (key: string) => queryParams?.get(key) || null
        },
        headers: {
            get: (key: string) => headers?.get(key) || null
        }
    } as unknown as HttpRequest
}

// Helper to create a mock InvocationContext
function createMockContext(container: any): InvocationContext {
    return {
        invocationId: 'test-id',
        extraInputs: new Map([['container', container]])
    } as unknown as InvocationContext
}

describe('GetPromptTemplateHandler', () => {
    describe('execute', () => {
        test('returns 400 if template id is missing', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const handler = container.get(GetPromptTemplateHandler)

            const mockReq = createMockRequest({})
            const mockContext = createMockContext(container)

            const response = await handler.handle(mockReq, mockContext)

            assert.strictEqual(response.status, 400)
            const body = JSON.parse(JSON.stringify(response.jsonBody))
            assert.ok(body.err)
            assert.strictEqual(body.err.code, 'MissingTemplateId')
        })

        test('returns 404 if template not found', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const mockRepo = container.get<IPromptTemplateRepository>('IPromptTemplateRepository')

            // Verify repository is injected
            assert.ok(mockRepo, 'Repository should be injected')
            assert.ok(typeof mockRepo.get === 'function', 'Repository should have get method')

            // Mock get to return undefined (not found)
            const originalGet = mockRepo.get.bind(mockRepo)
            mockRepo.get = async () => undefined

            const handler = container.get(GetPromptTemplateHandler)

            const mockReq = createMockRequest({ id: 'nonexistent' })
            const mockContext = createMockContext(container)

            const response = await handler.handle(mockReq, mockContext)

            assert.strictEqual(response.status, 404)
            const body = JSON.parse(JSON.stringify(response.jsonBody))
            assert.ok(body.err)
            assert.strictEqual(body.err.code, 'NotFound')

            // Restore
            mockRepo.get = originalGet
        })

        test('returns 400 if both version and hash specified', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const handler = container.get(GetPromptTemplateHandler)

            const mockReq = createMockRequest(
                { id: 'location' },
                new Map([
                    ['version', '1.0.0'],
                    ['hash', 'somehash']
                ])
            )
            const mockContext = createMockContext(container)

            const response = await handler.handle(mockReq, mockContext)

            assert.strictEqual(response.status, 400)
            const body = JSON.parse(JSON.stringify(response.jsonBody))
            assert.ok(body.err)
            assert.strictEqual(body.err.code, 'ConflictingParameters')
        })

        test('returns 200 with template data when found', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const mockRepo = container.get<IPromptTemplateRepository>('IPromptTemplateRepository')

            const mockTemplate: PromptTemplate = {
                id: 'location',
                version: '1.0.0',
                content: 'Test template content',
                hash: 'abc123'
            }

            // Mock get to return our template
            mockRepo.get = async () => mockTemplate

            const handler = container.get(GetPromptTemplateHandler)

            const mockReq = createMockRequest({ id: 'location' })
            const mockContext = createMockContext(container)

            const response = await handler.handle(mockReq, mockContext)

            assert.strictEqual(response.status, 200)
            assert.ok(response.headers)
            assert.strictEqual(response.headers['ETag'], 'abc123')
            assert.ok(response.headers['Cache-Control']?.includes('max-age=300'))

            const body = JSON.parse(JSON.stringify(response.jsonBody))
            assert.ok(body.ok)
            assert.strictEqual(body.ok.id, 'location')
            assert.strictEqual(body.ok.hash, 'abc123')
        })

        test('returns 304 Not Modified when ETag matches', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const mockRepo = container.get<IPromptTemplateRepository>('IPromptTemplateRepository')

            const mockTemplate: PromptTemplate = {
                id: 'location',
                version: '1.0.0',
                content: 'Test template content',
                hash: 'abc123'
            }

            mockRepo.get = async () => mockTemplate

            const handler = container.get(GetPromptTemplateHandler)

            const mockReq = createMockRequest({ id: 'location' }, undefined, new Map([['if-none-match', 'abc123']]))
            const mockContext = createMockContext(container)

            const response = await handler.handle(mockReq, mockContext)

            assert.strictEqual(response.status, 304)
            assert.ok(response.headers)
            assert.strictEqual(response.headers['ETag'], 'abc123')
        })

        test('retrieves template by version when specified', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const mockRepo = container.get<IPromptTemplateRepository>('IPromptTemplateRepository')

            const mockTemplate: PromptTemplate = {
                id: 'location',
                version: '1.0.0',
                content: 'Test template content',
                hash: 'abc123'
            }

            let capturedQuery: any = null
            mockRepo.get = async (query) => {
                capturedQuery = query
                return mockTemplate
            }

            const handler = container.get(GetPromptTemplateHandler)

            const mockReq = createMockRequest({ id: 'location' }, new Map([['version', '1.0.0']]))
            const mockContext = createMockContext(container)

            const response = await handler.handle(mockReq, mockContext)

            assert.strictEqual(response.status, 200)
            assert.ok(capturedQuery)
            assert.strictEqual(capturedQuery.id, 'location')
            assert.strictEqual(capturedQuery.version, '1.0.0')
        })

        test('retrieves template by hash when specified', async () => {
            const fixture = new UnitTestFixture()
            const container = await fixture.getContainer()
            const mockRepo = container.get<IPromptTemplateRepository>('IPromptTemplateRepository')

            const mockTemplate: PromptTemplate = {
                id: 'location',
                version: '1.0.0',
                content: 'Test template content',
                hash: 'abc123'
            }

            let capturedQuery: any = null
            mockRepo.get = async (query) => {
                capturedQuery = query
                return mockTemplate
            }

            const handler = container.get(GetPromptTemplateHandler)

            const mockReq = createMockRequest({ id: 'location' }, new Map([['hash', 'abc123']]))
            const mockContext = createMockContext(container)

            const response = await handler.handle(mockReq, mockContext)

            assert.strictEqual(response.status, 200)
            assert.ok(capturedQuery)
            assert.strictEqual(capturedQuery.id, 'location')
            assert.strictEqual(capturedQuery.hash, 'abc123')
        })
    })
})
