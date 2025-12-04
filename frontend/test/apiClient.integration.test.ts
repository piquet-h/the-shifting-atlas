import { describe, expect, it } from 'vitest'
import { buildLocationUrl, buildMoveRequest, buildPlayerUrl } from '../src/utils/apiClient'

/**
 * Integration tests to verify RESTful URL patterns
 * These tests verify the actual behavior users will see in production
 */
describe('apiClient integration (RESTful patterns)', () => {
    const validPlayerId = '12345678-1234-1234-1234-123456789abc'
    const validLocationId = '87654321-4321-4321-4321-cba987654321'

    it('should use RESTful pattern for player URL', () => {
        const url = buildPlayerUrl(validPlayerId)
        expect(url).toBe(`/api/player/${validPlayerId}`)
    })

    it('should use RESTful pattern for location URL', () => {
        const url = buildLocationUrl(validLocationId)
        expect(url).toBe(`/api/location/${validLocationId}`)
    })

    it('should use RESTful POST pattern for move', () => {
        const result = buildMoveRequest(validPlayerId, 'north')

        expect(result.method).toBe('POST')
        expect(result.url).toBe(`/api/player/${validPlayerId}/move`)
        expect(result.body).toEqual({
            direction: 'north'
        })
        // Server reads player location authoritatively from database
        expect(result.body).not.toHaveProperty('fromLocationId')
    })

    it('should throw error when playerId is invalid', () => {
        expect(() => buildMoveRequest('invalid-guid', 'south')).toThrow('Player ID must be a valid GUID')
    })
})
