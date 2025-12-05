/**
 * Tests for playerService
 * Validates bootstrap logic, storage integration, and telemetry emission.
 */
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapPlayer, getStoredPlayerGuid, storePlayerGuid } from '../../src/services/playerService'
import * as telemetry from '../../src/services/telemetry'
import * as localStorage from '../../src/utils/localStorage'
import { server } from '../mocks/server'

// Mock telemetry
vi.mock('../../src/services/telemetry', () => ({
    trackGameEventClient: vi.fn()
}))

// Mock localStorage utils
vi.mock('../../src/utils/localStorage', () => ({
    readFromStorage: vi.fn(),
    writeToStorage: vi.fn()
}))

describe('playerService', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('getStoredPlayerGuid', () => {
        it('should return valid GUID from storage', () => {
            const validGuid = '12345678-1234-1234-1234-123456789abc'
            vi.mocked(localStorage.readFromStorage).mockReturnValue(validGuid)

            const result = getStoredPlayerGuid()

            expect(result).toBe(validGuid)
            expect(localStorage.readFromStorage).toHaveBeenCalledWith('tsa.playerGuid', expect.any(Function))
        })

        it('should return null if no GUID stored', () => {
            vi.mocked(localStorage.readFromStorage).mockReturnValue(null)

            const result = getStoredPlayerGuid()

            expect(result).toBeNull()
        })
    })

    describe('storePlayerGuid', () => {
        it('should write GUID to storage', () => {
            const guid = '12345678-1234-1234-1234-123456789abc'

            storePlayerGuid(guid)

            expect(localStorage.writeToStorage).toHaveBeenCalledWith('tsa.playerGuid', guid)
        })
    })

    describe('bootstrapPlayer', () => {
        it('should bootstrap new player when no existing GUID', async () => {
            const newGuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
            
            // Override MSW handler for this test
            server.use(
                http.get('/api/player', () => {
                    return HttpResponse.json({
                        success: true,
                        data: {
                            playerGuid: newGuid,
                            created: true
                        }
                    })
                })
            )            const result = await bootstrapPlayer(null)

            expect(result).toEqual({ playerGuid: newGuid, created: true })
            expect(telemetry.trackGameEventClient).toHaveBeenCalledWith('Onboarding.GuestGuid.Started')
            expect(telemetry.trackGameEventClient).toHaveBeenCalledWith('Onboarding.GuestGuid.Created', { playerGuid: newGuid })
            expect(localStorage.writeToStorage).toHaveBeenCalledWith('tsa.playerGuid', newGuid)
        })

        it('should confirm existing GUID when provided', async () => {
            const existingGuid = '12345678-1234-1234-1234-123456789abc'
            
            server.use(
                http.get('/api/player', () => {
                    return HttpResponse.json({
                        success: true,
                        data: {
                            playerGuid: existingGuid,
                            created: false
                        }
                    })
                })
            )            const result = await bootstrapPlayer(existingGuid)

            expect(result).toEqual({ playerGuid: existingGuid, created: false })
            expect(telemetry.trackGameEventClient).toHaveBeenCalledWith('Onboarding.GuestGuid.Started')
            expect(telemetry.trackGameEventClient).not.toHaveBeenCalledWith('Onboarding.GuestGuid.Created', expect.any(Object))
            expect(localStorage.writeToStorage).not.toHaveBeenCalled()
        })

        it('should throw error on failed API response', async () => {
            server.use(
                http.get('/api/player', () => {
                    return HttpResponse.json({ success: false, error: 'Server error' }, { status: 500 })
                })
            )

            await expect(bootstrapPlayer(null)).rejects.toThrow('Bootstrap failed: 500')
        })

        it('should throw error on invalid response format', async () => {
            server.use(
                http.get('/api/player', () => {
                    return HttpResponse.json({
                        success: false
                    })
                })
            )

            await expect(bootstrapPlayer(null)).rejects.toThrow('Invalid response format from bootstrap')
        })
    })
})
