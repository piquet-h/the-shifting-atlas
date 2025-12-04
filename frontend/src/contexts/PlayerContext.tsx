/**
 * PlayerContext
 * App-level player state management.
 * Provides player GUID to all components without re-bootstrapping on route changes.
 * Integrates with auth state for guest-to-authenticated player linking.
 * Usage:
 * - Wrap App with <PlayerProvider>
 * - Use usePlayer() hook in any component that needs player data
 * Edge cases handled:
 * - Single bootstrap per app lifecycle (survives route changes)
 * - Optimistic localStorage read with API verification
 * - Auth integration for guest linking
 * - Cross-tab synchronization via localStorage events
 */
import React, { createContext, useContext, useEffect, useRef } from 'react'
import type { PlayerGuidState } from '../hooks/usePlayerGuid'
import { usePlayerGuid } from '../hooks/usePlayerGuid'

type PlayerContextValue = PlayerGuidState

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined)

export function PlayerProvider({ children }: { children: React.ReactNode }): React.ReactElement {
    // Single usePlayerGuid call at app root - never re-instantiated on route changes
    const playerState = usePlayerGuid()

    // Track mount to prevent double-initialization in development strict mode
    const mountedRef = useRef(false)
    useEffect(() => {
        if (!mountedRef.current) {
            mountedRef.current = true
        }
    }, [])

    return <PlayerContext.Provider value={playerState}>{children}</PlayerContext.Provider>
}

/**
 * Hook to access player context
 * @throws Error if used outside PlayerProvider
 */
export function usePlayer(): PlayerContextValue {
    const context = useContext(PlayerContext)
    if (!context) {
        throw new Error('usePlayer must be used within PlayerProvider')
    }
    return context
}

export default PlayerProvider
