import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GameView from '../src/components/GameView'
import { PlayerProvider } from '../src/contexts/PlayerContext'
import { server } from './mocks/server'

// Deterministic IDs for command log entries
const mockUUID = '12345678-1234-1234-1234-123456789012'
vi.stubGlobal('crypto', {
    ...crypto,
    randomUUID: () => mockUUID
})

function renderGameView() {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                cacheTime: 0
            }
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

describe('GameView navigation narratives', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    it('shows command output when navigating via buttons', async () => {
        const user = userEvent.setup()
        renderGameView()

        // Wait for navigation UI to load exits and allow interaction
        const northButton = await screen.findByRole('button', { name: /move north/i }, { timeout: 5000 })

        await user.click(northButton)

        // Command output should mirror typed command narrative
        await waitFor(() => expect(screen.getAllByText(/Moved north -> North Road/i).length).toBeGreaterThan(0), { timeout: 7000 })

        // Ensure the command itself is also logged in the output panel
        expect(screen.getAllByText(/move north/i).length).toBeGreaterThan(0)
    }, 15000)

    it('does not refetch old+new location after button move (move response is authoritative)', async () => {
        const user = userEvent.setup()

        // Valid GUIDs
        const playerGuid = '550e8400-e29b-41d4-a716-446655440001'
        const starterLocationId = 'a7e3f8c0-1234-4abc-9def-1234567890ab'
        const northRoadLocationId = 'b8f4a9d1-2345-5bcd-aef1-2345678901bc'

        const locationGets: string[] = []

        // Ensure we have deterministic endpoints for this test and can count location fetches.
        server.use(
            http.get('/api/player', () => {
                return HttpResponse.json({
                    success: true,
                    data: {
                        playerGuid,
                        created: false,
                        currentLocationId: starterLocationId
                    }
                })
            }),
            http.get('/api/location/:locationId', ({ params }) => {
                const locationId = String(params.locationId)
                locationGets.push(locationId)

                if (locationId === starterLocationId) {
                    return HttpResponse.json({
                        success: true,
                        data: {
                            id: starterLocationId,
                            name: 'Mosswell River Jetty',
                            description: {
                                text: 'Timbered jetty where river current meets brackish tide.',
                                html: '<p>Timbered jetty where river current meets brackish tide.</p>',
                                provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                            },
                            exits: [{ direction: 'north', targetId: northRoadLocationId }]
                        }
                    })
                }

                if (locationId === northRoadLocationId) {
                    return HttpResponse.json({
                        success: true,
                        data: {
                            id: northRoadLocationId,
                            name: 'North Road',
                            description: {
                                text: 'Slight rise leading north; bustle of the square fades behind.',
                                html: '<p>Slight rise leading north; bustle of the square fades behind.</p>',
                                provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                            },
                            exits: [{ direction: 'south', targetId: starterLocationId }]
                        }
                    })
                }

                return HttpResponse.json({ success: false }, { status: 404 })
            }),
            http.post('/api/player/:playerId/move', async () => {
                return HttpResponse.json({
                    success: true,
                    data: {
                        id: northRoadLocationId,
                        name: 'North Road',
                        description: {
                            text: 'Slight rise leading north; bustle of the square fades behind.',
                            html: '<p>Slight rise leading north; bustle of the square fades behind.</p>',
                            provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                        },
                        exits: [{ direction: 'south', targetId: starterLocationId }]
                    }
                })
            })
        )

        renderGameView()

        // Wait for the initial location fetch (to render exits / navigation buttons)
        await waitFor(() => expect(locationGets).toEqual([starterLocationId]), { timeout: 5000 })

        const northButton = await screen.findByRole('button', { name: /move north/i }, { timeout: 5000 })
        await user.click(northButton)

        await waitFor(() => expect(screen.getAllByText(/Moved north -> North Road/i).length).toBeGreaterThan(0), { timeout: 7000 })

        // Navigation button move returns the new location; we should not immediately refetch location,
        // especially not the old one.
        expect(locationGets).toEqual([starterLocationId])
    }, 15000)
})
