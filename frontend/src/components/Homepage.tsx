/* global localStorage */
import React, { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../contexts/PlayerContext'
import { useAuth } from '../hooks/useAuth'
import { useLinkGuestOnAuth } from '../hooks/useLinkGuestOnAuth'
import { useVisitState } from '../hooks/useVisitState'
import CommandInterface from './CommandInterface'

/** Homepage: new user vs returning user. Accessibility: single <h1>, ordered steps, skip-to-main anchor, focus styles. */
export default function Homepage(): React.ReactElement {
    const { isNewUser, acknowledge } = useVisitState()
    const { loading: guidLoading } = usePlayer()
    const { isAuthenticated, loading, user, signIn } = useAuth()
    const { linking, linked, error: linkError } = useLinkGuestOnAuth()

    // Local toast state for ephemeral welcome notification after auth.
    const [showWelcomeToast, setShowWelcomeToast] = useState(false)
    const [showLinkToast, setShowLinkToast] = useState(false)
    const toastShownRef = useRef(false)

    // On initial sign-in success (user appears) announce for screen readers once.
    useEffect(() => {
        if (!loading && isAuthenticated && !toastShownRef.current) {
            const region = document.getElementById('mode-announcement')
            if (region) region.textContent = `Signed in as ${user?.userDetails || 'explorer'}`
            toastShownRef.current = true
            setShowWelcomeToast(true)
            const timeout = window.setTimeout(() => setShowWelcomeToast(false), 4500)
            return () => window.clearTimeout(timeout)
        }
    }, [loading, isAuthenticated, user?.userDetails])

    // One-time link toast (persists across sessions via localStorage flag)
    useEffect(() => {
        if (linked && !linkError && typeof window !== 'undefined') {
            try {
                const FLAG_KEY = 'tsa.linkedToastShown'
                if (!localStorage.getItem(FLAG_KEY)) {
                    localStorage.setItem(FLAG_KEY, '1')
                    setShowLinkToast(true)
                    const t = window.setTimeout(() => setShowLinkToast(false), 5000)
                    return () => window.clearTimeout(t)
                }
            } catch {
                // ignore storage errors – still show toast once in-memory
                setShowLinkToast(true)
                const t = window.setTimeout(() => setShowLinkToast(false), 5000)
                return () => window.clearTimeout(t)
            }
        }
    }, [linked, linkError])

    return (
        // <main> landmark is global (App.tsx); this only renders content.
        <div
            className="min-h-screen flex flex-col gap-4 sm:gap-5 md:gap-6 py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100"
            aria-labelledby="page-title"
        >
            <h1 id="page-title" tabIndex={-1} className="sr-only">
                The Shifting Atlas
            </h1>

            {/* Loading state (auth call in-flight) */}
            {(loading || guidLoading || linking) && (
                <div role="status" className="flex flex-col items-center gap-4 py-12 sm:py-16">
                    <div className="h-8 w-8 sm:h-10 sm:w-10 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent" />
                    <p className="text-responsive-sm text-slate-400">
                        {linking ? 'Linking your explorer profile...' : 'Preparing your explorer session...'}
                    </p>
                </div>
            )}

            {/* Unauthenticated (treat as new / marketing hero). We still optionally differentiate first visit for analytics copy tone. */}
            {!loading && !guidLoading && !isAuthenticated ? (
                <div className="flex flex-col gap-4 sm:gap-5 md:gap-6 md:grid md:grid-cols-12 md:items-start">
                    <div className="flex flex-col gap-4 sm:gap-5 md:gap-6 md:col-span-8 lg:col-span-8 xl:col-span-9">
                        {/* Hero / Intro */}
                        <section
                            className="card relative overflow-hidden rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 flex flex-col gap-3 sm:gap-4"
                            aria-labelledby="hero-title"
                        >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex-1 max-w-xl">
                                    <h2 id="hero-title" className="text-responsive-2xl font-semibold mb-2 max-w-readable">
                                        A living map that shifts while you sleep.
                                    </h2>
                                    <p className="text-responsive-sm leading-relaxed text-slate-300 max-w-readable">
                                        Discover rooms that weren&apos;t there yesterday, trade with wanderers, and carve your story into a
                                        world that never pauses. Cooperative, asynchronous, always evolving.
                                    </p>
                                    <div className="mt-4 sm:mt-5 flex flex-col sm:flex-row gap-3">
                                        <button
                                            onClick={() => {
                                                if (isNewUser) {
                                                    acknowledge()
                                                }
                                                signIn('msa', '/game')
                                            }}
                                            className="touch-target btn-primary px-4 sm:px-5 py-3 text-responsive-base"
                                        >
                                            {isNewUser ? 'Create Your Explorer' : 'Sign In to Continue'}
                                        </button>
                                        <button className="touch-target px-4 sm:px-5 py-3 rounded-lg border border-white/15 text-slate-200 text-responsive-base hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white focus-visible:ring-offset-atlas-bg">
                                            <a href="/learn-more" className="block">
                                                Learn More
                                            </a>
                                        </button>
                                    </div>
                                    <div id="mode-announcement" className="sr-only" aria-live="polite" />
                                </div>
                                {/* Metrics: not a complementary landmark, so use div */}
                                <div
                                    className="grid grid-cols-3 gap-2 sm:gap-4 text-center text-xs font-medium pt-2 sm:pt-0"
                                    role="group"
                                    aria-label="World metrics preview"
                                >
                                    {/* Placeholder world metrics */}
                                    <div className="flex flex-col rounded-lg bg-white/5 px-2 sm:px-3 py-2">
                                        <span className="text-responsive-base font-semibold text-white">128</span>
                                        <span className="text-slate-400 text-responsive-sm">Rooms</span>
                                    </div>
                                    <div className="flex flex-col rounded-lg bg-white/5 px-2 sm:px-3 py-2">
                                        <span className="text-responsive-base font-semibold text-white">42</span>
                                        <span className="text-slate-400 text-responsive-sm">Players</span>
                                    </div>
                                    <div className="flex flex-col rounded-lg bg-white/5 px-2 sm:px-3 py-2">
                                        <span className="text-responsive-base font-semibold text-white">7</span>
                                        <span className="text-slate-400 text-responsive-sm">Factions</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Quick Start Steps (ordered list for SR context) */}
                        <section aria-labelledby="quick-start-title" className="mt-1 sm:mt-2">
                            <h2 id="quick-start-title" className="text-responsive-sm font-semibold tracking-wide mb-3 sr-only">
                                Quick start steps
                            </h2>
                            <ol className="grid gap-3 sm:gap-4 sm:grid-cols-2 md:grid-cols-3 list-none m-0 p-0">
                                {[
                                    {
                                        label: 'Claim a Starting Room',
                                        body: 'You begin at the Fringe. Each room you explore anchors the map for others until it drifts again.'
                                    },
                                    {
                                        label: 'Gather & Trade',
                                        body: 'Collect curios and lore fragments—trade asynchronously even while players are offline.'
                                    },
                                    {
                                        label: 'Influence the Atlas',
                                        body: 'Trigger world events that reroute passages, unlock factions, and reshape traversal.'
                                    }
                                ].map((item, idx) => (
                                    <li
                                        key={item.label}
                                        className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-white/4 ring-1 ring-white/10 flex flex-col gap-2"
                                    >
                                        <h3 className="text-responsive-sm font-semibold tracking-wide text-white">
                                            <span className="text-atlas-accent mr-1" aria-hidden>
                                                {idx + 1}.
                                            </span>
                                            {item.label}
                                        </h3>
                                        <p className="text-responsive-sm text-slate-300 leading-relaxed">{item.body}</p>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        {/* Secondary Pillars reused */}
                        <section className="grid gap-2 sm:gap-3 sm:grid-cols-2 md:grid-cols-3" aria-label="Game pillars">
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold text-responsive-base">Persistent world</h3>
                                <p className="text-responsive-sm text-atlas-muted">Actions persist through asynchronous world events.</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold text-responsive-base">Player-driven stories</h3>
                                <p className="text-responsive-sm text-slate-400">Choices ripple across the Atlas and alter the map.</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold text-responsive-base">Mobile first</h3>
                                <p className="text-responsive-sm text-slate-400">Designed to work beautifully on phones and scale up.</p>
                            </div>
                        </section>
                        {/* MVP Command Interface (guest can try commands before auth) */}
                        <section aria-labelledby="command-interface-title" className="mt-2 sm:mt-4">
                            <h2 id="command-interface-title" className="text-responsive-sm font-semibold tracking-wide mb-2 sm:mb-3">
                                Try a Command
                            </h2>
                            <CommandInterface />
                        </section>
                    </div>
                    {/* Desktop/Tablet side panel (progressive enhancement) */}
                    <aside className="hidden md:flex md:col-span-4 lg:col-span-4 xl:col-span-3">
                        <div
                            className="card w-full rounded-xl md:rounded-2xl p-4 md:p-5 flex flex-col gap-3 md:gap-4 sticky top-16 md:top-20 max-h-[calc(100vh-5rem)] md:max-h-[calc(100vh-6rem)] overflow-auto"
                            aria-labelledby="world-feed-title"
                        >
                            <h2 id="world-feed-title" className="text-responsive-sm font-semibold tracking-wide">
                                World Activity (Preview)
                            </h2>
                            <ul className="flex flex-col gap-2 md:gap-3 text-responsive-sm text-slate-300">
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-atlas-accent" />
                                    Atlas recalculated 5 rooms.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400" />
                                    New wanderer joined a faction.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-sky-400" />
                                    Hidden passage rumor spreading.
                                </li>
                                <li className="text-responsive-sm uppercase tracking-wide text-slate-300 pt-2">Feed static prototype</li>
                            </ul>
                        </div>
                    </aside>
                </div>
            ) : null}

            {/* Authenticated (returning journey view) */}
            {!loading && !guidLoading && isAuthenticated ? (
                <div className="flex flex-col gap-4 sm:gap-5 md:gap-6 md:grid md:grid-cols-12 md:items-start">
                    <div className="flex flex-col gap-4 sm:gap-5 md:gap-6 md:col-span-8 lg:col-span-8 xl:col-span-9">
                        {/* Welcome back section */}
                        <section className="card relative overflow-hidden rounded-xl sm:rounded-2xl p-4 sm:p-5 md:p-6 flex flex-col gap-3 sm:gap-4">
                            <h2 className="text-responsive-2xl font-semibold max-w-readable">
                                Welcome back, {user?.userDetails?.split(' ')[0] || 'Explorer'}
                            </h2>
                            <p className="text-responsive-sm leading-relaxed text-slate-300 max-w-readable">
                                Your exploration continues. The Atlas has shifted since your last visit.
                            </p>
                            <div className="mt-2">
                                <a href="/game" className="inline-block touch-target btn-primary px-4 sm:px-5 py-3 text-responsive-base">
                                    Enter the Atlas →
                                </a>
                            </div>
                        </section>

                        <section aria-labelledby="auth-command-interface-title" className="mt-2 sm:mt-4">
                            <h2 id="auth-command-interface-title" className="text-responsive-lg font-semibold tracking-wide mb-3 sm:mb-4">
                                Quick Command
                            </h2>
                            <CommandInterface />
                        </section>

                        <section className="grid gap-2 sm:gap-3 sm:grid-cols-2 md:grid-cols-3" aria-label="Game pillars">
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold text-responsive-base">Active events</h3>
                                <p className="text-responsive-sm text-atlas-muted">Dynamic storms reshaping 5 rooms.</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold text-responsive-base">Faction influence</h3>
                                <p className="text-responsive-sm text-slate-400">Cartographers gaining dominance.</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold text-responsive-base">New discoveries</h3>
                                <p className="text-responsive-sm text-slate-400">3 hidden passages found overnight.</p>
                            </div>
                        </section>
                    </div>
                    <aside className="hidden md:flex md:col-span-4 lg:col-span-4 xl:col-span-3">
                        <div
                            className="card w-full rounded-xl md:rounded-2xl p-4 md:p-5 flex flex-col gap-3 md:gap-4 sticky top-16 md:top-20 max-h-[calc(100vh-5rem)] md:max-h-[calc(100vh-6rem)] overflow-auto"
                            aria-labelledby="player-feed-title"
                        >
                            <h2 id="player-feed-title" className="text-responsive-sm font-semibold tracking-wide">
                                Explorer Updates (Preview)
                            </h2>
                            <ul className="flex flex-col gap-2 md:gap-3 text-responsive-sm text-slate-300">
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-atlas-accent" />
                                    Your patrol uncovered a relic fragment.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />
                                    Faction envoy sent a message.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-fuchsia-400" />
                                    Trade offer pending review.
                                </li>
                                <li className="text-responsive-sm uppercase tracking-wide text-slate-300 pt-2">Feed static prototype</li>
                            </ul>
                        </div>
                    </aside>
                </div>
            ) : null}
            <footer className="mt-auto text-center text-slate-400 text-responsive-sm p-3 sm:p-4 md:pt-6 lg:pt-8">
                © The Shifting Atlas — built with love
            </footer>

            {/* Toast viewport (local to page). Promote to global ToastProvider if >2 sources, persistence, variants, queuing, background, or accessibility needs arise. */}
            {(showWelcomeToast || showLinkToast) && (
                <div className="fixed top-2 right-2 sm:top-4 sm:right-4 z-50 flex flex-col gap-2 sm:gap-3 max-w-[calc(100vw-1rem)] sm:max-w-sm">
                    {showWelcomeToast && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="animate-fade-in bg-slate-900/95 backdrop-blur border border-white/10 shadow-xl rounded-lg px-3 sm:px-4 py-2 sm:py-3 flex items-start gap-2 sm:gap-3 text-responsive-sm"
                        >
                            <div className="h-2 w-2 mt-1.5 flex-shrink-0 rounded-full bg-atlas-accent" aria-hidden />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-white">Welcome back</p>
                                <p className="text-slate-300 truncate">
                                    {user?.userDetails?.split(' ')[0] || 'Explorer'}, your session is ready.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowWelcomeToast(false)}
                                className="ml-1 sm:ml-2 touch-target flex items-center justify-center text-slate-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-white rounded"
                                aria-label="Dismiss welcome message"
                            >
                                ×
                            </button>
                        </div>
                    )}
                    {showLinkToast && (
                        <div
                            role="status"
                            aria-live="polite"
                            className="animate-fade-in bg-slate-900/95 backdrop-blur border border-white/10 shadow-xl rounded-lg px-3 sm:px-4 py-2 sm:py-3 flex items-start gap-2 sm:gap-3 text-responsive-sm"
                        >
                            <div className="h-2 w-2 mt-1.5 flex-shrink-0 rounded-full bg-emerald-400" aria-hidden />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium text-white">Profile Linked</p>
                                <p className="text-slate-300">Your guest progress is now linked.</p>
                            </div>
                            <button
                                onClick={() => setShowLinkToast(false)}
                                className="ml-1 sm:ml-2 touch-target flex items-center justify-center text-slate-400 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-white rounded"
                                aria-label="Dismiss linked message"
                            >
                                ×
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
