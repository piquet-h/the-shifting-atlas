import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHeaders } from '../src/utils/apiClient'
import { buildCorrelationHeaders, buildSessionHeaders, generateCorrelationId } from '../src/utils/correlation'

describe('API correlation integration', () => {
    describe('buildHeaders with correlation', () => {
        it('should merge correlation headers with other headers', () => {
            const correlationId = generateCorrelationId()
            const headers = buildHeaders({
                'Content-Type': 'application/json',
                ...buildCorrelationHeaders(correlationId)
            })

            expect(headers).toHaveProperty('Content-Type', 'application/json')
            expect(headers).toHaveProperty('x-correlation-id', correlationId)
        })

        it('should work without correlation headers', () => {
            const headers = buildHeaders({
                'Content-Type': 'application/json'
            })

            expect(headers).toHaveProperty('Content-Type', 'application/json')
            expect(headers).not.toHaveProperty('x-correlation-id')
        })

        it('should maintain consistent correlationId across retry', () => {
            // Simulate retry scenario where same correlationId should be used
            const correlationId = generateCorrelationId()

            // First attempt
            const headers1 = buildHeaders({
                ...buildCorrelationHeaders(correlationId)
            })

            // Retry with same correlationId
            const headers2 = buildHeaders({
                ...buildCorrelationHeaders(correlationId)
            })

            expect(headers1['x-correlation-id']).toBe(correlationId)
            expect(headers2['x-correlation-id']).toBe(correlationId)
            expect(headers1['x-correlation-id']).toBe(headers2['x-correlation-id'])
        })

        it('should generate different correlationIds for different actions', () => {
            // Simulate two separate actions (e.g., move then look)
            const moveCorrelationId = generateCorrelationId()
            const lookCorrelationId = generateCorrelationId()

            const moveHeaders = buildHeaders({
                ...buildCorrelationHeaders(moveCorrelationId)
            })

            const lookHeaders = buildHeaders({
                ...buildCorrelationHeaders(lookCorrelationId)
            })

            expect(moveHeaders['x-correlation-id']).toBe(moveCorrelationId)
            expect(lookHeaders['x-correlation-id']).toBe(lookCorrelationId)
            expect(moveHeaders['x-correlation-id']).not.toBe(lookHeaders['x-correlation-id'])
        })
    })

    describe('edge cases', () => {
        it('should handle rapid action generation (no memory leak)', () => {
            const correlationIds = new Set<string>()
            const count = 50

            for (let i = 0; i < count; i++) {
                const id = generateCorrelationId()
                correlationIds.add(id)
                const headers = buildHeaders({
                    ...buildCorrelationHeaders(id)
                })
                expect(headers['x-correlation-id']).toBe(id)
            }

            // All correlation IDs should be unique
            expect(correlationIds.size).toBe(count)
        })

        it('should handle empty string correlationId gracefully', () => {
            const headers = buildHeaders({
                ...buildCorrelationHeaders('')
            })

            // Empty string is falsy, so no header should be added
            expect(headers).not.toHaveProperty('x-correlation-id')
        })
    })

    describe('session header propagation', () => {
        let originalEnv: ImportMetaEnv

        beforeEach(() => {
            vi.resetModules()
            originalEnv = { ...import.meta.env }
        })

        afterEach(() => {
            Object.assign(import.meta.env, originalEnv)
        })

        it('should include x-session-id header when sessionId is provided', () => {
            const sessionId = 'test-session-123'
            const headers = buildHeaders({
                ...buildSessionHeaders(sessionId)
            })

            expect(headers).toHaveProperty('x-session-id', sessionId)
        })

        it('should merge session and correlation headers together', () => {
            const sessionId = 'test-session-abc'
            const correlationId = generateCorrelationId()

            const headers = buildHeaders({
                ...buildCorrelationHeaders(correlationId),
                ...buildSessionHeaders(sessionId)
            })

            expect(headers['x-correlation-id']).toBe(correlationId)
            expect(headers['x-session-id']).toBe(sessionId)
        })

        it('should not include x-session-id when sessionId is undefined', () => {
            const headers = buildHeaders({
                ...buildSessionHeaders(undefined)
            })

            expect(headers).not.toHaveProperty('x-session-id')
        })

        it('should not include x-session-id when sessionId is empty string', () => {
            const headers = buildHeaders({
                ...buildSessionHeaders('')
            })

            expect(headers).not.toHaveProperty('x-session-id')
        })
    })
})
