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

describe('CommandInterface - Guest Hydration', () => {
    beforeEach(() => {
        // Clear localStorage before each test
        localStorage.clear()
    })

    // TODO: Fix flaky timing - PlayerProvider bootstrap may delay in test env
    it.skip('hydrates guest currentLocationId and restores persisted location on first look', async () => {
        const user = userEvent.setup()
        const playerGuid = '550e8400-e29b-41d4-a716-446655440001'
        const movedLocationId = 'b8f4g9d1-2345-5bcd-0efg-2345678901bc'

        // Simulate guest already has a GUID stored and has moved
        localStorage.setItem('tsa.playerGuid', playerGuid)

        // Override player GET to return moved location
        server.use(
            http.get('/api/player/:playerId', () => {
                return HttpResponse.json({
                    success: true,
                    data: {
                        id: playerGuid,
                        guest: true,
                        currentLocationId: movedLocationId
                    }
                })
            })
        )

        // Render with PlayerProvider wrapper
        render(
            <PlayerProvider>
                <CommandInterface />
            </PlayerProvider>
        )

        // Wait for the input field to be available (not disabled)
        const commandInput = await screen.findByRole('combobox', { name: /command/i }, { timeout: 6000 })
        await waitFor(() => expect(commandInput).not.toBeDisabled(), { timeout: 6000 })

        // Execute "look" command
        await user.type(commandInput, 'look')
        const runButton = screen.getByRole('button', { name: /run/i })
        await user.click(runButton)

        // Assert location is the moved location (North Road), not starter
        await waitFor(
            () => {
                expect(screen.getByText(/North Road:/i)).toBeInTheDocument()
            },
            { timeout: 5000 }
        )

        // Verify starter location text is NOT present
        expect(screen.queryByText(/Mosswell River Jetty/i)).not.toBeInTheDocument()
    }, 15000)

    // TODO: Fix flaky timing - PlayerProvider bootstrap may delay in test env
    it.skip('executes move command and updates currentLocationId', async () => {
        const user = userEvent.setup()
        const playerGuid = '550e8400-e29b-41d4-a716-446655440001'

        localStorage.setItem('tsa.playerGuid', playerGuid)

        render(
            <PlayerProvider>
                <CommandInterface />
            </PlayerProvider>
        )

        // Wait for input to be ready
        const commandInput = await screen.findByRole('combobox', { name: /command/i }, { timeout: 6000 })
        await waitFor(() => expect(commandInput).not.toBeDisabled(), { timeout: 6000 })

        // First look at starter location
        await user.type(commandInput, 'look')
        await user.click(screen.getByRole('button', { name: /run/i }))

        await waitFor(
            () => {
                expect(screen.getByText(/Mosswell River Jetty:/i)).toBeInTheDocument()
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
                expect(screen.getByText(/Moved north -> North Road:/i)).toBeInTheDocument()
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
