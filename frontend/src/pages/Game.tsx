/**
 * Deep-link support: accepts `?loc=<locationId>`.
 * This is intentionally a placeholder until location-hint behavior is implemented.
 */
import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import GameView from '../components/GameView'
import StatusPanel from '../components/StatusPanel'
import { usePlayer } from '../contexts/PlayerContext'
import { useAuth } from '../hooks/useAuth'
import { usePlayerLocation } from '../hooks/usePlayerLocation'

// Placeholder health/inventory values (until real backend integration)
const PLACEHOLDER_HEALTH = 100
const PLACEHOLDER_MAX_HEALTH = 100
const PLACEHOLDER_INVENTORY_COUNT = 0

export default function Game(): React.ReactElement | null {
    const { isAuthenticated, loading } = useAuth()
    const { loading: guidLoading, currentLocationId } = usePlayer()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [showLocationInfo, setShowLocationInfo] = useState(false)

    const { location } = usePlayerLocation(currentLocationId)

    useEffect(() => {
        const loc = searchParams.get('loc')
        if (loc) {
            setShowLocationInfo(true)
        }
    }, [searchParams])

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            navigate('/', { replace: true })
        }
    }, [isAuthenticated, loading, navigate])

    if (loading || guidLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100">
                <div className="h-8 w-8 sm:h-10 sm:w-10 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent" />
                <p className="mt-4 text-responsive-sm text-slate-400">Loading game...</p>
            </div>
        )
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100">
                <p className="text-responsive-sm text-slate-400">Redirecting...</p>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100" aria-labelledby="game-page-title">
            <h1 id="game-page-title" tabIndex={-1} className="sr-only">
                The Shifting Atlas - Game
            </h1>
            {showLocationInfo && (
                <div
                    role="status"
                    className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-200"
                    aria-live="polite"
                >
                    <p className="text-sm">Deep-link location support coming soon. Loading your current location.</p>
                </div>
            )}
            {location && (
                <StatusPanel
                    health={PLACEHOLDER_HEALTH}
                    maxHealth={PLACEHOLDER_MAX_HEALTH}
                    locationName={location.name}
                    inventoryCount={PLACEHOLDER_INVENTORY_COUNT}
                />
            )}
            <GameView />
        </div>
    )
}
