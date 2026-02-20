/**
 * ArrivalPauseOverlay Component Tests
 *
 * Tests for the immersive arrival-pause UX component covering:
 * - Component structure and exported types
 * - ARIA accessibility attributes
 * - No "Try Again" / "Retry" button (auto-refresh replaces manual retry)
 * - Explore Elsewhere and Dismiss buttons present
 * - Telemetry: Navigation.ArrivalPause.Shown on mount
 * - Keyboard Escape to dismiss
 * - Uses useArrivalPause hook internally
 *
 * Reference: Issue #809 - Immersive arrival pause for pending paths
 */

import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const OVERLAY_PATH = path.join(__dirname, '../src/components/ArrivalPauseOverlay.tsx')
const HOOK_PATH = path.join(__dirname, '../src/hooks/useArrivalPause.ts')

describe('ArrivalPauseOverlay Component', () => {
    describe('Component Structure', () => {
        it('exports default component', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/export default function ArrivalPauseOverlay/)
        })

        it('exports ArrivalPauseOverlayProps interface', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/export interface ArrivalPauseOverlayProps/)
        })

        it('uses useArrivalPause hook from hooks directory', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/import.*useArrivalPause.*from.*hooks\/useArrivalPause/)
        })

        it('emits Navigation.ArrivalPause.Shown on mount', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/trackGameEvent\(\s*['"]Navigation\.ArrivalPause\.Shown['"]/)
        })
    })

    describe('Accessibility', () => {
        it('has role="dialog" for screen readers', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/role="dialog"/)
        })

        it('has aria-modal="true"', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/aria-modal="true"/)
        })

        it('has aria-labelledby for dialog title', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/aria-labelledby="arrival-pause-title"/)
        })

        it('has aria-describedby for narrative content', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/aria-describedby="arrival-pause-narrative"/)
        })

        it('handles Escape key to dismiss overlay', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/e\.key\s*===\s*['"]Escape['"]/)
            expect(source).toMatch(/window\.addEventListener\(\s*['"]keydown['"]/)
            expect(source).toMatch(/window\.removeEventListener\(\s*['"]keydown['"]/)
        })

        it('displays keyboard hint for Escape key', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/<kbd.*>Esc<\/kbd>/)
        })
    })

    describe('Action Buttons', () => {
        it('renders Explore Elsewhere button', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/Explore Elsewhere/)
            expect(source).toMatch(/onClick={handleExplore}/)
        })

        it('renders Dismiss button', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/Dismiss/)
            expect(source).toMatch(/onClick={handleDismiss}/)
        })

        it('does NOT render a "Try Again" or "Retry" button', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            // These are the manual-retry patterns that should not appear
            expect(source).not.toMatch(/Try Again/)
            expect(source).not.toMatch(/handleRetry/)
            expect(source).not.toMatch(/onRetry/)
        })
    })

    describe('Narrative Display', () => {
        it('renders narrativeCopy from useArrivalPause hook', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/narrativeCopy/)
            expect(source).toMatch(/\{narrativeCopy\}/)
        })

        it('shows progress indicator (attempt count) while not exhausted', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/attempt.*maxAttempts/)
        })
    })

    describe('Props Interface', () => {
        it('accepts onRefresh, onExhausted, onExplore, onDismiss callbacks', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/onRefresh:\s*\(\)\s*=>/)
            expect(source).toMatch(/onExhausted:\s*\(\)\s*=>/)
            expect(source).toMatch(/onExplore:\s*\(\)\s*=>/)
            expect(source).toMatch(/onDismiss:\s*\(\)\s*=>/)
        })

        it('accepts optional maxAttempts and refreshDelayMs configuration', () => {
            const source = fs.readFileSync(OVERLAY_PATH, 'utf-8')

            expect(source).toMatch(/maxAttempts\?:/)
            expect(source).toMatch(/refreshDelayMs\?:/)
        })
    })
})

describe('useArrivalPause Hook – Narrative Copy Quality', () => {
    it('has at least 2 copy variants for escalation', () => {
        const source = fs.readFileSync(HOOK_PATH, 'utf-8')

        const copyMatch = source.match(/ARRIVAL_PAUSE_COPY\s*=\s*\[([\s\S]*?)\]/)
        expect(copyMatch).not.toBeNull()

        if (copyMatch) {
            // Count quoted string entries
            const entries = copyMatch[1].match(/'[^']*'|"[^"]*"/g)
            expect(entries).not.toBeNull()
            expect(entries!.length).toBeGreaterThanOrEqual(2)
        }
    })

    it('first copy variant mentions distance/mystery', () => {
        const source = fs.readFileSync(HOOK_PATH, 'utf-8')

        const copyMatch = source.match(/ARRIVAL_PAUSE_COPY\s*=\s*\[([\s\S]*?)\]/)
        if (copyMatch) {
            expect(copyMatch[1]).toMatch(/mist|beyond|stirs|unknown/i)
        }
    })

    it('exhausted copy is distinct from regular copy variants', () => {
        const source = fs.readFileSync(HOOK_PATH, 'utf-8')

        const exhaustedMatch = source.match(/ARRIVAL_PAUSE_EXHAUSTED_COPY\s*=\s*['"`]([\s\S]*?)['"`]/)
        const copyMatch = source.match(/ARRIVAL_PAUSE_COPY\s*=\s*\[([\s\S]*?)\]/)

        expect(exhaustedMatch).not.toBeNull()
        expect(copyMatch).not.toBeNull()

        if (exhaustedMatch && copyMatch) {
            // Exhausted copy should not appear in the regular copy array
            expect(copyMatch[1]).not.toContain(exhaustedMatch[1])
        }
    })
})
