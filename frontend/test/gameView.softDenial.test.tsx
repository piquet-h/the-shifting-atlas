/**
 * GameView Soft-Denial Integration Tests
 *
 * Tests for the soft-denial UX integration in GameView:
 * - Detection of 'ExitGenerationRequested' error code from backend
 * - Display of SoftDenialOverlay when generate status received
 * - Location context derivation for narrative selection
 * - Action handler wiring (retry, explore, dismiss)
 *
 * Reference: Issue #595 - Frontend Soft-Denial Narrative UX for Generate Status
 */

import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const GAMEVIEW_PATH = path.join(__dirname, '../src/components/GameView.tsx')

describe('GameView Soft-Denial Integration', () => {
    describe('SoftDenialOverlay Import and State', () => {
        it('imports SoftDenialOverlay component and types', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for import statement
            expect(source).toMatch(/import SoftDenialOverlay/)
            expect(source).toMatch(/type LocationContext/)
            expect(source).toMatch(/type GenerationHint/)
        })

        it('maintains softDenial state for overlay visibility', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for useState hook for softDenial
            expect(source).toMatch(/const \[softDenial, setSoftDenial\]/)
        })
    })

    describe('Generate Status Detection', () => {
        it('checks for ExitGenerationRequested error code in mutation', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for error code detection
            expect(source).toMatch(/errorCode === ['"]ExitGenerationRequested['"]/)
        })

        it('returns arrival-pause marker object from mutation (replaced soft-denial for pending paths)', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // ExitGenerationRequested now returns an arrival-pause marker (auto-refresh, no retry)
            expect(source).toMatch(/__arrivalPause:\s*true/)
        })

        it('checks for arrival-pause marker in onSuccess', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/'__arrivalPause'\s*in\s*result/)
        })

        it('sets arrivalPause state when arrival-pause marker detected', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/setArrivalPause\(\{/)
            expect(source).toMatch(/direction:.*arrivalPauseResult\.direction/)
        })
    })

    describe('Mutation Success Handling', () => {
        it('checks for soft-denial marker in onSuccess (backward compat fallback)', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for soft-denial detection in onSuccess (legacy path; kept for backward compat)
            expect(source).toMatch(/'__softDenial'\s*in\s*result/)
        })

        it('sets soft-denial state when legacy marker detected', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for setSoftDenial call
            expect(source).toMatch(/setSoftDenial\(\{/)
            expect(source).toMatch(/direction:.*softDenialResult\.direction/)
        })
    })

    describe('Location Context Derivation', () => {
        it('derives location context from location name and description', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for locationContextForDenial derivation
            expect(source).toMatch(/const locationContextForDenial/)
            expect(source).toMatch(/useMemo/)
        })

        it('detects underground context from keywords', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for underground keyword detection
            expect(source).toMatch(/cave.*tunnel.*underground.*cavern/i)
            expect(source).toMatch(/return\s*['"]underground['"]/)
        })

        it('detects urban context from keywords', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for urban keyword detection (uses includes() calls)
            expect(source).toMatch(/includes\(['"]street['"]\)/)
            expect(source).toMatch(/includes\(['"]city['"]\)/)
            expect(source).toMatch(/return\s*['"]urban['"]/)
        })

        it('detects indoor context from keywords', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for indoor keyword detection (uses includes() calls)
            expect(source).toMatch(/includes\(['"]room['"]\)/)
            expect(source).toMatch(/includes\(['"]chamber['"]\)/)
            expect(source).toMatch(/return\s*['"]indoor['"]/)
        })

        it('detects outdoor context from keywords', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for outdoor keyword detection (uses includes() calls)
            expect(source).toMatch(/includes\(['"]forest['"]\)/)
            expect(source).toMatch(/includes\(['"]river['"]\)/)
            expect(source).toMatch(/return\s*['"]outdoor['"]/)
        })

        it('defaults to unknown context when no keywords match', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/return\s*['"]unknown['"]/)
        })
    })

    describe('Action Handlers', () => {
        it('defines handleSoftDenialRetry callback', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for retry handler
            expect(source).toMatch(/const handleSoftDenialRetry\s*=\s*useCallback/)
        })

        it('clears soft-denial and retries navigation on retry', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check retry handler clears state and navigates
            const retryMatch = source.match(/handleSoftDenialRetry.*?useCallback\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},/)
            expect(retryMatch).not.toBeNull()

            if (retryMatch) {
                const body = retryMatch[1]
                expect(body).toMatch(/setSoftDenial\(null\)/)
                expect(body).toMatch(/handleNavigate\(softDenial\.direction\)/)
            }
        })

        it('defines handleSoftDenialExplore callback', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/const handleSoftDenialExplore\s*=\s*useCallback/)
        })

        it('clears soft-denial on explore without retrying', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            const exploreMatch = source.match(/handleSoftDenialExplore.*?useCallback\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},/)
            expect(exploreMatch).not.toBeNull()

            if (exploreMatch) {
                const body = exploreMatch[1]
                expect(body).toMatch(/setSoftDenial\(null\)/)
                // Should NOT have handleNavigate in explore
                expect(body).not.toMatch(/handleNavigate/)
            }
        })

        it('defines handleSoftDenialDismiss callback', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/const handleSoftDenialDismiss\s*=\s*useCallback/)
        })
    })

    describe('Overlay Rendering', () => {
        it('conditionally renders SoftDenialOverlay when softDenial state is set', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            // Check for conditional rendering
            expect(source).toMatch(/\{softDenial\s*&&\s*\(?\s*<SoftDenialOverlay/)
        })

        it('passes direction prop to overlay', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/direction={softDenial\.direction}/)
        })

        it('passes generationHint prop to overlay', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/generationHint={softDenial\.generationHint}/)
        })

        it('passes locationContext prop to overlay', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/locationContext={locationContextForDenial}/)
        })

        it('passes locationName prop to overlay', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/locationName={location\?\.name}/)
        })

        it('passes action callbacks to overlay', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/onRetry={handleSoftDenialRetry}/)
            expect(source).toMatch(/onExplore={handleSoftDenialExplore}/)
            expect(source).toMatch(/onDismiss={handleSoftDenialDismiss}/)
        })

        it('passes correlationId for telemetry', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/correlationId={softDenial\.correlationId}/)
        })
    })
})

describe('GameView ArrivalPause Integration', () => {
    describe('ArrivalPauseOverlay Import and State', () => {
        it('imports ArrivalPauseOverlay component', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/import ArrivalPauseOverlay/)
        })

        it('maintains arrivalPause state for overlay visibility', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/const \[arrivalPause, setArrivalPause\]/)
        })
    })

    describe('Arrival Pause Handlers', () => {
        it('defines handleArrivalPauseRefresh callback', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/const handleArrivalPauseRefresh\s*=\s*useCallback/)
        })

        it('handleArrivalPauseRefresh calls refetch', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            const match = source.match(/handleArrivalPauseRefresh.*?useCallback\(\s*\(\)\s*=>\s*\{([\s\S]*?)\},/)
            expect(match).not.toBeNull()
            if (match) {
                expect(match[1]).toMatch(/refetch\(\)/)
            }
        })

        it('defines handleArrivalPauseExhausted callback', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/const handleArrivalPauseExhausted\s*=\s*useCallback/)
        })

        it('defines handleArrivalPauseExplore callback', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/const handleArrivalPauseExplore\s*=\s*useCallback/)
        })

        it('defines handleArrivalPauseDismiss callback', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/const handleArrivalPauseDismiss\s*=\s*useCallback/)
        })
    })

    describe('Auto-navigate on Exit Ready', () => {
        it('watches location exits for the pending direction becoming available', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/exitAvailable.*exits.*some/)
        })

        it('emits Navigation.ArrivalPause.Ready telemetry when exit becomes available', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/trackGameEventClient\(\s*['"]Navigation\.ArrivalPause\.Ready['"]/)
        })

        it('auto-navigates and clears arrivalPause when exit is ready', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/setArrivalPause\(null\)/)
            expect(source).toMatch(/handleNavigate\(arrivalPause\.direction\)/)
        })
    })

    describe('ArrivalPauseOverlay Rendering', () => {
        it('conditionally renders ArrivalPauseOverlay when arrivalPause state is set', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/\{arrivalPause\s*&&\s*\(?\s*<ArrivalPauseOverlay/)
        })

        it('passes direction and correlationId to ArrivalPauseOverlay', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/direction={arrivalPause\.direction}/)
            expect(source).toMatch(/correlationId={arrivalPause\.correlationId}/)
        })

        it('wires refresh, exhausted, explore, and dismiss callbacks', () => {
            const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

            expect(source).toMatch(/onRefresh={handleArrivalPauseRefresh}/)
            expect(source).toMatch(/onExhausted={handleArrivalPauseExhausted}/)
            expect(source).toMatch(/onExplore={handleArrivalPauseExplore}/)
            expect(source).toMatch(/onDismiss={handleArrivalPauseDismiss}/)
        })
    })
})
