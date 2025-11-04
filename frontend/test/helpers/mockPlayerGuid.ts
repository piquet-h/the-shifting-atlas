import { vi } from 'vitest'

interface MockGuidState {
    playerGuid?: string | null
    loading?: boolean
    created?: boolean | null
    error?: string | null
}

/**
 * mockUsePlayerGuid
 * Provides a reusable way to set the return value of usePlayerGuid BEFORE importing components.
 * Must be called at top-level (hoisted) in a test file prior to dynamic import of the component.
 */
export function mockUsePlayerGuid(state: MockGuidState = {}): void {
    const { playerGuid = null, loading = false, created = null, error = null } = state
    vi.mock('../../src/hooks/usePlayerGuid', () => ({
        usePlayerGuid: () => ({
            playerGuid,
            loading,
            created,
            error,
            refresh: () => {}
        })
    }))
}

/**
 * resetUsePlayerGuidMock
 * Clears module mocks between test files if needed.
 */
export function resetUsePlayerGuidMock(): void {
    vi.resetModules()
    vi.clearAllMocks()
}
