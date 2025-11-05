import { describe, it, expect } from 'vitest'
import { generateCorrelationId, buildCorrelationHeaders } from '../src/utils/correlation'

describe('correlation utilities', () => {
    describe('generateCorrelationId', () => {
        it('should generate a valid UUID', () => {
            const correlationId = generateCorrelationId()
            expect(correlationId).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
        })

        it('should generate unique IDs on successive calls', () => {
            const id1 = generateCorrelationId()
            const id2 = generateCorrelationId()
            const id3 = generateCorrelationId()

            expect(id1).not.toBe(id2)
            expect(id2).not.toBe(id3)
            expect(id1).not.toBe(id3)
        })

        it('should handle rapid successive calls (no memory leak)', () => {
            const ids = new Set<string>()
            const count = 100

            for (let i = 0; i < count; i++) {
                ids.add(generateCorrelationId())
            }

            // All IDs should be unique
            expect(ids.size).toBe(count)
        })
    })

    describe('buildCorrelationHeaders', () => {
        it('should return empty object when no correlationId provided', () => {
            const headers = buildCorrelationHeaders()
            expect(headers).toEqual({})
        })

        it('should return empty object when correlationId is undefined', () => {
            const headers = buildCorrelationHeaders(undefined)
            expect(headers).toEqual({})
        })

        it('should include x-correlation-id header when correlationId provided', () => {
            const correlationId = '12345678-1234-1234-1234-123456789abc'
            const headers = buildCorrelationHeaders(correlationId)

            expect(headers).toEqual({
                'x-correlation-id': correlationId
            })
        })

        it('should handle UUID format correlationIds', () => {
            const correlationId = generateCorrelationId()
            const headers = buildCorrelationHeaders(correlationId)

            expect(headers['x-correlation-id']).toBe(correlationId)
            expect(headers['x-correlation-id']).toMatch(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
        })
    })
})
