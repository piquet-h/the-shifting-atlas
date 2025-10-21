import { describe, expect, it } from 'vitest'
import { isApiEnvelope, unwrapEnvelope } from '../src/utils/envelope'

describe('unwrapEnvelope utility', () => {
    it('unwraps a success envelope preserving data and flags', () => {
        const raw = { success: true, data: { value: 42 }, correlationId: 'abc123' }
        const result = unwrapEnvelope(raw)
        expect(result.isEnvelope).toBe(true)
        expect(result.success).toBe(true)
        expect(result.data).toEqual({ value: 42 })
        expect(result.correlationId).toBe('abc123')
    })

    it('unwraps an error envelope exposing error code/message', () => {
        const raw = { success: false, error: { code: 'Failure', message: 'Something went wrong' }, correlationId: 'err1' }
        const result = unwrapEnvelope(raw)
        expect(result.isEnvelope).toBe(true)
        expect(result.success).toBe(false)
        expect(result.error).toEqual({ code: 'Failure', message: 'Something went wrong' })
        expect(result.correlationId).toBe('err1')
    })

    it('treats a non-envelope primitive as raw data', () => {
        const result = unwrapEnvelope(99)
        expect(result.isEnvelope).toBe(false)
        expect(result.success).toBe(true)
        expect(result.data).toBe(99)
    })

    it('treats a plain object without success boolean as raw data', () => {
        const obj = { value: 'hello' }
        const result = unwrapEnvelope(obj)
        expect(result.isEnvelope).toBe(false)
        expect(result.data).toEqual(obj)
    })

    it('isApiEnvelope detects success boolean presence', () => {
        expect(isApiEnvelope({ success: true, data: {} })).toBe(true)
        expect(isApiEnvelope({ success: false, error: { code: 'X', message: 'Y' } })).toBe(true)
        expect(isApiEnvelope({ success: 'true' })).toBe(false)
        expect(isApiEnvelope({ foo: 'bar' })).toBe(false)
        expect(isApiEnvelope(123)).toBe(false)
    })
})
