import { describe, it, expect } from 'vitest'
import { extractErrorMessage } from '../src/utils/apiResponse'

describe('apiResponse error handling', () => {
    describe('extractErrorMessage', () => {
        it('should extract 400 error for invalid GUID format', () => {
            const response = { status: 400, headers: { get: () => null } } as unknown as Response
            const json = {
                error: 'InvalidPlayerId',
                message: 'Player id must be a valid GUID format',
                correlationId: 'abc123'
            }
            const unwrapped = {
                isEnvelope: true,
                success: false,
                error: { message: 'Player id must be a valid GUID format' }
            }

            const message = extractErrorMessage(response, json, unwrapped)
            expect(message).toBe('Player id must be a valid GUID format')
        })

        it('should extract 400 error for missing player ID', () => {
            const response = { status: 400, headers: { get: () => null } } as unknown as Response
            const json = {
                error: 'MissingPlayerId',
                message: 'Player id required in path or x-player-guid header',
                correlationId: 'xyz789'
            }
            const unwrapped = {
                isEnvelope: true,
                success: false,
                error: { message: 'Player id required in path or x-player-guid header' }
            }

            const message = extractErrorMessage(response, json, unwrapped)
            expect(message).toBe('Player id required in path or x-player-guid header')
        })

        it('should handle 400 error with fallback object error property', () => {
            const response = { status: 400, headers: { get: () => null } } as unknown as Response
            const json = {
                error: {
                    code: 'BadRequest',
                    message: 'Invalid direction provided'
                }
            }
            const unwrapped = {
                isEnvelope: false,
                success: false
            }

            const message = extractErrorMessage(response, json, unwrapped)
            expect(message).toBe('Invalid direction provided')
        })

        it('should fall back to HTTP status when no message available', () => {
            const response = { status: 400, headers: { get: () => null } } as unknown as Response
            const json = {}
            const unwrapped = {
                isEnvelope: false,
                success: false
            }

            const message = extractErrorMessage(response, json, unwrapped)
            expect(message).toBe('HTTP 400')
        })
    })
})
