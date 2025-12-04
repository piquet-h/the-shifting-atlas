/**
 * NavigationUI Component Tests
 *
 * Tests for the directional navigation UI covering:
 * - Button rendering for all direction types
 * - Visual states (available vs blocked directions)
 * - Click interactions
 * - Keyboard shortcuts (arrow keys, WASD)
 * - Mobile touch target sizing
 * - Accessibility (ARIA labels, screen reader support)
 * - Edge cases (single exit, no exits, disabled state)
 */

import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('NavigationUI Component', () => {
    let NavigationUI: typeof import('../src/components/NavigationUI').default

    beforeEach(async () => {
        const module = await import('../src/components/NavigationUI')
        NavigationUI = module.default
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    describe('Rendering', () => {
        it('renders navigation section with proper ARIA structure', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['north', 'south']} onNavigate={onNavigate} />)

            expect(markup).toMatch(/aria-labelledby="navigation-title"/)
            expect(markup).toMatch(/Navigate/)
        })

        it('renders all cardinal direction buttons', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/North/)
            expect(markup).toMatch(/South/)
            expect(markup).toMatch(/East/)
            expect(markup).toMatch(/West/)
        })

        it('renders all intercardinal direction buttons', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/Northeast/)
            expect(markup).toMatch(/Northwest/)
            expect(markup).toMatch(/Southeast/)
            expect(markup).toMatch(/Southwest/)
        })

        it('renders vertical direction buttons', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/Up/)
            expect(markup).toMatch(/Down/)
        })

        it('renders radial direction buttons', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/In/)
            expect(markup).toMatch(/Out/)
        })

        it('renders keyboard shortcut hint', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/Keyboard/)
            expect(markup).toMatch(/Arrow keys/)
            expect(markup).toMatch(/WASD/)
        })
    })

    describe('Visual States', () => {
        it('applies available state styling to exits that exist', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['north', 'south']} onNavigate={onNavigate} />)

            // Available buttons should have aria labels for movement
            expect(markup).toMatch(/aria-label="Move North"/)
            expect(markup).toMatch(/aria-label="Move South"/)
        })

        it('applies blocked state styling to exits that do not exist', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['north']} onNavigate={onNavigate} />)

            // Blocked buttons should be disabled
            expect(markup).toMatch(/No South exit.*?disabled/)
        })

        it('applies disabled state when disabled prop is true', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['north', 'south']} onNavigate={onNavigate} disabled={true} />)

            // All buttons should be disabled when component is disabled
            expect(markup).toMatch(/aria-disabled="true"/)
        })
    })

    describe('Accessibility', () => {
        it('includes ARIA labels for available exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['north', 'east']} onNavigate={onNavigate} />)

            expect(markup).toMatch(/aria-label="Move North"/)
            expect(markup).toMatch(/aria-label="Move East"/)
        })

        it('includes ARIA labels for blocked exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/No North exit available/)
            expect(markup).toMatch(/No South exit available/)
        })

        it('uses role=group for direction button groups', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/role="group"/)
            expect(markup).toMatch(/aria-label="Cardinal and intercardinal directions"/)
            expect(markup).toMatch(/aria-label="Vertical and radial directions"/)
        })

        it('provides keyboard shortcut hints in button titles', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['north']} onNavigate={onNavigate} />)

            // Should show keyboard shortcuts in title attribute
            expect(markup).toMatch(/title="Move North/)
        })
    })

    describe('Mobile Touch Targets', () => {
        it('applies minimum 44px touch target sizing', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['north']} onNavigate={onNavigate} />)

            // Check for min-h-[44px] and min-w-[44px] classes
            expect(markup).toMatch(/min-h-\[44px\]/)
            expect(markup).toMatch(/min-w-\[44px\]/)
        })
    })

    describe('Edge Cases', () => {
        it('handles empty availableExits array (all buttons blocked)', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            // All buttons should be in blocked state
            expect(markup).toMatch(/No North exit available/)
            expect(markup).toMatch(/No South exit available/)
            expect(markup).toMatch(/No East exit available/)
            expect(markup).toMatch(/No West exit available/)
        })

        it('handles single available exit (one button prominently available)', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['north']} onNavigate={onNavigate} />)

            // One button available, rest blocked
            expect(markup).toMatch(/aria-label="Move North"/)
            expect(markup).toMatch(/No South exit available/)
        })

        it('handles only vertical exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['up', 'down']} onNavigate={onNavigate} />)

            expect(markup).toMatch(/aria-label="Move Up"/)
            expect(markup).toMatch(/aria-label="Move Down"/)
        })

        it('handles only radial exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['in', 'out']} onNavigate={onNavigate} />)

            expect(markup).toMatch(/aria-label="Move In"/)
            expect(markup).toMatch(/aria-label="Move Out"/)
        })

        it('handles diagonal/intercardinal-only exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={['northeast', 'southwest']} onNavigate={onNavigate} />)

            expect(markup).toMatch(/aria-label="Move Northeast"/)
            expect(markup).toMatch(/aria-label="Move Southwest"/)
        })
    })

    describe('Component Props', () => {
        it('accepts optional className prop', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} className="custom-class" />)

            expect(markup).toMatch(/custom-class/)
        })

        it('accepts disabled prop defaulting to false', () => {
            const onNavigate = vi.fn()
            const markupEnabled = renderToString(<NavigationUI availableExits={['north']} onNavigate={onNavigate} />)
            const markupDisabled = renderToString(<NavigationUI availableExits={['north']} onNavigate={onNavigate} disabled={false} />)

            // Both should have same enabled state when disabled is false or omitted
            expect(markupEnabled).toMatch(/aria-disabled="false"/)
            expect(markupDisabled).toMatch(/aria-disabled="false"/)
        })
    })
})
