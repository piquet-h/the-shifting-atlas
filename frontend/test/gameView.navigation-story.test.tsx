import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GameView from '../src/components/GameView'
import { PlayerProvider } from '../src/contexts/PlayerContext'

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
})
