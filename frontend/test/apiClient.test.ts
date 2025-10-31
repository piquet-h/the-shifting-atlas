import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isValidGuid, buildPlayerUrl, buildLocationUrl, buildMoveRequest, buildHeaders } from '../src/utils/apiClient'

describe('apiClient', () => {
    // Store original env value
    let originalEnv: string | undefined

    beforeEach(() => {
        originalEnv = import.meta.env.VITE_USE_RESTFUL_URLS
    })

    afterEach(() => {
        // Restore original env value
        if (originalEnv !== undefined) {
            import.meta.env.VITE_USE_RESTFUL_URLS = originalEnv
        }
    })

    describe('isValidGuid', () => {
        it('should return true for valid GUID', () => {
            expect(isValidGuid('12345678-1234-1234-1234-123456789abc')).toBe(true)
            expect(isValidGuid('ABCDEF01-2345-6789-ABCD-EF0123456789')).toBe(true)
        })

        it('should return false for invalid GUID', () => {
            expect(isValidGuid('not-a-guid')).toBe(false)
            expect(isValidGuid('12345678-1234-1234-1234')).toBe(false)
            expect(isValidGuid('')).toBe(false)
            expect(isValidGuid(null)).toBe(false)
            expect(isValidGuid(undefined)).toBe(false)
        })
    })

    describe('buildPlayerUrl', () => {
        it('should build RESTful URL with valid playerId', () => {
            const playerId = '12345678-1234-1234-1234-123456789abc'
            const url = buildPlayerUrl(playerId)
            expect(url).toBe(`/api/player/${playerId}`)
        })

        it('should build legacy URL with invalid playerId', () => {
            expect(buildPlayerUrl('invalid')).toBe('/api/player')
            expect(buildPlayerUrl(null)).toBe('/api/player')
        })
    })

    describe('buildLocationUrl', () => {
        it('should build RESTful URL with valid locationId', () => {
            const locationId = '12345678-1234-1234-1234-123456789abc'
            const url = buildLocationUrl(locationId)
            expect(url).toBe(`/api/location/${locationId}`)
        })

        it('should build legacy URL with query string for invalid locationId', () => {
            const url = buildLocationUrl('not-a-guid')
            expect(url).toBe('/api/location?id=not-a-guid')
        })

        it('should build base URL with no locationId', () => {
            expect(buildLocationUrl(null)).toBe('/api/location')
            expect(buildLocationUrl(undefined)).toBe('/api/location')
        })
    })

    describe('buildMoveRequest', () => {
        it('should build RESTful POST request with valid playerId', () => {
            const playerId = '12345678-1234-1234-1234-123456789abc'
            const result = buildMoveRequest(playerId, 'north')

            expect(result.url).toBe(`/api/player/${playerId}/move`)
            expect(result.method).toBe('POST')
            expect(result.body).toEqual({ direction: 'north' })
        })

        it('should include fromLocationId in body when provided', () => {
            const playerId = '12345678-1234-1234-1234-123456789abc'
            const fromLocationId = '87654321-4321-4321-4321-cba987654321'
            const result = buildMoveRequest(playerId, 'south', fromLocationId)

            expect(result.url).toBe(`/api/player/${playerId}/move`)
            expect(result.method).toBe('POST')
            expect(result.body).toEqual({
                direction: 'south',
                fromLocationId
            })
        })

        it('should build legacy GET request with invalid playerId', () => {
            const result = buildMoveRequest('invalid', 'east')

            expect(result.url).toBe('/api/player/move?dir=east')
            expect(result.method).toBe('GET')
            expect(result.body).toBeUndefined()
        })

        it('should include from parameter in legacy URL when provided', () => {
            const fromLocationId = '87654321-4321-4321-4321-cba987654321'
            const result = buildMoveRequest(null, 'west', fromLocationId)

            expect(result.url).toBe(`/api/player/move?dir=west&from=${fromLocationId}`)
            expect(result.method).toBe('GET')
            expect(result.body).toBeUndefined()
        })
    })

    describe('buildHeaders', () => {
        it('should include x-player-guid header when playerId provided', () => {
            const playerId = '12345678-1234-1234-1234-123456789abc'
            const headers = buildHeaders(playerId)

            expect(headers).toEqual({
                'x-player-guid': playerId
            })
        })

        it('should not include x-player-guid header when playerId is null', () => {
            const headers = buildHeaders(null)
            expect(headers).toEqual({})
        })

        it('should merge additional headers', () => {
            const playerId = '12345678-1234-1234-1234-123456789abc'
            const headers = buildHeaders(playerId, {
                'Content-Type': 'application/json'
            })

            expect(headers).toEqual({
                'x-player-guid': playerId,
                'Content-Type': 'application/json'
            })
        })
    })
})
