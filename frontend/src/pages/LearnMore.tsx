/**
 * Learn More Page
 *
 * Informational page about The Shifting Atlas.
 * Provides details about gameplay, features, and how to get started.
 */
import React from 'react'

export default function LearnMore(): React.ReactElement {
    return (
        <div className="min-h-screen p-5 text-slate-100 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark">
            <h1 className="text-2xl font-semibold" tabIndex={-1}>
                Learn More About The Shifting Atlas
            </h1>

            <div className="mt-6 flex flex-col gap-6 max-w-3xl">
                {/* Overview */}
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-3">What is The Shifting Atlas?</h2>
                    <p className="text-slate-300 leading-relaxed">
                        The Shifting Atlas is a living, persistent text-based world where locations shift, evolve, and respond to player
                        actions. Explore a dynamic map that changes while you sleep, discover hidden passages, interact with wandering NPCs,
                        and influence the world through your choices.
                    </p>
                </section>

                {/* Core Features */}
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-3">Core Features</h2>
                    <ul className="space-y-3 text-slate-300">
                        <li className="flex items-start gap-2">
                            <span className="text-atlas-accent mt-1">•</span>
                            <div>
                                <strong className="text-white">Dynamic World:</strong> Locations transform and shift based on time and
                                player actions.
                            </div>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-atlas-accent mt-1">•</span>
                            <div>
                                <strong className="text-white">Asynchronous Gameplay:</strong> The world evolves even when you&apos;re
                                offline.
                            </div>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-atlas-accent mt-1">•</span>
                            <div>
                                <strong className="text-white">Persistent Impact:</strong> Your decisions leave lasting marks on the Atlas.
                            </div>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="text-atlas-accent mt-1">•</span>
                            <div>
                                <strong className="text-white">Exploration:</strong> Discover hidden passages, secret rooms, and emergent
                                narratives.
                            </div>
                        </li>
                    </ul>
                </section>

                {/* How to Play */}
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-3">How to Play</h2>
                    <ol className="space-y-3 text-slate-300 list-decimal list-inside">
                        <li>
                            <strong className="text-white">Create Your Explorer:</strong> Sign in to claim your starting location.
                        </li>
                        <li>
                            <strong className="text-white">Navigate the Atlas:</strong> Use directional commands (north, south, east, west)
                            to explore.
                        </li>
                        <li>
                            <strong className="text-white">Interact:</strong> Examine objects, talk to NPCs, and discover lore.
                        </li>
                        <li>
                            <strong className="text-white">Influence:</strong> Your actions contribute to world events and shape the Atlas.
                        </li>
                    </ol>
                </section>

                {/* Getting Started */}
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-3">Getting Started</h2>
                    <p className="text-slate-300 leading-relaxed mb-4">
                        Ready to begin your journey? Sign in to create your explorer and enter the Atlas.
                    </p>
                    <a
                        href="/"
                        className="inline-block touch-target px-4 py-2 rounded-lg font-semibold text-responsive-base bg-gradient-to-r from-atlas-accent to-green-400 text-emerald-900 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white focus-visible:ring-offset-atlas-bg"
                    >
                        Get Started →
                    </a>
                </section>

                {/* Technical Details */}
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-3">About This Project</h2>
                    <p className="text-slate-300 leading-relaxed">
                        The Shifting Atlas is built on Azure Functions, Cosmos DB, and Azure Static Web Apps. It demonstrates asynchronous
                        world simulation, event-driven architecture, and AI-assisted narrative generation.
                    </p>
                </section>
            </div>
        </div>
    )
}
