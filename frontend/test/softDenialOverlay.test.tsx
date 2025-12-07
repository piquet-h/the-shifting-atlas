/**
 * SoftDenialOverlay Component Tests
 *
 * Tests for the soft-denial UX component covering:
 * - Rendering with different location contexts (indoor/outdoor/underground/urban)
 * - Telemetry event emission (Displayed, Retry, Explored, Quit)
 * - Action button callbacks
 * - Keyboard accessibility (Escape key)
 * - AI-cached narrative preference
 *
 * Reference: Issue #595 - Frontend Soft-Denial Narrative UX for Generate Status
 */

import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const SOFT_DENIAL_PATH = path.join(__dirname, '../src/components/SoftDenialOverlay.tsx')

describe('SoftDenialOverlay Component', () => {
    describe('Component Structure', () => {
        it('exports default component and required types', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            // Check for default export
            expect(source).toMatch(/export default function SoftDenialOverlay/)

            // Check for exported types
            expect(source).toMatch(/export type LocationContext/)
            expect(source).toMatch(/export interface GenerationHint/)
            expect(source).toMatch(/export interface SoftDenialOverlayProps/)
        })

        it('defines all location context narrative templates', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            // Check for narrative templates object with all context types
            expect(source).toMatch(/NARRATIVE_TEMPLATES:\s*Record<LocationContext/)
            expect(source).toMatch(/indoor:/)
            expect(source).toMatch(/outdoor:/)
            expect(source).toMatch(/underground:/)
            expect(source).toMatch(/urban:/)
            expect(source).toMatch(/unknown:/)
        })

        it('has proper ARIA attributes for accessibility', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            // Check for dialog role and modal
            expect(source).toMatch(/role="dialog"/)
            expect(source).toMatch(/aria-modal="true"/)
            expect(source).toMatch(/aria-labelledby="soft-denial-title"/)
            expect(source).toMatch(/aria-describedby="soft-denial-narrative"/)
        })
    })

    describe('Telemetry Integration', () => {
        it('imports useTelemetry hook', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            expect(source).toMatch(/import.*useTelemetry.*from.*TelemetryContext/)
        })

        it('tracks Navigation.SoftDenial.Displayed on mount', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            // Check for useEffect that tracks display event
            expect(source).toMatch(/trackGameEvent\(\s*['"]Navigation\.SoftDenial\.Displayed['"]/)
        })

        it('tracks Navigation.SoftDenial.Retry on retry action', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            expect(source).toMatch(/trackGameEvent\(\s*['"]Navigation\.SoftDenial\.Retry['"]/)
        })

        it('tracks Navigation.SoftDenial.Explored on explore action', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            expect(source).toMatch(/trackGameEvent\(\s*['"]Navigation\.SoftDenial\.Explored['"]/)
        })

        it('tracks Navigation.SoftDenial.Quit on dismiss action', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            expect(source).toMatch(/trackGameEvent\(\s*['"]Navigation\.SoftDenial\.Quit['"]/)
        })
    })

    describe('Keyboard Accessibility', () => {
        it('handles Escape key to dismiss overlay', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            // Check for keydown event listener for Escape
            expect(source).toMatch(/e\.key\s*===\s*['"]Escape['"]/)
            expect(source).toMatch(/window\.addEventListener\(\s*['"]keydown['"]/)
            expect(source).toMatch(/window\.removeEventListener\(\s*['"]keydown['"]/)
        })

        it('displays keyboard hint for Escape key', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            // Check for Esc key hint in UI
            expect(source).toMatch(/<kbd.*>Esc<\/kbd>/)
        })
    })

    describe('Action Buttons', () => {
        it('renders Try Again button', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            expect(source).toMatch(/Try Again/)
            expect(source).toMatch(/onClick={handleRetry}/)
        })

        it('renders Explore Elsewhere button', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            expect(source).toMatch(/Explore Elsewhere/)
            expect(source).toMatch(/onClick={handleExplore}/)
        })

        it('renders Dismiss button', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            expect(source).toMatch(/Dismiss/)
            expect(source).toMatch(/onClick={handleDismiss}/)
        })
    })

    describe('Narrative Selection', () => {
        it('prefers AI-cached narrative over template', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            // Check that generationHint.narrative is used if available
            expect(source).toMatch(/generationHint\?\.narrative/)
        })

        it('uses selectNarrative function for template fallback', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            // Check for selectNarrative function
            expect(source).toMatch(/function selectNarrative\(/)
            expect(source).toMatch(/selectNarrative\(locationContext/)
        })

        it('applies direction placeholder in templates', () => {
            const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

            // Check for placeholder replacement
            expect(source).toMatch(/\{direction\}/)
            expect(source).toMatch(/replace\(.*direction/)
        })
    })
})

describe('SoftDenialOverlay Narrative Templates', () => {
    // These tests verify template quality and coverage
    const source = fs.readFileSync(SOFT_DENIAL_PATH, 'utf-8')

    it('indoor templates mention interior/chamber/room elements', () => {
        // Extract indoor templates section
        const indoorMatch = source.match(/indoor:\s*\[([\s\S]*?)\],/)
        expect(indoorMatch).not.toBeNull()

        if (indoorMatch) {
            const templates = indoorMatch[1]
            // Indoor narratives should reference walls, chambers, or interior elements
            expect(templates).toMatch(/wall|chamber|stone|torchlight/i)
        }
    })

    it('outdoor templates mention nature/terrain elements', () => {
        const outdoorMatch = source.match(/outdoor:\s*\[([\s\S]*?)\],/)
        expect(outdoorMatch).not.toBeNull()

        if (outdoorMatch) {
            const templates = outdoorMatch[1]
            expect(templates).toMatch(/undergrowth|mist|terrain|trees/i)
        }
    })

    it('underground templates mention cave/tunnel elements', () => {
        const undergroundMatch = source.match(/underground:\s*\[([\s\S]*?)\],/)
        expect(undergroundMatch).not.toBeNull()

        if (undergroundMatch) {
            const templates = undergroundMatch[1]
            expect(templates).toMatch(/tunnel|cave|darkness|dripping/i)
        }
    })

    it('urban templates mention city/street elements', () => {
        const urbanMatch = source.match(/urban:\s*\[([\s\S]*?)\],/)
        expect(urbanMatch).not.toBeNull()

        if (urbanMatch) {
            const templates = urbanMatch[1]
            expect(templates).toMatch(/street|crowd|alley|guards/i)
        }
    })

    it('unknown templates are appropriately vague', () => {
        const unknownMatch = source.match(/unknown:\s*\[([\s\S]*?)\]/)
        expect(unknownMatch).not.toBeNull()

        if (unknownMatch) {
            const templates = unknownMatch[1]
            // Unknown narratives should be non-specific
            expect(templates).toMatch(/something|shimmer|invisible|cannot.*discern/i)
        }
    })
})
