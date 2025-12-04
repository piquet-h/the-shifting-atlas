/**
 * Game Page
 *
 * Main game play page wrapping the GameView component.
 * This page is the primary game interface for authenticated users.
 * Redirects unauthenticated users to the homepage.
 * Players always load at their authoritative server-side location.
 *
 * Deep-link support: Accepts ?loc=<locationId> parameter.
 * Note: Location hint feature is a placeholder for future implementation.
 */
import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import GameView from '../components/GameView'
import { usePlayer } from '../contexts/PlayerContext'
import { useAuth } from '../hooks/useAuth'

export default function Game(): React.ReactElement | null {
    const { isAuthenticated, loading } = useAuth()
    const { loading: guidLoading } = usePlayer()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [showLocationInfo, setShowLocationInfo] = useState(false)

    // Extract location parameter from URL if present
    // Currently informational only - will be implemented in future enhancement
    useEffect(() => {
        const loc = searchParams.get('loc')
        if (loc) {
            setShowLocationInfo(true)
            // For now, just acknowledge the parameter exists
            // Future: Pass to GameView for location-specific loading
        }
    }, [searchParams])

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            navigate('/', { replace: true })
        }
    }, [isAuthenticated, loading, navigate])

    // Show loading state while auth check or player GUID resolution is in progress
    if (loading || guidLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100">
                <div className="h-8 w-8 sm:h-10 sm:w-10 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent" />
                <p className="mt-4 text-responsive-sm text-slate-400">Loading game...</p>
            </div>
        )
    }

    // Don't render game content if not authenticated (will redirect)
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100">
                <p className="text-responsive-sm text-slate-400">Redirecting...</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen flex flex-col py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100" aria-labelledby="game-page-title">
            <h1 id="game-page-title" tabIndex={-1} className="sr-only">
                The Shifting Atlas - Game
            </h1>
            {/* Info banner for location deep-link (future enhancement) */}
            {showLocationInfo && (
                <div
                    role="status"
                    className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200"
                    aria-live="polite"
                >
                    <p className="text-sm">Deep-link location support coming soon. Loading your current location.</p>
                </div>
            )}
            <GameView />
        </div>
    )
}
