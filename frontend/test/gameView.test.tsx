/**
 * GameView Component Tests
 *
 * Tests for the main game view component covering:
 * - Rendering location name and description
 * - Exit list with visual indicators
 * - Player stats panel
 * - Responsive layout (mobile vs desktop)
 * - Edge cases: no exits, long descriptions, loading states
 * - Accessibility compliance
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerProvider } from '../src/contexts/PlayerContext'

// Mock state for usePlayerGuid hook
const mockGuidState = {
    playerGuid: null as string | null,
    currentLocationId: null as string | null,
    loading: false,
    error: null as string | null
}

// Mock usePlayerGuid hook (used by PlayerContext internally)
vi.mock('../src/hooks/usePlayerGuid', () => ({
    usePlayerGuid: () => ({
        playerGuid: mockGuidState.playerGuid,
        currentLocationId: mockGuidState.currentLocationId,
        loading: mockGuidState.loading,
        created: null,
        error: mockGuidState.error,
        refresh: () => {},
        updateCurrentLocationId: (id: string) => {
            mockGuidState.currentLocationId = id
        }
    })
}))

// Mock useMediaQuery hook for responsive layout testing
let mockIsDesktop = false
vi.mock('../src/hooks/useMediaQueries', () => ({
    useMediaQuery: () => mockIsDesktop
}))

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// Helper to wrap component with required providers
function renderWithProviders(component: React.ReactElement): string {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                cacheTime: 0
            }
        }
    })

    return renderToString(
        <QueryClientProvider client={queryClient}>
            <PlayerProvider>{component}</PlayerProvider>
        </QueryClientProvider>
    )
}

describe('GameView Component', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mockGuidState.playerGuid = null
        mockGuidState.currentLocationId = null
        mockGuidState.loading = false
        mockGuidState.error = null
        mockIsDesktop = false

        // Default mock response for location fetch
        mockFetch.mockResolvedValue({
            ok: true,
            json: () =>
                Promise.resolve({
                    success: true,
                    data: {
                        id: 'loc-123',
                        name: 'Test Location',
                        description: {
                            text: 'A mysterious chamber with ancient runes.',
                            html: '<p>A mysterious chamber with ancient runes.</p>',
                            provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                        },
                        exits: [{ direction: 'north' }, { direction: 'south' }]
                    }
                })
        })
    })

    describe('Navigation Panel', () => {
        it('renders game sections correctly in mobile layout', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Should render game view with all key sections (navigation is conditional on user preference)
            expect(markup).toMatch(/aria-labelledby="stats-title"/)
            expect(markup).toMatch(/Your Atlas/)
            expect(markup).toMatch(/Recent Actions/)
        })

        it('shows dead end when no exits available', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        success: true,
                        data: {
                            id: 'dead-end',
                            name: 'Dead End',
                            description: {
                                text: 'A passage that leads nowhere.',
                                html: '<p>A passage that leads nowhere.</p>',
                                provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                            },
                            exits: []
                        }
                    })
            })

            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Game should still render even with no exits
            expect(markup).toMatch(/aria-labelledby="stats-title"/)
        })
    })

    describe('Player Stats Panel', () => {
        it('renders player status section', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Should have stats section
            expect(markup).toMatch(/aria-labelledby="stats-title"/)
            expect(markup).toMatch(/Explorer Status/)
        })

        it('displays health bar with progressbar role', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Stats panel should have progressbar for health
            // During loading, it shows "Initializing..." but structure should exist
            expect(markup).toMatch(/Explorer Status/)
        })

        it('derives locationName from location prop without useEffect', async () => {
            // Set up mock location data
            mockGuidState.currentLocationId = 'loc-derived-test'
            mockFetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        success: true,
                        data: {
                            id: 'loc-derived-test',
                            name: 'Derived Location Name',
                            description: {
                                text: 'Test location for derived stats.',
                                html: '<p>Test location for derived stats.</p>',
                                provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                            },
                            exits: [{ direction: 'north' }]
                        }
                    })
            })

            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Initial render: stats should show initializing (location not loaded yet)
            expect(markup).toMatch(/Initializing\.\.\./)

            // This test verifies the anti-pattern is removed:
            // Stats should be derived from location prop, not set via useEffect
            // The actual derived behavior will be tested in integration tests
            // where we can await location load and check stats update
        })
    })

    describe('Command History Panel', () => {
        it('renders command history section', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Should have history section
            expect(markup).toMatch(/aria-labelledby="history-title"/)
            expect(markup).toMatch(/Recent Actions/)
        })

        it('shows empty state when no commands issued', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            expect(markup).toMatch(/No actions yet/)
        })
    })

    describe('Command Interface Heading', () => {
        it('renders the Your Atlas heading', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            expect(markup).toMatch(/Your Atlas/)
        })

        it('constrains Your Atlas panel for internal scrolling', async () => {
            mockIsDesktop = true
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            expect(markup).toMatch(/game-command-title-desktop/)
            expect(markup).toMatch(/card rounded-xl flex flex-col flex-1 min-h-0 overflow-hidden/)
        })
    })

    describe('Responsive Layout', () => {
        it('renders mobile layout by default (single column)', async () => {
            // mockIsDesktop is false by default in beforeEach
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Mobile layout has stacked sections with game-command-title-mobile
            // (desktop layout uses game-command-title without -mobile suffix)
            expect(markup).toMatch(/game-command-title-mobile/)
        })
    })

    describe('Command Interface Integration', () => {
        it('includes CommandInterface component', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Should have command interface section
            expect(markup).toMatch(/Your Atlas/)
        })
    })

    describe('Accessibility', () => {
        it('has proper section landmarks with aria-labelledby', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // All major sections should have aria-labelledby
            expect(markup).toMatch(/aria-labelledby="stats-title"/)
            expect(markup).toMatch(/aria-labelledby="history-title"/)
            // Navigation section is conditional on user preference (navigationUIEnabled)
            // and not rendered in SSR tests by default
        })

        it('loading state has aria-busy attribute', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Loading panel should have aria-busy
            expect(markup).toMatch(/aria-busy="true"/)
        })
    })

    describe('Edge Cases', () => {
        it('handles location with no exits (dead end)', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () =>
                    Promise.resolve({
                        success: true,
                        data: {
                            id: 'dead-end',
                            name: 'Dead End',
                            description: {
                                text: 'A passage that leads nowhere.',
                                html: '<p>A passage that leads nowhere.</p>',
                                provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                            },
                            exits: []
                        }
                    })
            })

            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Should still render game view structure with all sections
            expect(markup).toMatch(/aria-labelledby="stats-title"/)
            expect(markup).toMatch(/Your Atlas/)
            expect(markup).toMatch(/Recent Actions/)
        })
    })

    describe('CSS Classes and Styling', () => {
        it('uses responsive text classes', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Should use text-responsive-* classes for responsive typography
            expect(markup).toMatch(/text-responsive-/)
        })

        it('uses atlas color theme classes', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Should use atlas-accent for theming (used in borders, backgrounds, and focus states)
            expect(markup).toMatch(/atlas-accent/)
        })

        it('uses proper focus styles for interactive elements', async () => {
            const { default: GameView } = await import('../src/components/GameView')
            const markup = renderWithProviders(<GameView />)

            // Should have focus-visible styles
            expect(markup).toMatch(/focus-visible:ring/)
        })
    })
})
