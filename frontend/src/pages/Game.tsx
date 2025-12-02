/**
 * Game Page
 *
 * Main game play page wrapping the GameView component.
 * This page is the primary game interface for authenticated users.
 * Redirects unauthenticated users to the homepage.
 */
import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import GameView from '../components/GameView'
import { useAuth } from '../hooks/useAuth'

export default function Game(): React.ReactElement | null {
    const { isAuthenticated, loading } = useAuth()
    const navigate = useNavigate()

    useEffect(() => {
        if (!loading && !isAuthenticated) {
            navigate('/', { replace: true })
        }
    }, [isAuthenticated, loading, navigate])

    // Show loading state while auth check is in progress
    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100">
                <div className="h-8 w-8 sm:h-10 sm:w-10 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent" />
                <p className="mt-4 text-responsive-sm text-slate-400">Loading game...</p>
            </div>
        )
    }

    // Don't render game content if not authenticated (will redirect)
    if (!isAuthenticated) {
        return null
    }

    return (
        <div className="min-h-screen flex flex-col py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100" aria-labelledby="game-page-title">
            <h1 id="game-page-title" tabIndex={-1} className="sr-only">
                The Shifting Atlas - Game
            </h1>
            <GameView />
        </div>
    )
}
