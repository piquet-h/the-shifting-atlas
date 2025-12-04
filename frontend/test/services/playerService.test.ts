/**
 * Tests for playerService
 * Validates bootstrap logic, storage integration, and telemetry emission.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapPlayer, getStoredPlayerGuid, storePlayerGuid } from '../../src/services/playerService'
import * as telemetry from '../../src/services/telemetry'
import * as localStorage from '../../src/utils/localStorage'

// Mock telemetry
vi.mock('../../src/services/telemetry', () => ({
    trackGameEventClient: vi.fn()
}))

// Mock localStorage utils
vi.mock('../../src/utils/localStorage', () => ({
    readFromStorage: vi.fn(),
    writeToStorage: vi.fn()
}))

// Mock fetch globally
global.fetch = vi.fn()

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
            vi.mocked(global.fetch).mockResolvedValue({
                ok: true,
                json: async () => ({
                    success: true,
                    data: {
                        playerGuid: newGuid,
                        created: true
                    }
                })
            } as Response)

            const result = await bootstrapPlayer(null)

            expect(result).toEqual({ playerGuid: newGuid, created: true })
            expect(global.fetch).toHaveBeenCalledWith('/api/player', expect.any(Object))
            expect(telemetry.trackGameEventClient).toHaveBeenCalledWith('Onboarding.GuestGuid.Started')
            expect(telemetry.trackGameEventClient).toHaveBeenCalledWith('Onboarding.GuestGuid.Created', { playerGuid: newGuid })
            expect(localStorage.writeToStorage).toHaveBeenCalledWith('tsa.playerGuid', newGuid)
        })

        it('should confirm existing GUID when provided', async () => {
            const existingGuid = '12345678-1234-1234-1234-123456789abc'
            vi.mocked(global.fetch).mockResolvedValue({
                ok: true,
                json: async () => ({
                    success: true,
                    data: {
                        playerGuid: existingGuid,
                        created: false
                    }
                })
            } as Response)

            const result = await bootstrapPlayer(existingGuid)

            expect(result).toEqual({ playerGuid: existingGuid, created: false })
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/player',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'x-player-guid': existingGuid
                    })
                })
            )
            expect(telemetry.trackGameEventClient).toHaveBeenCalledWith('Onboarding.GuestGuid.Started')
            expect(telemetry.trackGameEventClient).not.toHaveBeenCalledWith('Onboarding.GuestGuid.Created', expect.any(Object))
            expect(localStorage.writeToStorage).not.toHaveBeenCalled()
        })

        it('should throw error on failed API response', async () => {
            vi.mocked(global.fetch).mockResolvedValue({
                ok: false,
                status: 500
            } as Response)

            await expect(bootstrapPlayer(null)).rejects.toThrow('Bootstrap failed: 500')
        })

        it('should throw error on invalid response format', async () => {
            vi.mocked(global.fetch).mockResolvedValue({
                ok: true,
                json: async () => ({
                    success: false
                })
            } as Response)

            await expect(bootstrapPlayer(null)).rejects.toThrow('Invalid response format from bootstrap')
        })
    })
})
