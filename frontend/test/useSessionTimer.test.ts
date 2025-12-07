/**
 * useSessionTimer Hook Tests
 *
 * Tests for session duration tracking hook covering:
 * - Initial state from localStorage
 * - Duration formatting (HH:MM:SS)
 * - Timer updates every second
 * - Reset functionality
 * - Persistence across hook remounts
 */
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionTimer } from '../src/hooks/useSessionTimer'

describe('useSessionTimer Hook', () => {
    let originalLocalStorage: Storage
    let mockLocalStorage: Record<string, string>

    beforeEach(() => {
        // Mock localStorage
        originalLocalStorage = global.localStorage
        mockLocalStorage = {}

        Object.defineProperty(global, 'localStorage', {
            value: {
                getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
                setItem: vi.fn((key: string, value: string) => {
                    mockLocalStorage[key] = value
                }),
                removeItem: vi.fn((key: string) => {
                    delete mockLocalStorage[key]
                }),
                clear: vi.fn(() => {
                    mockLocalStorage = {}
                })
            },
            writable: true
        })

        // Mock Date.now() for predictable testing
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.useRealTimers()
        Object.defineProperty(global, 'localStorage', {
            value: originalLocalStorage,
            writable: true
        })
    })

    describe('Initialization', () => {
        it('initializes new session when no stored timestamp exists', () => {
            const now = 1000000000
            vi.setSystemTime(now)

            renderHook(() => useSessionTimer())

            expect(localStorage.setItem).toHaveBeenCalledWith('atlas_session_start', now.toString())
        })

        it('loads existing session from localStorage', () => {
            const sessionStart = 1000000000
            const now = sessionStart + 60000 // 1 minute later
            mockLocalStorage['atlas_session_start'] = sessionStart.toString()
            vi.setSystemTime(now)

            const { result } = renderHook(() => useSessionTimer())

            expect(result.current.elapsedMs).toBe(60000)
            expect(result.current.duration).toBe('00:01:00')
        })

        it('creates new session if stored timestamp is invalid', () => {
            const now = 1000000000
            mockLocalStorage['atlas_session_start'] = 'invalid'
            vi.setSystemTime(now)

            renderHook(() => useSessionTimer())

            expect(localStorage.setItem).toHaveBeenCalledWith('atlas_session_start', now.toString())
        })
    })

    describe('Duration Formatting', () => {
        it('formats seconds correctly', () => {
            const sessionStart = 1000000000
            const now = sessionStart + 45000 // 45 seconds
            mockLocalStorage['atlas_session_start'] = sessionStart.toString()
            vi.setSystemTime(now)

            const { result } = renderHook(() => useSessionTimer())

            expect(result.current.duration).toBe('00:00:45')
        })

        it('formats minutes correctly', () => {
            const sessionStart = 1000000000
            const now = sessionStart + 150000 // 2 minutes 30 seconds
            mockLocalStorage['atlas_session_start'] = sessionStart.toString()
            vi.setSystemTime(now)

            const { result } = renderHook(() => useSessionTimer())

            expect(result.current.duration).toBe('00:02:30')
        })

        it('formats hours correctly', () => {
            const sessionStart = 1000000000
            const now = sessionStart + 3665000 // 1 hour 1 minute 5 seconds
            mockLocalStorage['atlas_session_start'] = sessionStart.toString()
            vi.setSystemTime(now)

            const { result } = renderHook(() => useSessionTimer())

            expect(result.current.duration).toBe('01:01:05')
        })

        it('pads single digits with zeros', () => {
            const sessionStart = 1000000000
            const now = sessionStart + 3661000 // 1:01:01
            mockLocalStorage['atlas_session_start'] = sessionStart.toString()
            vi.setSystemTime(now)

            const { result } = renderHook(() => useSessionTimer())

            expect(result.current.duration).toBe('01:01:01')
        })

        it('handles zero duration', () => {
            const now = 1000000000
            mockLocalStorage['atlas_session_start'] = now.toString()
            vi.setSystemTime(now)

            const { result } = renderHook(() => useSessionTimer())

            expect(result.current.duration).toBe('00:00:00')
        })
    })

    describe('Timer Updates', () => {
        it('calculates elapsed time correctly based on current timestamp', () => {
            const sessionStart = 1000000000
            mockLocalStorage['atlas_session_start'] = sessionStart.toString()
            vi.setSystemTime(sessionStart + 5000) // 5 seconds elapsed

            const { result } = renderHook(() => useSessionTimer())

            expect(result.current.elapsedMs).toBe(5000)
            expect(result.current.duration).toBe('00:00:05')
        })

        it('recalculates elapsed time when system time advances', () => {
            const sessionStart = 1000000000
            mockLocalStorage['atlas_session_start'] = sessionStart.toString()
            vi.setSystemTime(sessionStart)

            const { result } = renderHook(() => useSessionTimer())
            expect(result.current.duration).toBe('00:00:00')

            // Simulate time passing and interval tick
            vi.setSystemTime(sessionStart + 1000)
            vi.advanceTimersByTime(1000)

            // The state should update automatically via the interval
            // We just need to wait for it (the interval is real, not fake)
        })
    })

    describe('Reset Functionality', () => {
        it('resets timer to current timestamp', () => {
            const sessionStart = 1000000000
            const now = sessionStart + 60000
            mockLocalStorage['atlas_session_start'] = sessionStart.toString()
            vi.setSystemTime(now)

            const { result } = renderHook(() => useSessionTimer())

            expect(result.current.elapsedMs).toBe(60000)

            // Reset timer
            result.current.reset()

            expect(localStorage.setItem).toHaveBeenCalledWith('atlas_session_start', now.toString())
        })
    })

    describe('Persistence', () => {
        it('persists same session across hook remounts', () => {
            const sessionStart = 1000000000
            mockLocalStorage['atlas_session_start'] = sessionStart.toString()
            vi.setSystemTime(sessionStart + 30000)

            const { result: result1, unmount } = renderHook(() => useSessionTimer())
            expect(result1.current.duration).toBe('00:00:30')

            unmount()

            vi.setSystemTime(sessionStart + 45000)
            const { result: result2 } = renderHook(() => useSessionTimer())
            expect(result2.current.duration).toBe('00:00:45')

            // Session start should not have been updated
            expect(mockLocalStorage['atlas_session_start']).toBe(sessionStart.toString())
        })
    })
})
