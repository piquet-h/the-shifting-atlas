import { describe, expect, it } from 'vitest'
import { buildHeaders, buildLocationUrl, buildMoveRequest, buildPlayerUrl, isValidGuid } from '../src/utils/apiClient'

describe('apiClient', () => {
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

        it('should throw error with invalid playerId', () => {
            expect(() => buildPlayerUrl('invalid')).toThrow('Player ID must be a valid GUID')
            expect(() => buildPlayerUrl(null)).toThrow('Player ID must be a valid GUID')
        })
    })

    describe('buildLocationUrl', () => {
        it('should build RESTful URL with valid locationId', () => {
            const locationId = '12345678-1234-1234-1234-123456789abc'
            const url = buildLocationUrl(locationId)
            expect(url).toBe(`/api/location/${locationId}`)
        })

        it('should throw error with invalid locationId', () => {
            expect(() => buildLocationUrl('not-a-guid')).toThrow('Location ID must be a valid GUID')
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

        it('should only include direction in body (server reads location authoritatively)', () => {
            const playerId = '12345678-1234-1234-1234-123456789abc'
            const result = buildMoveRequest(playerId, 'south')

            expect(result.url).toBe(`/api/player/${playerId}/move`)
            expect(result.method).toBe('POST')
            expect(result.body).toEqual({ direction: 'south' })
            expect(result.body).not.toHaveProperty('fromLocationId')
        })

        it('should throw error with invalid playerId', () => {
            expect(() => buildMoveRequest('invalid', 'east')).toThrow('Player ID must be a valid GUID')
            expect(() => buildMoveRequest(null, 'west')).toThrow('Player ID must be a valid GUID')
        })
    })

    describe('buildHeaders', () => {
        it('should return empty headers when no additional headers', () => {
            const headers = buildHeaders()
            expect(headers).toEqual({})
        })

        it('should merge additional headers', () => {
            const headers = buildHeaders({
                'Content-Type': 'application/json'
            })

            expect(headers).toEqual({
                'Content-Type': 'application/json'
            })
        })
    })
})
