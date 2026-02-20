import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Nav from '../src/components/Nav'

const mockSignIn = vi.fn()
const mockSignOut = vi.fn()

vi.mock('../src/hooks/useAuth', () => ({
    useAuth: () => ({
        user: null,
        loading: false,
        signOut: mockSignOut,
        signIn: mockSignIn,
        error: null
    })
}))

vi.mock('../src/hooks/usePing', () => ({
    usePing: () => ({
        data: { ok: true },
        loading: false
    })
}))

describe('Nav auth redirect behavior', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('routes sign-in directly to the game homepage', async () => {
        const user = userEvent.setup()

        render(
            <MemoryRouter>
                <Nav />
            </MemoryRouter>
        )

        await user.click(screen.getByText('Sign In with Microsoft'))

        expect(mockSignIn).toHaveBeenCalledWith('msa', '/game')
    })
})
