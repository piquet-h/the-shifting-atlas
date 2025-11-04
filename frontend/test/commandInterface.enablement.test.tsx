import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// Mutable state object used by the mocked hook
const mockState = {
    playerGuid: null as string | null,
    loading: false,
    created: null as boolean | null,
    error: null as string | null
}

// Hoisted mock: always reads latest values from mockState when component renders
vi.mock('../src/hooks/usePlayerGuid', () => ({
    usePlayerGuid: () => ({
        playerGuid: mockState.playerGuid,
        loading: mockState.loading,
        created: mockState.created,
        error: mockState.error,
        refresh: () => {}
    })
}))

// IMPORTANT: Call mockUsePlayerGuid BEFORE importing the component

function extractInput(html: string): string {
    const match = html.match(/<input[^>]*placeholder=\"Enter a command.*?\"[^>]*>/)
    if (!match) throw new Error('Command input element not found')
    return match[0]
}

function isDisabled(html: string): boolean {
    // Match presence of a real disabled attribute (exclude tailwind's disabled: pseudo classes)
    return /\sdisabled(?!:)(=|\s|>)/.test(html)
}

describe('CommandInterface enablement states (SSR)', () => {
    it('disables while GUID loading & absent', async () => {
        mockState.playerGuid = null
        mockState.loading = true
        mockState.error = null
        const Component = (await import('../src/components/CommandInterface')).default
        const markup = renderToString(<Component />)
        expect(isDisabled(extractInput(markup))).toBe(true)
        mockState.loading = false
    })

    it('enables when GUID not yet assigned but not loading and no error', async () => {
        mockState.playerGuid = null
        mockState.loading = false
        mockState.error = null
        const Component = (await import('../src/components/CommandInterface')).default
        const markup = renderToString(<Component />)
        expect(isDisabled(extractInput(markup))).toBe(false)
    })

    it('enables when GUID present and not loading', async () => {
        mockState.playerGuid = '11111111-1111-1111-1111-111111111111'
        mockState.loading = false
        mockState.error = null
        const Component = (await import('../src/components/CommandInterface')).default
        const markup = renderToString(<Component />)
        expect(isDisabled(extractInput(markup))).toBe(false)
    })

    it('disables when GUID creation fails (error present, no GUID)', async () => {
        mockState.playerGuid = null
        mockState.loading = false
        mockState.error = 'Failed to create guest player'
        const Component = (await import('../src/components/CommandInterface')).default
        const markup = renderToString(<Component />)
        expect(isDisabled(extractInput(markup))).toBe(true)
        mockState.error = null
    })

    it('enables when GUID present even if error occurred', async () => {
        mockState.playerGuid = '11111111-1111-1111-1111-111111111111'
        mockState.loading = false
        mockState.error = 'Some error'
        const Component = (await import('../src/components/CommandInterface')).default
        const markup = renderToString(<Component />)
        expect(isDisabled(extractInput(markup))).toBe(false)
        mockState.error = null
    })
})
