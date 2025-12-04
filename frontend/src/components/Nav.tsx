import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { usePing } from '../hooks/usePing'
import Logo from './Logo'

/**
 * Nav
 * Simplified after removal of demo + about pages.
 * Adds a placeholder user menu trigger for future auth/profile integration.
 * TODO(auth): Replace placeholder with real user context (Azure AD B2C / custom identity) once implemented.
 * Accessibility notes:
 * - Single global navigation landmark rendered once (homepage removed duplicate heading block).
 * - Placeholder user actions use <details>/<summary> for built‑in keyboard + semantics until real menu logic arrives.
 * - Will replace with button + ARIA menu pattern when authenticated user features are implemented.
 */

export default function Nav(): React.ReactElement {
    const { user, loading, signOut, signIn } = useAuth()
    const { data: ping, loading: pingLoading } = usePing({ intervalMs: 45000 })
    const statusLabel = React.useMemo(() => {
        if (pingLoading) return 'Checking service status'
        if (ping?.ok) return 'Online'
        return 'Offline'
    }, [pingLoading, ping?.ok])
    const label = loading ? '...' : user?.userDetails || 'Explorer'
    const initials = React.useMemo(() => {
        if (loading) return ''
        const source = user?.userDetails?.trim() || label
        if (!source) return ''
        const parts = source.split(/\s+/).filter(Boolean)
        if (parts.length === 0) return ''
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
        return (parts[0][0] + parts[1][0]).toUpperCase()
    }, [user?.userDetails, label, loading])
    return (
        <nav
            className="w-full flex items-center justify-between py-2 sm:py-3 px-2 sm:px-3 lg:py-4 lg:px-4 sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-atlas-bg/75 bg-atlas-bg/95 border-b border-white/5"
            aria-label="Primary"
        >
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <Logo />
                <Link to="/" className="text-responsive-lg font-semibold text-slate-100 tracking-tight truncate">
                    The Shifting Atlas
                </Link>
            </div>
            <div className="flex items-center gap-2 sm:gap-3 md:gap-4 relative flex-shrink-0">
                {/* Navigation links - visible on medium+ screens */}
                <div className="hidden md:flex items-center gap-2 sm:gap-3">
                    <Link
                        to="/help"
                        className="text-responsive-sm text-slate-300 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent rounded px-2 py-1 transition-colors"
                    >
                        Help
                    </Link>
                    <Link
                        to="/about"
                        className="text-responsive-sm text-slate-300 hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent rounded px-2 py-1 transition-colors"
                    >
                        About
                    </Link>
                </div>
                <span
                    aria-hidden="true"
                    className={`h-2 w-2 sm:h-2.5 sm:w-2.5 rounded-full shadow ring-1 ring-black/40 transition-colors duration-300 ${
                        pingLoading ? 'bg-amber-400 animate-pulse' : ping?.ok ? 'bg-emerald-400' : 'bg-rose-500'
                    }`}
                />
                <span className="sr-only" role="status">
                    Service status: {statusLabel}
                </span>
                <details className="group relative">
                    <summary className="list-none cursor-pointer select-none text-responsive-sm font-medium pl-1 pr-2 sm:pr-3 py-1 sm:py-1.5 rounded-md bg-white/5 text-slate-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-atlas-bg transition-colors duration-150 flex items-center gap-1 sm:gap-2 touch-target">
                        <span
                            aria-hidden="true"
                            className="inline-flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-gradient-to-br from-atlas-accent/80 to-atlas-accent text-[9px] sm:text-[10px] font-semibold tracking-wide text-slate-900 shadow-inner ring-1 ring-white/30"
                        >
                            {initials || '⛶'}
                        </span>
                        <span className="hidden sm:inline">{label}</span>
                        <span className="sr-only">{label} user menu</span>
                    </summary>
                    <div className="absolute right-0 top-full mt-2 w-40 sm:w-44 rounded-md bg-slate-800/95 backdrop-blur border border-white/10 shadow-lg p-2 flex flex-col gap-1 z-50">
                        {/* Mobile-only navigation links */}
                        <div className="md:hidden border-b border-white/10 pb-1 mb-1">
                            <Link
                                to="/help"
                                className="touch-target text-left text-responsive-sm px-2 py-2 rounded text-slate-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:bg-white/10 transition-colors block"
                            >
                                Help
                            </Link>
                            <Link
                                to="/about"
                                className="touch-target text-left text-responsive-sm px-2 py-2 rounded text-slate-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:bg-white/10 transition-colors block"
                            >
                                About
                            </Link>
                        </div>
                        {user ? (
                            <>
                                <Link
                                    to="/settings"
                                    className="touch-target text-left text-responsive-sm px-2 py-2 rounded text-slate-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:bg-white/10 transition-colors"
                                >
                                    Settings
                                </Link>
                                <button
                                    onClick={() => signOut()}
                                    className="touch-target text-left text-responsive-sm px-2 py-2 rounded text-slate-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:bg-white/10 transition-colors"
                                >
                                    Sign Out
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => signIn('msa', '/')}
                                    className="touch-target text-left text-responsive-sm px-2 py-2 rounded text-slate-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:bg-white/10 transition-colors"
                                >
                                    Sign In with Microsoft
                                </button>
                            </>
                        )}
                    </div>
                </details>
            </div>
        </nav>
    )
}
