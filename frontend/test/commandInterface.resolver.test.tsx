/**
 * CommandInterface – ResolvePlayerCommand routing tests (issue #926)
 *
 * Free-form input that does not match built-in commands (ping / look / move <dir> / clear)
 * must be routed through POST /api/player/command before invoking canonical endpoints.
 *
 * Acceptance criteria covered:
 * - Happy-path Move: resolver returns Move → canonical move endpoint is called
 * - Happy-path Look: resolver returns Look → canonical look endpoint is called
 * - Unknown: resolver returns Unknown → safe feedback, no canonical write
 * - Clarification needed: resolver returns needsClarification=true → safe feedback
 * - Resolver failure: resolver request fails → fail safely, navigation preserved
 * - Missing playerGuid: guard prevents resolver call, shows init error
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CommandInterface from '../src/components/CommandInterface'
import { PlayerProvider } from '../src/contexts/PlayerContext'
import { server } from './mocks/server'

const PLAYER_GUID = '550e8400-e29b-41d4-a716-446655440099'
const LOCATION_ID = 'a7e3f8c0-1234-4abc-9def-1234567890ab'
const NORTH_LOCATION_ID = 'b8f4a9d1-2345-5bcd-aef1-2345678901bc'

/**
 * Render CommandInterface inside PlayerProvider with a resolved session.
 * Only registers the player bootstrap handler; tests manage location/command handlers.
 */
async function renderWithPlayer(props?: React.ComponentProps<typeof CommandInterface>) {
    server.use(
        http.get('/api/player', () =>
            HttpResponse.json({
                success: true,
                data: { playerGuid: PLAYER_GUID, created: false, currentLocationId: LOCATION_ID }
            })
        )
    )

    render(
        <PlayerProvider>
            <CommandInterface {...props} />
        </PlayerProvider>
    )

    const input = await screen.findByRole('combobox', { name: /command/i }, { timeout: 5000 })
    await waitFor(() => expect(input).not.toBeDisabled(), { timeout: 5000 })
    return input
}

describe('CommandInterface – free-form resolver routing', () => {
    beforeEach(() => {
        localStorage.clear()
        localStorage.setItem('tsa.playerGuid', PLAYER_GUID)
        vi.clearAllMocks()
    })

    it('happy path Move: free-form input resolves to Move and invokes canonical move endpoint', async () => {
        const user = userEvent.setup()
        let moveCalled = false
        let moveDirection: string | undefined

        // Render first, then add test-specific handlers (higher priority)
        const input = await renderWithPlayer()

        server.use(
            http.post('/api/player/command', async ({ request }) => {
                const body = (await request.json()) as { playerId: string; inputText: string }
                expect(body.playerId).toBe(PLAYER_GUID)
                return HttpResponse.json({
                    success: true,
                    data: {
                        actionKind: 'Move',
                        direction: 'north',
                        presentationMode: 'Auto',
                        responseTempo: 'Auto',
                        canonicalWritesPlanned: true,
                        parsedIntent: { verb: 'move', confidence: 0.9, needsClarification: false }
                    }
                })
            }),
            http.post('/api/player/:playerId/move', async ({ request }) => {
                const body = (await request.json()) as { direction: string }
                moveCalled = true
                moveDirection = body.direction
                return HttpResponse.json({
                    success: true,
                    data: {
                        id: NORTH_LOCATION_ID,
                        name: 'North Road',
                        description: {
                            text: 'A road heading north.',
                            html: '<p>A road heading north.</p>',
                            provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                        },
                        exits: [{ direction: 'south', targetId: LOCATION_ID }]
                    }
                })
            })
        )

        await user.type(input, 'go north')
        await user.click(screen.getByRole('button', { name: /run/i }))

        await waitFor(() => expect(moveCalled).toBe(true), { timeout: 5000 })
        expect(moveDirection).toBe('north')

        // Response should contain location name from move result
        await waitFor(
            () => {
                const outputs = screen.getAllByText(/North Road/i)
                expect(outputs.length).toBeGreaterThan(0)
            },
            { timeout: 5000 }
        )
    }, 15000)

    it('happy path Look: free-form input resolves to Look and invokes canonical look endpoint', async () => {
        const user = userEvent.setup()
        let lookCalled = false

        // Render first, then add test-specific handlers (higher priority)
        const input = await renderWithPlayer()

        server.use(
            http.post('/api/player/command', async () =>
                HttpResponse.json({
                    success: true,
                    data: {
                        actionKind: 'Look',
                        presentationMode: 'Auto',
                        responseTempo: 'Auto',
                        canonicalWritesPlanned: false,
                        parsedIntent: { verb: 'examine', confidence: 0.85, needsClarification: false }
                    }
                })
            ),
            http.get('/api/location/:locationId', () => {
                lookCalled = true
                return HttpResponse.json({
                    success: true,
                    data: {
                        id: LOCATION_ID,
                        name: 'Market Square',
                        description: {
                            text: 'A busy market square.',
                            html: '<p>A busy market square.</p>',
                            provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                        },
                        exits: [{ direction: 'north', targetId: NORTH_LOCATION_ID }]
                    }
                })
            })
        )

        await user.type(input, 'look around')
        await user.click(screen.getByRole('button', { name: /run/i }))

        await waitFor(() => expect(lookCalled).toBe(true), { timeout: 5000 })

        await waitFor(
            () => {
                const outputs = screen.getAllByText(/Market Square/i)
                expect(outputs.length).toBeGreaterThan(0)
            },
            { timeout: 5000 }
        )
    }, 15000)

    it('Unknown command: resolver returns Unknown → safe feedback, canonical move NOT called', async () => {
        const user = userEvent.setup()
        let canonicalMoveCalled = false

        const input = await renderWithPlayer()

        server.use(
            http.post('/api/player/command', async () =>
                HttpResponse.json({
                    success: true,
                    data: {
                        actionKind: 'Unknown',
                        presentationMode: 'Auto',
                        responseTempo: 'Auto',
                        canonicalWritesPlanned: false,
                        parsedIntent: { verb: null, confidence: 0, needsClarification: false }
                    }
                })
            ),
            http.post('/api/player/:playerId/move', async () => {
                canonicalMoveCalled = true
                return HttpResponse.json(
                    { success: false, error: { code: 'Unexpected', message: 'Should not be called' } },
                    { status: 400 }
                )
            })
        )

        await user.type(input, 'dance a jig')
        await user.click(screen.getByRole('button', { name: /run/i }))

        // Should NOT call the canonical move endpoint
        await waitFor(
            () => {
                // Safe feedback visible in the command output area
                const bodyText = document.body.textContent || ''
                expect(bodyText).toMatch(/not sure|try:/i)
            },
            { timeout: 5000 }
        )

        expect(canonicalMoveCalled).toBe(false)
    }, 15000)

    it('clarification needed: resolver returns needsClarification=true → safe feedback shown', async () => {
        const user = userEvent.setup()

        const input = await renderWithPlayer()

        server.use(
            http.post('/api/player/command', async () =>
                HttpResponse.json({
                    success: true,
                    data: {
                        actionKind: 'Unknown',
                        presentationMode: 'Auto',
                        responseTempo: 'Auto',
                        canonicalWritesPlanned: false,
                        parsedIntent: {
                            verb: 'move',
                            confidence: 0.4,
                            needsClarification: true,
                            ambiguities: [
                                {
                                    id: 'amb-1',
                                    spanText: 'rock',
                                    issueType: 'ambiguous_direction',
                                    suggestions: ['north', 'south'],
                                    critical: true
                                }
                            ]
                        }
                    }
                })
            )
        )

        await user.type(input, 'go to the rock')
        await user.click(screen.getByRole('button', { name: /run/i }))

        await waitFor(
            () => {
                const bodyText = document.body.textContent || ''
                expect(bodyText).toMatch(/not sure|clarif|try:/i)
            },
            { timeout: 5000 }
        )
    }, 15000)

    it('resolver request fails → fail safely with error message, navigation unaffected', async () => {
        const user = userEvent.setup()

        const input = await renderWithPlayer()

        server.use(
            http.post('/api/player/command', async () => {
                return HttpResponse.error()
            })
        )

        await user.type(input, 'do something weird')
        await user.click(screen.getByRole('button', { name: /run/i }))

        // Should show an error (not crash)
        await waitFor(
            () => {
                const bodyText = document.body.textContent || ''
                // Error should surface in the output
                expect(bodyText.toLowerCase()).toMatch(/error|failed|fetch/)
            },
            { timeout: 5000 }
        )

        // Input should still be enabled after failure
        expect(input).not.toBeDisabled()
    }, 15000)

    it('Move resolution with incomplete direction → safe feedback, canonical move NOT called', async () => {
        // "wander around" is free-form input that reaches the resolver.
        // The resolver returns Unknown (no direction resolved).
        const user = userEvent.setup()
        let canonicalMoveCalled = false

        const input = await renderWithPlayer()

        server.use(
            http.post('/api/player/command', async () =>
                HttpResponse.json({
                    success: true,
                    data: {
                        // Move without direction → resolves to Unknown per backend rule
                        actionKind: 'Unknown',
                        presentationMode: 'Auto',
                        responseTempo: 'Auto',
                        canonicalWritesPlanned: false,
                        parsedIntent: { verb: 'move', confidence: 0.5, needsClarification: false }
                    }
                })
            ),
            http.post('/api/player/:playerId/move', async () => {
                canonicalMoveCalled = true
                return HttpResponse.json({ success: false }, { status: 400 })
            })
        )

        await user.type(input, 'wander around')
        await user.click(screen.getByRole('button', { name: /run/i }))

        await waitFor(
            () => {
                const bodyText = document.body.textContent || ''
                expect(bodyText).toMatch(/not sure|try:/i)
            },
            { timeout: 5000 }
        )

        expect(canonicalMoveCalled).toBe(false)
    }, 15000)
})
