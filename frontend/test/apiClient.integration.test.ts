import { describe, it, expect } from 'vitest'
import { buildPlayerUrl, buildLocationUrl, buildMoveRequest } from '../src/utils/apiClient'

/**
 * Integration tests to verify RESTful URL patterns are used by default
 * These tests verify the actual behavior users will see in production
 */
describe('apiClient integration (RESTful patterns)', () => {
    const validPlayerId = '12345678-1234-1234-1234-123456789abc'
    const validLocationId = '87654321-4321-4321-4321-cba987654321'

    it('should use RESTful pattern for player URL by default', () => {
        const url = buildPlayerUrl(validPlayerId)
        expect(url).toBe(`/api/player/${validPlayerId}`)
    })

    it('should use RESTful pattern for location URL by default', () => {
        const url = buildLocationUrl(validLocationId)
        expect(url).toBe(`/api/location/${validLocationId}`)
    })

    it('should use RESTful POST pattern for move by default', () => {
        const result = buildMoveRequest(validPlayerId, 'north', validLocationId)

        expect(result.method).toBe('POST')
        expect(result.url).toBe(`/api/player/${validPlayerId}/move`)
        expect(result.body).toEqual({
            direction: 'north',
            fromLocationId: validLocationId
        })
    })

    it('should fallback to legacy pattern when playerId is invalid', () => {
        const result = buildMoveRequest('invalid-guid', 'south')

        expect(result.method).toBe('GET')
        expect(result.url).toContain('/api/player/move?dir=south')
        expect(result.body).toBeUndefined()
    })
})
