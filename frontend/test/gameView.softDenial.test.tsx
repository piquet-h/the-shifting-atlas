/**
 * GameView Soft-Denial / Arrival-Pause Integration Tests
 *
 * Source-level architecture checks for the decomposed GameView implementation.
 */

import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const GAMEVIEW_PATH = path.join(__dirname, '../src/components/GameView.tsx')
const FLOW_HOOK_PATH = path.join(__dirname, '../src/components/hooks/useGameNavigationFlow.ts')
const OVERLAYS_PATH = path.join(__dirname, '../src/components/layout/GameViewOverlays.tsx')

describe('GameView Soft-Denial / Arrival-Pause Integration', () => {
    it('routes overlay rendering through GameViewOverlays', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        expect(source).toMatch(/from '\.\/layout\/GameViewOverlays'/)
        expect(source).toMatch(/<GameViewOverlays/)
        expect(source).toMatch(/locationContextForDenial={locationContextForDenial}/)
    })

    it('keeps location-context derivation in GameView', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        expect(source).toMatch(/const locationContextForDenial/)
        expect(source).toMatch(/return\s*['"]underground['"]/)
        expect(source).toMatch(/return\s*['"]urban['"]/)
        expect(source).toMatch(/return\s*['"]indoor['"]/)
        expect(source).toMatch(/return\s*['"]outdoor['"]/)
        expect(source).toMatch(/return\s*['"]unknown['"]/)
    })

    it('retains auto-navigate behavior when arrival-pause path becomes available', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        expect(source).toMatch(/trackGameEventClient\(\s*['"]Navigation\.ArrivalPause\.Ready['"]/)
        expect(source).toMatch(/setArrivalPause\(null\)/)
        expect(source).toMatch(/handleNavigate\(arrivalPause\.direction\)/)
    })

    it('moves generate-status detection and navigation state handling to useGameNavigationFlow', () => {
        const source = fs.readFileSync(FLOW_HOOK_PATH, 'utf-8')

        expect(source).toMatch(/errorCode === ['"]ExitGenerationRequested['"]/)
        expect(source).toMatch(/__arrivalPause:\s*true/)
        expect(source).toMatch(/'__arrivalPause'\s*in\s*result/)
        expect(source).toMatch(/'__softDenial'\s*in\s*result/)
        expect(source).toMatch(/const \[softDenial, setSoftDenial\]/)
        expect(source).toMatch(/const \[arrivalPause, setArrivalPause\]/)
    })

    it('keeps soft-denial and arrival-pause callbacks in useGameNavigationFlow', () => {
        const source = fs.readFileSync(FLOW_HOOK_PATH, 'utf-8')

        expect(source).toMatch(/const handleSoftDenialRetry\s*=\s*useCallback/)
        expect(source).toMatch(/const handleSoftDenialExplore\s*=\s*useCallback/)
        expect(source).toMatch(/const handleSoftDenialDismiss\s*=\s*useCallback/)
        expect(source).toMatch(/const handleArrivalPauseRefresh\s*=\s*useCallback/)
        expect(source).toMatch(/const handleArrivalPauseExhausted\s*=\s*useCallback/)
        expect(source).toMatch(/const handleArrivalPauseExplore\s*=\s*useCallback/)
        expect(source).toMatch(/const handleArrivalPauseDismiss\s*=\s*useCallback/)
    })

    it('wires both overlays with expected props in GameViewOverlays', () => {
        const source = fs.readFileSync(OVERLAYS_PATH, 'utf-8')

        expect(source).toMatch(/import ArrivalPauseOverlay/)
        expect(source).toMatch(/import SoftDenialOverlay/)
        expect(source).toMatch(/\{arrivalPause\s*&&\s*\(/)
        expect(source).toMatch(/\{softDenial\s*&&\s*\(/)
        expect(source).toMatch(/onRefresh={onArrivalPauseRefresh}/)
        expect(source).toMatch(/onExhausted={onArrivalPauseExhausted}/)
        expect(source).toMatch(/onRetry={onSoftDenialRetry}/)
        expect(source).toMatch(/locationContext={locationContextForDenial}/)
    })
})
