import React, {useEffect} from 'react'
import {useAuth} from '../hooks/useAuth'
import {useLinkGuestOnAuth} from '../hooks/useLinkGuestOnAuth'
import {usePlayerGuid} from '../hooks/usePlayerGuid'
import {useVisitState} from '../hooks/useVisitState'
import CommandInterface from './CommandInterface'

/**
 * Homepage
 * Implements two presentation modes: new user vs returning user.
 * The design for new users is derived from `homepage-newUser.png` (assumptions documented below)
 * Assumptions (due to static image & early MVP):
 *  - New user sees: Hero intro, 3-step quick start, world preview stats, primary CTA (Create Your Explorer)
 *  - Returning user sees current (original) layout with pillars + Play Now CTA
 *  - We do not yet have real user auth; placeholder detection uses localStorage flag `tsa.hasVisited`
 *  - When user clicks primary CTA we set that flag so subsequent loads show returning layout
 *  - Future integration: replace local flag with identity service once Azure AD / custom auth lands
 * Accessibility goals:
 *  - Maintain single <h1> for page context
 *  - Use ordered list for steps, each with short imperative label
 *  - Provide skip-to-main anchor already present in shell
 *  - Ensure CTAs have discernible text & focus styles (Tailwind utilities)
 *  - Removed visual duplicate heading/nav cluster (nav already includes branding). h1 kept as sr-only to avoid repetition.
 */

// Logo moved to dedicated component `Logo.tsx` for reuse.

export default function Homepage(): React.ReactElement {
    const {isNewUser} = useVisitState() // still used as a lightweight heuristic for first visit pre‑auth
    const {playerGuid, loading: guidLoading} = usePlayerGuid()
    const {isAuthenticated, loading, user, signIn} = useAuth()
    const {linking, linked, error: linkError} = useLinkGuestOnAuth()

    // On initial sign-in success (user appears) announce for screen readers once.
    useEffect(() => {
        if (!loading && isAuthenticated) {
            const region = document.getElementById('mode-announcement')
            if (region) {
                region.textContent = `Signed in as ${user?.userDetails || 'explorer'}`
            }
        }
    }, [loading, isAuthenticated, user?.userDetails])

    return (
        // NOTE: The <main> landmark is now provided by App.tsx. This component only renders content.
        <div className="min-h-screen flex flex-col gap-6 py-6 lg:py-8 text-slate-100" aria-labelledby="page-title">
            <h1 id="page-title" tabIndex={-1} className="sr-only">
                The Shifting Atlas
            </h1>

            {/* Loading state (auth call in-flight) */}
            {(loading || guidLoading || linking) && (
                <div role="status" className="flex flex-col items-center gap-4 py-16">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent" />
                    <p className="text-sm text-slate-400">
                        {linking ? 'Linking your explorer profile...' : 'Preparing your explorer session...'}
                    </p>
                </div>
            )}

            {/* Unauthenticated (treat as new / marketing hero). We still optionally differentiate first visit for analytics copy tone. */}
            {!loading && !guidLoading && !isAuthenticated ? (
                <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
                    <div className="flex flex-col gap-6 lg:col-span-8 xl:col-span-9">
                        {/* Hero / Intro */}
                        <section
                            className="relative overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10 p-6 flex flex-col gap-4"
                            aria-labelledby="hero-title"
                        >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="flex-1 max-w-xl">
                                    <h2 id="hero-title" className="text-2xl font-semibold mb-2">
                                        A living map that shifts while you sleep.
                                    </h2>
                                    <p className="text-sm leading-relaxed text-slate-300">
                                        Discover rooms that weren&apos;t there yesterday, trade with wanderers, and carve your story into a
                                        world that never pauses. Cooperative, asynchronous, always evolving.
                                    </p>
                                    <div className="mt-5 flex flex-col sm:flex-row gap-3">
                                        <button
                                            onClick={() => signIn('msa', '/')}
                                            className="px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-atlas-accent to-green-400 text-emerald-900 shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-atlas-accent focus:ring-offset-atlas-bg"
                                        >
                                            {isNewUser ? 'Create Your Explorer' : 'Sign In to Continue'}
                                        </button>
                                        <button className="px-5 py-3 rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 focus:ring-offset-atlas-bg">
                                            Learn More
                                        </button>
                                    </div>
                                    <div id="mode-announcement" className="sr-only" aria-live="polite" />
                                </div>
                                {/* Metrics: previously an <aside>; not a complementary landmark so we use a div */}
                                <div
                                    className="grid grid-cols-3 gap-4 text-center text-xs font-medium pt-2 sm:pt-0"
                                    role="group"
                                    aria-label="World metrics preview"
                                >
                                    {/* Placeholder world metrics (static for now) */}
                                    <div className="flex flex-col rounded-lg bg-white/5 px-3 py-2">
                                        <span className="text-base font-semibold text-white">128</span>
                                        <span className="text-slate-400">Rooms</span>
                                    </div>
                                    <div className="flex flex-col rounded-lg bg-white/5 px-3 py-2">
                                        <span className="text-base font-semibold text-white">42</span>
                                        <span className="text-slate-400">Players</span>
                                    </div>
                                    <div className="flex flex-col rounded-lg bg-white/5 px-3 py-2">
                                        <span className="text-base font-semibold text-white">7</span>
                                        <span className="text-slate-400">Factions</span>
                                    </div>
                                </div>
                            </div>
                        </section>

                        {/* Quick Start Steps (ordered list for better SR context) */}
                        <section aria-labelledby="quick-start-title" className="mt-2">
                            <h2 id="quick-start-title" className="text-sm font-semibold tracking-wide mb-3 sr-only">
                                Quick start steps
                            </h2>
                            <ol className="grid gap-4 sm:grid-cols-3 list-none m-0 p-0">
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
                                    <li key={item.label} className="p-4 rounded-xl bg-white/4 ring-1 ring-white/10 flex flex-col gap-2">
                                        <h3 className="text-sm font-semibold tracking-wide text-white">
                                            <span className="text-atlas-accent mr-1" aria-hidden>
                                                {idx + 1}.
                                            </span>
                                            {item.label}
                                        </h3>
                                        <p className="text-xs text-slate-300 leading-relaxed">{item.body}</p>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        {/* Secondary Pillars reused (semantic reinforcement) */}
                        <section className="grid gap-3 sm:grid-cols-3" aria-label="Game pillars">
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold">Persistent world</h3>
                                <p className="text-sm text-atlas-muted">Actions persist through asynchronous world events.</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold">Player-driven stories</h3>
                                <p className="text-sm text-slate-400">Choices ripple across the Atlas and alter the map.</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold">Mobile first</h3>
                                <p className="text-sm text-slate-400">Designed to work beautifully on phones and scale up.</p>
                            </div>
                        </section>
                        {/* MVP Command Interface (guest can try commands before auth) */}
                        <section aria-labelledby="command-interface-title" className="mt-4">
                            <h2 id="command-interface-title" className="text-sm font-semibold tracking-wide mb-3">
                                Try a Command
                            </h2>
                            <CommandInterface playerGuid={playerGuid || undefined} />
                        </section>
                    </div>
                    {/* Desktop side panel (progressive enhancement) */}
                    <aside className="hidden lg:flex lg:col-span-4 xl:col-span-3">
                        <div
                            className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 flex flex-col gap-4 sticky top-6 max-h-[calc(100vh-4rem)] overflow-hidden"
                            aria-labelledby="world-feed-title"
                        >
                            <h2 id="world-feed-title" className="text-sm font-semibold tracking-wide">
                                World Activity (Preview)
                            </h2>
                            <ul className="flex flex-col gap-3 text-xs text-slate-300">
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 rounded-full bg-atlas-accent" />
                                    Atlas recalculated 5 rooms.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-400" />
                                    New wanderer joined a faction.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 rounded-full bg-sky-400" />
                                    Hidden passage rumor spreading.
                                </li>
                                <li className="text-xs uppercase tracking-wide text-slate-300 pt-2">Feed static prototype</li>
                            </ul>
                        </div>
                    </aside>
                </div>
            ) : null}

            {/* Authenticated (returning journey view) */}
            {!loading && !guidLoading && isAuthenticated ? (
                <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
                    <div className="flex flex-col gap-6 lg:col-span-8 xl:col-span-9">
                        <section className="bg-white/3 p-4 rounded-xl shadow-lg" aria-labelledby="begin-journey">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                                <div>
                                    <h2 id="begin-journey" className="text-lg font-semibold">
                                        Welcome back, {user?.userDetails?.split(' ')[0] || 'Explorer'}
                                    </h2>
                                    <p className="text-sm text-atlas-muted">
                                        {linkError
                                            ? 'We will retry linking shortly.'
                                            : linked
                                              ? 'Your guest progress is now linked.'
                                              : 'Your map has shifted while you were away.'}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-atlas-accent to-green-400 text-emerald-900">
                                        Enter World
                                    </button>
                                    <button className="px-4 py-2 rounded-lg border border-white/10 text-slate-300">Change Explorer</button>
                                </div>
                            </div>
                        </section>

                        <section className="grid gap-3 sm:grid-cols-3" aria-label="Game pillars">
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold">Active events</h3>
                                <p className="text-sm text-atlas-muted">Dynamic storms reshaping 5 rooms.</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold">Faction influence</h3>
                                <p className="text-sm text-slate-400">Cartographers gaining dominance.</p>
                            </div>
                            <div className="p-3 rounded-lg bg-white/3">
                                <h3 className="font-semibold">New discoveries</h3>
                                <p className="text-sm text-slate-400">3 hidden passages found overnight.</p>
                            </div>
                        </section>
                        <section aria-labelledby="auth-command-interface-title" className="mt-2">
                            <h2 id="auth-command-interface-title" className="text-sm font-semibold tracking-wide mb-3">
                                Command Interface
                            </h2>
                            <CommandInterface playerGuid={playerGuid || user?.userId} />
                        </section>
                    </div>
                    <aside className="hidden lg:flex lg:col-span-4 xl:col-span-3">
                        <div
                            className="w-full rounded-2xl bg-white/5 ring-1 ring-white/10 p-5 flex flex-col gap-4 sticky top-6 max-h-[calc(100vh-4rem)] overflow-hidden"
                            aria-labelledby="player-feed-title"
                        >
                            <h2 id="player-feed-title" className="text-sm font-semibold tracking-wide">
                                Explorer Updates (Preview)
                            </h2>
                            <ul className="flex flex-col gap-3 text-xs text-slate-300">
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 rounded-full bg-atlas-accent" />
                                    Your patrol uncovered a relic fragment.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 rounded-full bg-amber-400" />
                                    Faction envoy sent a message.
                                </li>
                                <li className="flex items-start gap-2">
                                    <span className="mt-0.5 h-2 w-2 rounded-full bg-fuchsia-400" />
                                    Trade offer pending review.
                                </li>
                                <li className="text-xs uppercase tracking-wide text-slate-300 pt-2">Feed static prototype</li>
                            </ul>
                        </div>
                    </aside>
                </div>
            ) : null}
            <footer className="mt-auto text-center text-slate-400 text-xs lg:text-sm p-3 lg:pt-8">
                © The Shifting Atlas — built with love
            </footer>
        </div>
    )
}
