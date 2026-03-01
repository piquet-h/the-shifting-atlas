/**
 * StatusPanel Component Tests
 *
 * Tests for the persistent status panel covering:
 * - Health display with visual indicators
 * - Location name display and truncation
 * - Inventory count with 99+ cap
 * - Session duration timer
 * - Collapsible behavior on mobile
 * - Defeated state when health = 0
 * - Accessibility compliance
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StatusPanel from '../src/components/StatusPanel'

// Mock useMediaQuery hook for responsive testing
let mockIsMobile = false
vi.mock('../src/hooks/useMediaQueries', () => ({
    useMediaQuery: () => !mockIsMobile // Query is (min-width: 640px)
}))

// Mock useSessionTimer hook
const mockSessionTimer = {
    duration: '00:15:30',
    elapsedMs: 930000,
    reset: vi.fn()
}
vi.mock('../src/hooks/useSessionTimer', () => ({
    useSessionTimer: () => mockSessionTimer
}))

describe('StatusPanel Component', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockIsMobile = false
    })

    describe('Rendering', () => {
        it('renders all status fields correctly', () => {
            render(<StatusPanel health={80} maxHealth={100} locationName="Crystal Cavern" inventoryCount={5} />)

            expect(screen.getByText('Player Status')).toBeInTheDocument()
            expect(screen.getByText('80/100')).toBeInTheDocument()
            expect(screen.getByText('Crystal Cavern')).toBeInTheDocument()
            expect(screen.getByText('5 items')).toBeInTheDocument()
            expect(screen.getByText('00:15:30')).toBeInTheDocument()
        })

        it('displays health bar with correct percentage', () => {
            render(<StatusPanel health={75} maxHealth={100} locationName="Test Location" inventoryCount={0} />)

            const healthBar = screen.getByRole('progressbar', { name: /player health/i })
            expect(healthBar).toHaveAttribute('aria-valuenow', '75')
            expect(healthBar).toHaveAttribute('aria-valuemin', '0')
            expect(healthBar).toHaveAttribute('aria-valuemax', '100')
        })
    })

    describe('Edge Cases', () => {
        it('displays defeated state when health is 0', () => {
            render(<StatusPanel health={0} maxHealth={100} locationName="Dangerous Place" inventoryCount={3} />)

            expect(screen.getByRole('alert')).toHaveTextContent('Defeated')
            expect(screen.getByText('0/100')).toBeInTheDocument()
        })

        it('displays low health warning when health < 25%', () => {
            render(<StatusPanel health={20} maxHealth={100} locationName="Test Location" inventoryCount={0} />)

            expect(screen.getByRole('status', { name: '' })).toHaveTextContent('⚠️ Low health!')
        })

        it('does not show low health warning when health is 0', () => {
            render(<StatusPanel health={0} maxHealth={100} locationName="Test Location" inventoryCount={0} />)

            expect(screen.queryByText('⚠️ Low health!')).not.toBeInTheDocument()
        })

        it('caps inventory count at 99+', () => {
            render(<StatusPanel health={100} maxHealth={100} locationName="Test Location" inventoryCount={150} />)

            expect(screen.getByText('99+ items')).toBeInTheDocument()
            expect(screen.queryByText('150 items')).not.toBeInTheDocument()
        })

        it('truncates long location names with ellipsis', () => {
            const longName = 'This is a very long location name that should be truncated with ellipsis'
            render(<StatusPanel health={100} maxHealth={100} locationName={longName} inventoryCount={0} />)

            const locationElement = screen.getByTitle(longName)
            expect(locationElement.textContent).toContain('...')
            expect(locationElement.textContent?.length).toBeLessThan(longName.length)
        })

        it('does not truncate short location names', () => {
            render(<StatusPanel health={100} maxHealth={100} locationName="Short Name" inventoryCount={0} />)

            expect(screen.getByText('Short Name')).toBeInTheDocument()
            expect(screen.queryByText(/\.\.\./)).not.toBeInTheDocument()
        })

        it('handles zero max health gracefully', () => {
            render(<StatusPanel health={0} maxHealth={0} locationName="Test Location" inventoryCount={0} />)

            const healthBar = screen.getByRole('progressbar')
            expect(healthBar.querySelector('div')).toHaveStyle({ width: '0%' })
        })
    })

    describe('Health Bar Colors', () => {
        it('displays green health bar for health > 60%', () => {
            const { container } = render(<StatusPanel health={80} maxHealth={100} locationName="Test Location" inventoryCount={0} />)

            const healthBar = container.querySelector('[role="progressbar"] > div')
            expect(healthBar).toHaveClass('bg-emerald-500')
        })

        it('displays amber health bar for health 25-60%', () => {
            const { container } = render(<StatusPanel health={50} maxHealth={100} locationName="Test Location" inventoryCount={0} />)

            const healthBar = container.querySelector('[role="progressbar"] > div')
            expect(healthBar).toHaveClass('bg-amber-500')
        })

        it('displays red health bar for health < 25%', () => {
            const { container } = render(<StatusPanel health={20} maxHealth={100} locationName="Test Location" inventoryCount={0} />)

            const healthBar = container.querySelector('[role="progressbar"] > div')
            expect(healthBar).toHaveClass('bg-red-500')
        })

        it('displays gray health bar when defeated', () => {
            const { container } = render(<StatusPanel health={0} maxHealth={100} locationName="Test Location" inventoryCount={0} />)

            const healthBar = container.querySelector('[role="progressbar"] > div')
            expect(healthBar).toHaveClass('bg-gray-500')
        })
    })

    describe('Mobile Collapsible Behavior', () => {
        beforeEach(() => {
            mockIsMobile = true
        })

        it('starts collapsed on mobile', () => {
            render(<StatusPanel health={100} maxHealth={100} locationName="Test Location" inventoryCount={5} />)

            const button = screen.getByRole('button', { name: /player status/i })
            expect(button).toHaveAttribute('aria-expanded', 'false')
        })

        it('shows collapse indicator on mobile', () => {
            render(<StatusPanel health={100} maxHealth={100} locationName="Test Location" inventoryCount={5} />)

            // Should show down arrow when collapsed
            expect(screen.getByText('▼')).toBeInTheDocument()
        })

        it('is not collapsible on desktop', () => {
            mockIsMobile = false
            render(<StatusPanel health={100} maxHealth={100} locationName="Test Location" inventoryCount={5} />)

            const button = screen.getByRole('button', { name: /player status/i })
            expect(button).toHaveAttribute('disabled')
        })
    })

    describe('Accessibility', () => {
        it('has proper ARIA labels', () => {
            render(<StatusPanel health={75} maxHealth={100} locationName="Test Location" inventoryCount={5} />)

            expect(screen.getByLabelText('Player Status')).toBeInTheDocument()
            expect(screen.getByRole('progressbar', { name: /player health/i })).toBeInTheDocument()
        })

        it('marks panel as live region for updates', () => {
            const { container } = render(<StatusPanel health={75} maxHealth={100} locationName="Test Location" inventoryCount={5} />)

            const panel = container.querySelector('aside')
            expect(panel).toHaveAttribute('aria-live', 'polite')
            expect(panel).toHaveAttribute('aria-atomic', 'false')
        })

        it('does not sit above the global nav (z-index regression)', () => {
            const { container } = render(<StatusPanel health={75} maxHealth={100} locationName="Test Location" inventoryCount={5} />)

            const panel = container.querySelector('aside')
            expect(panel).toBeTruthy()
            // Nav uses z-40; StatusPanel must not be z-50 or it can cover the menu bar.
            expect(panel?.getAttribute('class') ?? '').not.toContain('z-50')
        })

        it('has proper title attributes for truncated content', () => {
            const longName = 'This is a very long location name that will be truncated'
            render(<StatusPanel health={100} maxHealth={100} locationName={longName} inventoryCount={150} />)

            expect(screen.getByTitle(longName)).toBeInTheDocument()
            expect(screen.getByTitle('150 items')).toBeInTheDocument()
        })
    })

    describe('Session Timer', () => {
        it('displays session duration from hook', () => {
            render(<StatusPanel health={100} maxHealth={100} locationName="Test Location" inventoryCount={0} />)

            expect(screen.getByText('Session')).toBeInTheDocument()
            expect(screen.getByText('00:15:30')).toBeInTheDocument()
        })
    })
})
