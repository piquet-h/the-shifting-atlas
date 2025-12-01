/**
 * Game Page
 *
 * Main game play page wrapping the GameView component.
 * This page is the primary game interface for authenticated users.
 */
import React from 'react'
import GameView from '../components/GameView'

export default function Game(): React.ReactElement {
    return (
        <div className="min-h-screen flex flex-col py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100" aria-labelledby="game-page-title">
            <h1 id="game-page-title" tabIndex={-1} className="sr-only">
                The Shifting Atlas - Game
            </h1>
            <GameView />
        </div>
    )
}
