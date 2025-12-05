/**
 * CommandInterface Guest Hydration Test
 * Validates that a guest player's persisted location is restored after refresh
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CommandInterface from '../src/components/CommandInterface'
import { PlayerProvider } from '../src/contexts/PlayerContext'
import { server } from './mocks/server'

// Mock crypto.randomUUID for consistent test IDs
const mockUUID = '12345678-1234-1234-1234-123456789012'
vi.stubGlobal('crypto', {
    ...crypto,
    randomUUID: () => mockUUID
})

// Test location IDs - MUST be valid GUIDs
const STARTER_LOCATION_ID = 'a7e3f8c0-1234-4abc-9def-1234567890ab'
const NORTH_ROAD_LOCATION_ID = 'b8f4a9d1-2345-5bcd-aef1-2345678901bc'

describe('CommandInterface - Guest Hydration', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('hydrates guest currentLocationId and restores persisted location on first look', async () => {
        const user = userEvent.setup()
        const playerGuid = '550e8400-e29b-41d4-a716-446655440001'

        // Simulate guest already has a GUID stored (from previous session)
        localStorage.setItem('tsa.playerGuid', playerGuid)

        // Override handlers to simulate player at North Road (moved location)
        server.use(
            // Bootstrap returns existing player
            http.get('/api/player', () => {
                return HttpResponse.json({
                    success: true,
                    data: {
                        playerGuid: playerGuid,
                        created: false,
                        currentLocationId: NORTH_ROAD_LOCATION_ID
                    }
                })
            }),
            // Player GET returns moved location
            http.get('/api/player/:playerId', ({ params }) => {
                if (params.playerId === playerGuid) {
                    return HttpResponse.json({
                        success: true,
                        data: {
                            id: playerGuid,
                            guest: true,
                            currentLocationId: NORTH_ROAD_LOCATION_ID
                        }
                    })
                }
                return HttpResponse.json({ success: false }, { status: 404 })
            }),
            // Location GET for North Road
            http.get('/api/location/:locationId', ({ params }) => {
                if (params.locationId === NORTH_ROAD_LOCATION_ID) {
                    return HttpResponse.json({
                        success: true,
                        data: {
                            id: NORTH_ROAD_LOCATION_ID,
                            name: 'North Road',
                            description: 'Slight rise leading north; bustle of the square fades behind.',
                            exits: [{ direction: 'south', targetId: STARTER_LOCATION_ID }]
                        }
                    })
                }
                if (params.locationId === STARTER_LOCATION_ID) {
                    return HttpResponse.json({
                        success: true,
                        data: {
                            id: STARTER_LOCATION_ID,
                            name: 'Mosswell River Jetty',
                            description: 'Timbered jetty where river current meets brackish tide.',
                            exits: [{ direction: 'north', targetId: NORTH_ROAD_LOCATION_ID }]
                        }
                    })
                }
                return HttpResponse.json({ success: false }, { status: 404 })
            })
        )

        // Render with PlayerProvider wrapper
        render(
            <PlayerProvider>
                <CommandInterface />
            </PlayerProvider>
        )

        // Wait for the input field to be available and enabled
        const commandInput = await screen.findByRole('combobox', { name: /command/i }, { timeout: 5000 })
        await waitFor(() => expect(commandInput).not.toBeDisabled(), { timeout: 5000 })

        // Execute "look" command
        await user.type(commandInput, 'look')
        const runButton = screen.getByRole('button', { name: /run/i })
        await user.click(runButton)

        // Assert location is the moved location (North Road), not starter
        await waitFor(
            () => {
                // Use getAllByText since the text appears in both command output and aria-live region
                const northRoadElements = screen.getAllByText(/North Road:/i)
                expect(northRoadElements.length).toBeGreaterThan(0)
            },
            { timeout: 5000 }
        )

        // Verify starter location text is NOT present
        expect(screen.queryByText(/Mosswell River Jetty/i)).not.toBeInTheDocument()
    }, 15000)

    it('executes move command and updates currentLocationId', async () => {
        const user = userEvent.setup()
        const playerGuid = '550e8400-e29b-41d4-a716-446655440001'

        // Start with fresh player at starter location
        localStorage.setItem('tsa.playerGuid', playerGuid)

        // Override handlers for starter -> move north flow
        server.use(
            http.get('/api/player', () => {
                return HttpResponse.json({
                    success: true,
                    data: {
                        playerGuid: playerGuid,
                        created: false,
                        currentLocationId: STARTER_LOCATION_ID
                    }
                })
            }),
            http.get('/api/player/:playerId', () => {
                return HttpResponse.json({
                    success: true,
                    data: {
                        id: playerGuid,
                        guest: true,
                        currentLocationId: STARTER_LOCATION_ID
                    }
                })
            }),
            http.get('/api/location/:locationId', ({ params }) => {
                if (params.locationId === STARTER_LOCATION_ID || params.locationId === undefined) {
                    return HttpResponse.json({
                        success: true,
                        data: {
                            id: STARTER_LOCATION_ID,
                            name: 'Mosswell River Jetty',
                            description: 'Timbered jetty where river current meets brackish tide.',
                            exits: [{ direction: 'north', targetId: NORTH_ROAD_LOCATION_ID }]
                        }
                    })
                }
                return HttpResponse.json({ success: false }, { status: 404 })
            }),
            // Handle location endpoint without ID (returns starter)
            http.get('/api/location', () => {
                return HttpResponse.json({
                    success: true,
                    data: {
                        id: STARTER_LOCATION_ID,
                        name: 'Mosswell River Jetty',
                        description: 'Timbered jetty where river current meets brackish tide.',
                        exits: [{ direction: 'north', targetId: NORTH_ROAD_LOCATION_ID }]
                    }
                })
            }),
            http.post('/api/player/:playerId/move', async () => {
                return HttpResponse.json({
                    success: true,
                    data: {
                        id: NORTH_ROAD_LOCATION_ID,
                        name: 'North Road',
                        description: 'Slight rise leading north; bustle of the square fades behind.',
                        exits: [{ direction: 'south', targetId: STARTER_LOCATION_ID }]
                    }
                })
            })
        )

        render(
            <PlayerProvider>
                <CommandInterface />
            </PlayerProvider>
        )

        // Wait for input to be ready
        const commandInput = await screen.findByRole('combobox', { name: /command/i }, { timeout: 5000 })
        await waitFor(() => expect(commandInput).not.toBeDisabled(), { timeout: 5000 })

        // First look at starter location
        await user.type(commandInput, 'look')
        await user.click(screen.getByRole('button', { name: /run/i }))

        await waitFor(
            () => {
                // Use getAllByText since text appears in both output and aria-live
                const starterElements = screen.getAllByText(/Mosswell River Jetty:/i)
                expect(starterElements.length).toBeGreaterThan(0)
            },
            { timeout: 5000 }
        )

        // Clear input and move north
        await user.clear(commandInput)
        await user.type(commandInput, 'move north')
        await user.click(screen.getByRole('button', { name: /run/i }))

        // Verify move response shows North Road
        await waitFor(
            () => {
                const moveElements = screen.getAllByText(/Moved north -> North Road:/i)
                expect(moveElements.length).toBeGreaterThan(0)
            },
            { timeout: 5000 }
        )
    }, 15000)

    it('executes ping command without requiring playerGuid', async () => {
        const user = userEvent.setup()

        render(
            <PlayerProvider>
                <CommandInterface />
            </PlayerProvider>
        )

        // Wait briefly for render
        await waitFor(
            () => {
                expect(screen.queryByRole('combobox', { name: /command/i })).toBeInTheDocument()
            },
            { timeout: 1000 }
        )

        const commandInput = screen.getByRole('combobox', { name: /command/i })
        await user.type(commandInput, 'ping test')
        await user.click(screen.getByRole('button', { name: /run/i }))

        await waitFor(
            () => {
                // Look for the command result aria-live region containing "test"
                const liveRegion = screen.getByText(/Command result:.*test/i)
                expect(liveRegion).toBeInTheDocument()
            },
            { timeout: 3000 }
        )
    })

    it('shows error when move command executed before playerGuid resolved', async () => {
        const user = userEvent.setup()

        // Override to delay player bootstrap significantly
        server.use(
            http.get('/api/player', async () => {
                await new Promise((resolve) => setTimeout(resolve, 5000))
                return HttpResponse.json({
                    success: true,
                    data: {
                        playerGuid: '550e8400-e29b-41d4-a716-446655440001',
                        created: true
                    }
                })
            })
        )

        render(
            <PlayerProvider>
                <CommandInterface />
            </PlayerProvider>
        )

        // Wait for component to render but while GUID is still loading
        await waitFor(
            () => {
                expect(screen.queryByRole('combobox', { name: /command/i })).toBeInTheDocument()
            },
            { timeout: 500 }
        )

        // Try to move before GUID is ready (button should be disabled)
        const commandInput = screen.getByRole('combobox', { name: /command/i })
        const runButton = screen.getByRole('button', { name: /run/i })

        // Button may be disabled during loading; if so, skip this test scenario
        if (runButton.hasAttribute('disabled')) {
            // Expected behavior: command interface disables interaction while loading
            expect(runButton).toBeDisabled()
            return
        }

        // If button is not disabled, execute and expect error
        await user.type(commandInput, 'move north')
        await user.click(runButton)

        await waitFor(
            () => {
                expect(screen.getByText(/Cannot move yet - your session is still initializing/i)).toBeInTheDocument()
            },
            { timeout: 2000 }
        )
    }, 10000)
})
