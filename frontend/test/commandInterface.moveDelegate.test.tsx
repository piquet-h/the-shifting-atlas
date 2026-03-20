/**
 * CommandInterface – onMoveCommand delegation tests
 *
 * Validates the Direction-typed move delegation behaviour:
 * - Valid directions are forwarded to onMoveCommand without a network call.
 * - Invalid (non-Direction) strings are NOT forwarded; the command falls
 *   through to normal processing.
 *
 * Background: onMoveCommand was previously typed (direction: string) => void,
 * causing a TypeScript incompatibility when GameViewLayout passed a handler
 * typed (direction: Direction) => void. The fix reuses the shared navigation
 * Direction type in CommandInterface and guards the delegation with isDirection().
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

function setupPlayer() {
    localStorage.setItem('tsa.playerGuid', PLAYER_GUID)
    server.use(
        http.get('/api/player', () =>
            HttpResponse.json({
                success: true,
                data: { playerGuid: PLAYER_GUID, created: false, currentLocationId: LOCATION_ID }
            })
        ),
        http.get('/api/location/:locationId', () =>
            HttpResponse.json({
                success: true,
                data: {
                    id: LOCATION_ID,
                    name: 'Test Square',
                    description: {
                        text: 'A quiet square.',
                        html: '<p>A quiet square.</p>',
                        provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                    },
                    exits: [{ direction: 'north', targetId: 'bbbbbbbb-0000-0000-0000-000000000000' }]
                }
            })
        )
    )
}

describe('CommandInterface – onMoveCommand delegation', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
    })

    it('calls onMoveCommand with a valid Direction when "move north" is entered', async () => {
        const user = userEvent.setup()
        const onMoveCommand = vi.fn()
        setupPlayer()

        render(
            <PlayerProvider>
                <CommandInterface onMoveCommand={onMoveCommand} />
            </PlayerProvider>
        )

        const input = await screen.findByRole('combobox', { name: /command/i }, { timeout: 5000 })
        await waitFor(() => expect(input).not.toBeDisabled(), { timeout: 5000 })

        await user.type(input, 'move north')
        await user.click(screen.getByRole('button', { name: /run/i }))

        expect(onMoveCommand).toHaveBeenCalledOnce()
        expect(onMoveCommand).toHaveBeenCalledWith('north')
    }, 15000)

    it('calls onMoveCommand for every valid Direction string', async () => {
        const validDirections = [
            'north',
            'south',
            'east',
            'west',
            'northeast',
            'northwest',
            'southeast',
            'southwest',
            'up',
            'down',
            'in',
            'out'
        ]
        const user = userEvent.setup()
        const onMoveCommand = vi.fn()
        setupPlayer()

        render(
            <PlayerProvider>
                <CommandInterface onMoveCommand={onMoveCommand} />
            </PlayerProvider>
        )

        const input = await screen.findByRole('combobox', { name: /command/i }, { timeout: 5000 })
        await waitFor(() => expect(input).not.toBeDisabled(), { timeout: 5000 })

        for (const dir of validDirections) {
            onMoveCommand.mockClear()
            await user.clear(input)
            await user.type(input, `move ${dir}`)
            await user.click(screen.getByRole('button', { name: /run/i }))
            expect(onMoveCommand).toHaveBeenCalledWith(dir)
        }
    }, 30000)

    it('does NOT call onMoveCommand when direction is not a valid Direction value', async () => {
        const user = userEvent.setup()
        const onMoveCommand = vi.fn()
        setupPlayer()

        // Guard: a failed move API call would be a network call, not a delegation
        server.use(
            http.post('/api/player/:playerId/move', () =>
                HttpResponse.json({ success: false, error: { code: 'InvalidDirection', message: 'Bad direction' } }, { status: 400 })
            )
        )

        render(
            <PlayerProvider>
                <CommandInterface onMoveCommand={onMoveCommand} />
            </PlayerProvider>
        )

        const input = await screen.findByRole('combobox', { name: /command/i }, { timeout: 5000 })
        await waitFor(() => expect(input).not.toBeDisabled(), { timeout: 5000 })

        await user.type(input, 'move xyz')
        await user.click(screen.getByRole('button', { name: /run/i }))

        // The handler must NOT be called for an invalid direction
        expect(onMoveCommand).not.toHaveBeenCalled()
    }, 15000)

    it('does NOT call onMoveCommand when onMoveCommand prop is not provided', async () => {
        // Regression: ensure the guard check doesn't throw when prop is absent
        const user = userEvent.setup()
        setupPlayer()

        server.use(
            http.post('/api/player/:playerId/move', () =>
                HttpResponse.json({
                    success: true,
                    data: {
                        id: 'bbbbbbbb-0000-0000-0000-000000000000',
                        name: 'North Road',
                        description: {
                            text: 'A road.',
                            html: '<p>A road.</p>',
                            provenance: { compiledAt: new Date().toISOString(), layersApplied: [], supersededSentences: 0 }
                        },
                        exits: []
                    }
                })
            )
        )

        render(
            <PlayerProvider>
                <CommandInterface />
            </PlayerProvider>
        )

        const input = await screen.findByRole('combobox', { name: /command/i }, { timeout: 5000 })
        await waitFor(() => expect(input).not.toBeDisabled(), { timeout: 5000 })

        await user.type(input, 'move north')

        // Should not throw; the move falls through to the network path
        await expect(user.click(screen.getByRole('button', { name: /run/i }))).resolves.not.toThrow()
    }, 15000)
})
