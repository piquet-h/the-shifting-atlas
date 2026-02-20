/**
 * useArrivalPause Hook Tests
 *
 * Tests for the arrival-pause auto-refresh hook covering:
 * - Hook schedules onRefresh after refreshDelayMs
 * - Attempt counter increments on each timer fire
 * - onExhausted called after maxAttempts
 * - Timers cleared on unmount (no leaks)
 * - Narrative copy varies by attempt (deterministic)
 * - Source structure verification
 *
 * Reference: Issue #809 - Immersive arrival pause for pending paths
 */

import fs from 'fs'
import path from 'path'
import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useArrivalPause, ARRIVAL_PAUSE_COPY, ARRIVAL_PAUSE_EXHAUSTED_COPY } from '../src/hooks/useArrivalPause'

const HOOK_PATH = path.join(__dirname, '../src/hooks/useArrivalPause.ts')

// Minimal TelemetryContext mock (no-op)
vi.mock('../src/telemetry/TelemetryContext', () => ({
    useTelemetry: () => ({
        trackGameEvent: vi.fn(),
        trackUIError: vi.fn(),
        trackError: vi.fn(),
        trackPlayerNavigate: vi.fn(),
        trackPlayerCommand: vi.fn(),
        trackPageView: vi.fn(),
        isEnabled: () => false
    })
}))

describe('useArrivalPause Hook – Source Structure', () => {
    it('exports hook and narrative copy constants', () => {
        const source = fs.readFileSync(HOOK_PATH, 'utf-8')

        expect(source).toMatch(/export function useArrivalPause/)
        expect(source).toMatch(/export const ARRIVAL_PAUSE_COPY/)
        expect(source).toMatch(/export const ARRIVAL_PAUSE_EXHAUSTED_COPY/)
    })

    it('exports UseArrivalPauseOptions and UseArrivalPauseResult interfaces', () => {
        const source = fs.readFileSync(HOOK_PATH, 'utf-8')

        expect(source).toMatch(/export interface UseArrivalPauseOptions/)
        expect(source).toMatch(/export interface UseArrivalPauseResult/)
    })

    it('clears timer on unmount via useEffect cleanup', () => {
        const source = fs.readFileSync(HOOK_PATH, 'utf-8')

        expect(source).toMatch(/clearTimeout/)
        expect(source).toMatch(/return \(\) => clearTimer\(\)/)
    })

    it('narrative copy has at least 2 entries for escalation', () => {
        expect(ARRIVAL_PAUSE_COPY.length).toBeGreaterThanOrEqual(2)
    })

    it('narrative copy entries contain {direction} placeholder', () => {
        for (const template of ARRIVAL_PAUSE_COPY) {
            expect(template).toMatch(/\{direction\}/)
        }
    })

    it('exhausted copy contains {direction} placeholder', () => {
        expect(ARRIVAL_PAUSE_EXHAUSTED_COPY).toMatch(/\{direction\}/)
    })
})

describe('useArrivalPause Hook – Behaviour', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('schedules onRefresh after refreshDelayMs', () => {
        const onRefresh = vi.fn()
        const onExhausted = vi.fn()

        renderHook(() =>
            useArrivalPause({
                direction: 'north',
                onRefresh,
                onExhausted,
                refreshDelayMs: 500,
                maxAttempts: 3
            })
        )

        expect(onRefresh).not.toHaveBeenCalled()

        act(() => {
            vi.advanceTimersByTime(500)
        })

        expect(onRefresh).toHaveBeenCalledTimes(1)
    })

    it('increments attempt after first refresh', () => {
        const onRefresh = vi.fn()
        const onExhausted = vi.fn()

        const { result } = renderHook(() =>
            useArrivalPause({
                direction: 'east',
                onRefresh,
                onExhausted,
                refreshDelayMs: 500,
                maxAttempts: 3
            })
        )

        expect(result.current.attempt).toBe(0)

        act(() => {
            vi.advanceTimersByTime(500)
        })

        expect(result.current.attempt).toBe(1)
    })

    it('calls onExhausted after maxAttempts refreshes', () => {
        const onRefresh = vi.fn()
        const onExhausted = vi.fn()

        renderHook(() =>
            useArrivalPause({
                direction: 'west',
                onRefresh,
                onExhausted,
                refreshDelayMs: 100,
                maxAttempts: 2
            })
        )

        // Fire first attempt
        act(() => {
            vi.advanceTimersByTime(100)
        })
        expect(onExhausted).not.toHaveBeenCalled()

        // Fire second attempt (maxAttempts=2)
        act(() => {
            vi.advanceTimersByTime(100)
        })
        expect(onExhausted).toHaveBeenCalledTimes(1)
        expect(onRefresh).toHaveBeenCalledTimes(2)
    })

    it('stops scheduling after exhaustion', () => {
        const onRefresh = vi.fn()
        const onExhausted = vi.fn()

        renderHook(() =>
            useArrivalPause({
                direction: 'south',
                onRefresh,
                onExhausted,
                refreshDelayMs: 100,
                maxAttempts: 1
            })
        )

        act(() => {
            vi.advanceTimersByTime(100)
        })

        expect(onExhausted).toHaveBeenCalledTimes(1)
        const callsAfterExhaustion = onRefresh.mock.calls.length

        // Advance further — no more calls expected
        act(() => {
            vi.advanceTimersByTime(1000)
        })

        expect(onRefresh.mock.calls.length).toBe(callsAfterExhaustion)
    })

    it('clears timer on unmount before it fires', () => {
        const onRefresh = vi.fn()
        const onExhausted = vi.fn()

        const { unmount } = renderHook(() =>
            useArrivalPause({
                direction: 'north',
                onRefresh,
                onExhausted,
                refreshDelayMs: 1000,
                maxAttempts: 3
            })
        )

        // Unmount before timer fires
        unmount()

        act(() => {
            vi.advanceTimersByTime(1500)
        })

        expect(onRefresh).not.toHaveBeenCalled()
    })

    it('narrative copy changes with attempt (escalation)', () => {
        const onRefresh = vi.fn()
        const onExhausted = vi.fn()

        const { result } = renderHook(() =>
            useArrivalPause({
                direction: 'north',
                onRefresh,
                onExhausted,
                refreshDelayMs: 100,
                maxAttempts: 3
            })
        )

        const copyAttempt0 = result.current.narrativeCopy
        expect(copyAttempt0).toContain('north')

        act(() => {
            vi.advanceTimersByTime(100)
        })

        const copyAttempt1 = result.current.narrativeCopy
        // Copy should change (attempt 1 uses different template)
        expect(copyAttempt1).toContain('north')
        expect(copyAttempt0).not.toBe(copyAttempt1)
    })

    it('shows exhausted copy when isExhausted is true', () => {
        const onRefresh = vi.fn()
        const onExhausted = vi.fn()

        const { result } = renderHook(() =>
            useArrivalPause({
                direction: 'north',
                onRefresh,
                onExhausted,
                refreshDelayMs: 100,
                maxAttempts: 1
            })
        )

        act(() => {
            vi.advanceTimersByTime(100)
        })

        expect(result.current.isExhausted).toBe(true)
        expect(result.current.narrativeCopy).toContain('north')
        // Exhausted copy is distinct from regular copy
        expect(ARRIVAL_PAUSE_COPY).not.toContainEqual(result.current.narrativeCopy.replace(/north/g, '{direction}'))
    })

    it('applies direction placeholder to narrative copy', () => {
        const onRefresh = vi.fn()
        const onExhausted = vi.fn()

        const { result } = renderHook(() =>
            useArrivalPause({
                direction: 'southeast',
                onRefresh,
                onExhausted,
                refreshDelayMs: 100,
                maxAttempts: 3
            })
        )

        expect(result.current.narrativeCopy).toContain('southeast')
        expect(result.current.narrativeCopy).not.toContain('{direction}')
    })
})
