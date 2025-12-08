/**
 * useGamePreferences Hook
 *
 * Manages user preferences for the game interface (e.g., navigation UI visibility).
 * Preferences are persisted to localStorage and survive page refreshes.
 *
 * Usage:
 *   const { navigationUIEnabled, setNavigationUIEnabled } = useGamePreferences()
 *   if (navigationUIEnabled) { <NavigationUI /> }
 */

import { useCallback, useState } from 'react'

const PREF_KEY_NAVIGATION_UI = 'game:navigationUIEnabled'

/**
 * Game preference defaults
 */
export const GAME_PREFERENCE_DEFAULTS = {
    navigationUIEnabled: true
} as const

/**
 * Hook for managing game interface preferences
 * @returns Object with current preferences and setters
 */
export function useGamePreferences() {
    // Initialize from localStorage with fallback to defaults
    const [navigationUIEnabled, setNavigationUIEnabledState] = useState(() => {
        if (typeof window === 'undefined') return GAME_PREFERENCE_DEFAULTS.navigationUIEnabled

        const stored = localStorage.getItem(PREF_KEY_NAVIGATION_UI)
        if (stored === null) return GAME_PREFERENCE_DEFAULTS.navigationUIEnabled
        return stored === 'true'
    })

    const setNavigationUIEnabled = useCallback((enabled: boolean) => {
        setNavigationUIEnabledState(enabled)
        if (typeof window !== 'undefined') {
            localStorage.setItem(PREF_KEY_NAVIGATION_UI, String(enabled))
        }
    }, [])

    return {
        navigationUIEnabled,
        setNavigationUIEnabled
    }
}
