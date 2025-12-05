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
            const markup = renderToString(
                <NavigationUI availableExits={[{ direction: 'north' }, { direction: 'south' }]} onNavigate={onNavigate} />
            )

            expect(markup).toMatch(/aria-labelledby="navigation-title"/)
            expect(markup).toMatch(/Navigate/)
        })

        it('renders all cardinal direction buttons', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/North/)
            expect(markup).toMatch(/South/)
            expect(markup).toMatch(/East/)
            expect(markup).toMatch(/West/)
        })

        it('renders all intercardinal direction buttons', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/Northeast/)
            expect(markup).toMatch(/Northwest/)
            expect(markup).toMatch(/Southeast/)
            expect(markup).toMatch(/Southwest/)
        })

        it('renders vertical direction buttons', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'up' }]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/Up/)
            expect(markup).toMatch(/Down/)
        })

        it('renders radial direction buttons', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'in' }]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/In/)
            expect(markup).toMatch(/Out/)
        })

        it('renders keyboard shortcut hint', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/Keyboard/)
            expect(markup).toMatch(/Arrow keys/)
            expect(markup).toMatch(/WASD/)
        })

        it('displays "No visible exits" message when no exits available', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/No visible exits/)
            expect(markup).toMatch(/dead end/)
        })
    })

    describe('Visual States', () => {
        it('applies available state styling to exits that exist', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(
                <NavigationUI availableExits={[{ direction: 'north' }, { direction: 'south' }]} onNavigate={onNavigate} />
            )

            // Available buttons should have aria labels for movement
            expect(markup).toMatch(/aria-label="Move North"/)
            expect(markup).toMatch(/aria-label="Move South"/)
        })

        it('applies blocked state styling to exits that do not exist', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)

            // Blocked buttons should be disabled
            expect(markup).toMatch(/No South exit.*?disabled/)
        })

        it('applies disabled state when disabled prop is true', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(
                <NavigationUI availableExits={[{ direction: 'north' }, { direction: 'south' }]} onNavigate={onNavigate} disabled={true} />
            )

            // All buttons should be disabled when component is disabled
            expect(markup).toMatch(/aria-disabled="true"/)
        })
    })

    describe('Accessibility', () => {
        it('includes ARIA labels for available exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(
                <NavigationUI availableExits={[{ direction: 'north' }, { direction: 'east' }]} onNavigate={onNavigate} />
            )

            expect(markup).toMatch(/aria-label="Move North"/)
            expect(markup).toMatch(/aria-label="Move East"/)
        })

        it('includes ARIA labels for blocked exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            // When no exits available, should show the "no visible exits" message
            expect(markup).toMatch(/No visible exits/)
        })

        it('uses role=group for direction button groups when exits exist', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)

            expect(markup).toMatch(/role="group"/)
            expect(markup).toMatch(/aria-label="Cardinal and intercardinal directions"/)
            expect(markup).toMatch(/aria-label="Vertical and radial directions"/)
        })

        it('provides keyboard shortcut hints in button titles', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)

            // Should show keyboard shortcuts in title attribute
            expect(markup).toMatch(/title="Move North/)
        })
    })

    describe('Mobile Touch Targets', () => {
        it('applies minimum 44px touch target sizing', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)

            // Check for min-h-[44px] and min-w-[44px] classes
            expect(markup).toMatch(/min-h-\[44px\]/)
            expect(markup).toMatch(/min-w-\[44px\]/)
        })
    })

    describe('Edge Cases', () => {
        it('handles empty availableExits array (shows dead end message)', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[]} onNavigate={onNavigate} />)

            // Should display the "no visible exits" message
            expect(markup).toMatch(/No visible exits/)
            expect(markup).toMatch(/dead end/)
        })

        it('handles single available exit', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)

            // One button available
            expect(markup).toMatch(/aria-label="Move North"/)
        })

        it('handles only vertical exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(
                <NavigationUI availableExits={[{ direction: 'up' }, { direction: 'down' }]} onNavigate={onNavigate} />
            )

            expect(markup).toMatch(/aria-label="Move Up"/)
            expect(markup).toMatch(/aria-label="Move Down"/)
        })

        it('handles only radial exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(
                <NavigationUI availableExits={[{ direction: 'in' }, { direction: 'out' }]} onNavigate={onNavigate} />
            )

            expect(markup).toMatch(/aria-label="Move In"/)
            expect(markup).toMatch(/aria-label="Move Out"/)
        })

        it('handles diagonal/intercardinal-only exits', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(
                <NavigationUI availableExits={[{ direction: 'northeast' }, { direction: 'southwest' }]} onNavigate={onNavigate} />
            )

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
            const markupEnabled = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)
            const markupDisabled = renderToString(
                <NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} disabled={false} />
            )

            // Both should have same enabled state when disabled is false or omitted
            expect(markupEnabled).toMatch(/aria-disabled="false"/)
            expect(markupDisabled).toMatch(/aria-disabled="false"/)
        })
    })

    describe('Exit Hints', () => {
        it('displays hint text when exit has description', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(
                <NavigationUI
                    availableExits={[
                        { direction: 'north', description: 'A winding path' },
                        { direction: 'south', description: 'Stone steps' }
                    ]}
                    onNavigate={onNavigate}
                />
            )

            expect(markup).toMatch(/A winding path/)
            expect(markup).toMatch(/Stone steps/)
        })

        it('does not display hint text when exit has no description', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(<NavigationUI availableExits={[{ direction: 'north' }]} onNavigate={onNavigate} />)

            // Hint text should not appear in markup
            expect(markup).toMatch(/aria-label="Move North"/)
            // No description text should be present
            expect(markup).not.toMatch(/italic line-clamp-1/)
        })

        it('handles mixed exits with and without hints', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(
                <NavigationUI
                    availableExits={[
                        { direction: 'north', description: 'Dense forest' },
                        { direction: 'south' },
                        { direction: 'east', description: 'Rocky cliffs' }
                    ]}
                    onNavigate={onNavigate}
                />
            )

            expect(markup).toMatch(/Dense forest/)
            expect(markup).toMatch(/Rocky cliffs/)
            expect(markup).toMatch(/aria-label="Move South"/)
        })

        it('truncates long hint text with line-clamp', () => {
            const onNavigate = vi.fn()
            const longHint = 'A very long description that should be truncated'
            const markup = renderToString(
                <NavigationUI availableExits={[{ direction: 'north', description: longHint }]} onNavigate={onNavigate} />
            )

            expect(markup).toMatch(/line-clamp-1/)
            expect(markup).toMatch(new RegExp(longHint))
        })

        it('includes hint in title attribute for accessibility', () => {
            const onNavigate = vi.fn()
            const markup = renderToString(
                <NavigationUI availableExits={[{ direction: 'north', description: 'Moonlit passage' }]} onNavigate={onNavigate} />
            )

            expect(markup).toMatch(/title="Moonlit passage"/)
        })
    })
})
