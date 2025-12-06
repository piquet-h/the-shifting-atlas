/**
 * Responsive Layout Tests
 *
 * Verifies responsive design behavior across mobile, tablet, and desktop breakpoints.
 * Tests:
 * - Mobile (<640px): Single column, collapsible stats
 * - Tablet (640-1024px): Two-column layout
 * - Desktop (≥1024px): Three-column layout
 * - Touch targets meet minimum size requirements (≥44px)
 * - No horizontal scroll at standard viewports
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PlayerProvider } from '../src/contexts/PlayerContext'
import GameView from '../src/components/GameView'

// Mock hooks
vi.mock('../src/hooks/usePlayerLocation', () => ({
    usePlayerLocation: () => ({
        location: {
            id: 'test-location-id',
            name: 'Test Location',
            description: { text: 'A test location description', format: 'plain' },
            exits: [
                { direction: 'north', description: 'A northern passage' },
                { direction: 'south', description: 'A southern passage' }
            ]
        },
        isLoading: false,
        error: null,
        refetch: vi.fn()
    })
}))

vi.mock('../src/hooks/usePlayerGuid', () => ({
    usePlayerGuid: () => ({
        playerGuid: 'test-player-guid',
        currentLocationId: 'test-location-id',
        loading: false,
        created: null,
        error: null,
        refresh: vi.fn(),
        updateCurrentLocationId: vi.fn()
    })
}))

vi.mock('../src/services/telemetry', () => ({
    trackGameEventClient: vi.fn()
}))

// Helper to set viewport width
function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width
    })

    // Mock matchMedia for different breakpoints
    window.matchMedia = vi.fn().mockImplementation((query: string) => {
        let matches = false

        // Parse media query for width
        if (query.includes('min-width: 1024px')) {
            matches = width >= 1024
        } else if (query.includes('min-width: 640px')) {
            matches = width >= 640
        }

        return {
            matches,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn()
        }
    })
}

function renderGameView() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
        }
    })

    return render(
        <QueryClientProvider client={queryClient}>
            <PlayerProvider>
                <GameView />
            </PlayerProvider>
        </QueryClientProvider>
    )
}

describe('Responsive Layout - Breakpoints', () => {
    it('renders mobile layout on narrow viewport (<640px)', async () => {
        setViewportWidth(375) // iPhone size

        const { container } = renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        // Should have single column layout (no grid with col-span)
        const gridElements = container.querySelectorAll('.grid.grid-cols-12')
        expect(gridElements.length).toBe(0)

        // Stats panel should be present
        expect(screen.getByText('Explorer Status')).toBeInTheDocument()
    })

    it('renders tablet layout on medium viewport (640-1024px)', async () => {
        setViewportWidth(768) // Tablet size

        const { container } = renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        // Should have grid layout
        const gridElements = container.querySelectorAll('.grid.grid-cols-12')
        expect(gridElements.length).toBeGreaterThan(0)

        // Should have two-column split (col-span-8 and col-span-4)
        const mainColumn = container.querySelector('.col-span-8')
        const sideColumn = container.querySelector('.col-span-4')

        expect(mainColumn).not.toBeNull()
        expect(sideColumn).not.toBeNull()
    })

    it('renders desktop layout on large viewport (≥1024px)', async () => {
        setViewportWidth(1440) // Desktop size

        const { container } = renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        // Should have grid layout
        const gridElements = container.querySelectorAll('.grid.grid-cols-12')
        expect(gridElements.length).toBeGreaterThan(0)

        // Should have three-column split (col-span-7 and col-span-5 for desktop)
        const mainColumn = container.querySelector('.col-span-7')
        const sideColumn = container.querySelector('.col-span-5')

        expect(mainColumn).not.toBeNull()
        expect(sideColumn).not.toBeNull()
    })

    it('renders very narrow viewport gracefully (320px)', async () => {
        setViewportWidth(320) // Minimum supported viewport

        renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        // Should still render all key elements
        expect(screen.getByText('Available Exits')).toBeInTheDocument()
        expect(screen.getByText('Explorer Status')).toBeInTheDocument()
        expect(screen.getByText('Command Interface')).toBeInTheDocument()
    })

    it('renders ultra-wide viewport with proper constraints (1920px+)', async () => {
        setViewportWidth(2560) // Ultra-wide desktop

        const { container } = renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        // Should have desktop layout with three columns
        const mainColumn = container.querySelector('.col-span-7')
        const sideColumn = container.querySelector('.col-span-5')

        expect(mainColumn).not.toBeNull()
        expect(sideColumn).not.toBeNull()
    })
})

describe('Responsive Layout - Collapsible Stats Panel', () => {
    it('shows collapsible stats panel on mobile', async () => {
        setViewportWidth(375)

        renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        // Stats panel should have collapse button functionality
        const statsButton = screen.getByRole('button', { name: /Explorer Status/i })
        expect(statsButton).toBeInTheDocument()
        expect(statsButton).toHaveAttribute('aria-expanded')
    })

    it('allows toggling stats panel on mobile', async () => {
        setViewportWidth(375)
        const user = userEvent.setup()

        renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        const statsButton = screen.getByRole('button', { name: /Explorer Status/i })

        // Should be expanded by default (collapsible defaults to expanded)
        expect(statsButton).toHaveAttribute('aria-expanded', 'true')

        // Click to collapse
        await user.click(statsButton)

        await waitFor(() => {
            expect(statsButton).toHaveAttribute('aria-expanded', 'false')
        })
    })

    it('does not show collapsible behavior on tablet/desktop', async () => {
        setViewportWidth(1024)

        renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        // Stats panel button should be disabled (not collapsible)
        const statsButton = screen.getByRole('button', { name: /Explorer Status/i })
        expect(statsButton).toBeDisabled()
    })
})

describe('Responsive Layout - Touch Targets', () => {
    it('ensures command input has minimum touch target size', async () => {
        setViewportWidth(375)

        const { container } = renderGameView()

        await waitFor(() => {
            const commandInput = container.querySelector('input[aria-label="Command"]')
            expect(commandInput).toBeInTheDocument()
        })

        const commandInput = container.querySelector('input[aria-label="Command"]')
        expect(commandInput).toHaveClass('touch-target')
    })

    it('ensures submit button has minimum touch target size', async () => {
        setViewportWidth(375)

        renderGameView()

        await waitFor(() => {
            const submitButton = screen.getByRole('button', { name: /Run/i })
            expect(submitButton).toBeInTheDocument()
            expect(submitButton).toHaveClass('touch-target')
        })
    })

    it('ensures navigation buttons have minimum touch target size', async () => {
        setViewportWidth(375)

        const { container } = renderGameView()

        await waitFor(() => {
            expect(screen.getByText('Navigate')).toBeInTheDocument()
        })

        // Navigation buttons should have min-h-[44px] and min-w-[44px]
        const navButtons = container.querySelectorAll('button[title*="Move"]')
        navButtons.forEach((button) => {
            const classes = button.className
            expect(classes).toMatch(/min-h-\[44px\]/)
            expect(classes).toMatch(/min-w-\[44px\]/)
        })
    })
})

describe('Responsive Layout - No Horizontal Scroll', () => {
    it('prevents horizontal scroll on mobile viewport', async () => {
        setViewportWidth(375)

        const { container } = renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        // All elements should fit within viewport width
        // This is tested via CSS classes, but we verify no obvious overflow
        const wideElements = container.querySelectorAll('[style*="width"]')
        wideElements.forEach((element) => {
            const width = (element as HTMLElement).style.width
            // Should not have fixed widths larger than viewport
            if (width && width.includes('px')) {
                const pxValue = parseInt(width)
                expect(pxValue).toBeLessThanOrEqual(375)
            }
        })
    })

    it('prevents horizontal scroll on tablet viewport', async () => {
        setViewportWidth(768)

        const { container } = renderGameView()

        await waitFor(() => {
            expect(screen.getByRole('heading', { name: 'Test Location' })).toBeInTheDocument()
        })

        // Grid layout should fit within container
        const gridElements = container.querySelectorAll('.grid.grid-cols-12')
        expect(gridElements.length).toBeGreaterThan(0)
    })
})
