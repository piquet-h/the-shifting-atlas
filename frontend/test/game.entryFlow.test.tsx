import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Game from '../src/pages/Game'

const mockSignIn = vi.fn()

const authState = {
    isAuthenticated: false,
    loading: false
}

vi.mock('../src/hooks/useAuth', () => ({
    useAuth: () => ({
        isAuthenticated: authState.isAuthenticated,
        loading: authState.loading,
        signIn: mockSignIn
    })
}))

vi.mock('../src/contexts/PlayerContext', () => ({
    usePlayer: () => ({
        loading: false,
        currentLocationId: 'a7e3f8c0-1234-4abc-9def-1234567890ab'
    })
}))

vi.mock('../src/hooks/usePlayerLocation', () => ({
    usePlayerLocation: () => ({
        location: {
            id: 'a7e3f8c0-1234-4abc-9def-1234567890ab',
            name: 'Mosswell River Jetty',
            description: {
                text: 'Timbered jetty where river current meets brackish tide.',
                html: '<p>Timbered jetty where river current meets brackish tide.</p>',
                provenance: {
                    compiledAt: new Date().toISOString(),
                    layersApplied: [],
                    supersededSentences: 0
                }
            },
            exits: []
        }
    })
}))

vi.mock('../src/components/GameView', () => ({
    default: () => <div>Game View Loaded</div>
}))

describe('Game page entry flow', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        authState.isAuthenticated = false
        authState.loading = false
    })

    it('initiates sign in from /game when unauthenticated and preserves /game return path', async () => {
        render(
            <MemoryRouter initialEntries={['/game']}>
                <Routes>
                    <Route path="/game" element={<Game />} />
                </Routes>
            </MemoryRouter>
        )

        await waitFor(() => {
            expect(mockSignIn).toHaveBeenCalledWith('msa', '/game')
        })
    })

    it('renders the game view when already authenticated', async () => {
        authState.isAuthenticated = true

        render(
            <MemoryRouter initialEntries={['/game']}>
                <Routes>
                    <Route path="/game" element={<Game />} />
                </Routes>
            </MemoryRouter>
        )

        expect(mockSignIn).not.toHaveBeenCalled()
        expect(await screen.findByText('Game View Loaded')).toBeInTheDocument()
    })
})
