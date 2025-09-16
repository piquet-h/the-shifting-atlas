import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Logo from './Logo';

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
    const { user, loading, signOut } = useAuth();
    const label = loading ? '...' : user?.userDetails || 'Guest';
    return (
        <nav className="w-full flex items-center justify-between py-3 px-1" aria-label="Primary">
            <div className="flex items-center gap-3">
                <Logo />
                <Link to="/" className="text-lg font-semibold text-slate-100 tracking-tight">
                    The Shifting Atlas
                </Link>
            </div>
            <div className="flex items-center gap-3 relative">
                <details className="group relative">
                    <summary className="list-none cursor-pointer select-none text-xs font-medium px-3 py-1.5 rounded-md bg-white/5 text-slate-200 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-atlas-bg">
                        {label}
                        <span className="sr-only"> user menu</span>
                    </summary>
                    <div className="absolute right-0 top-full mt-2 w-44 rounded-md bg-slate-800/95 backdrop-blur border border-white/10 shadow-lg p-2 flex flex-col gap-1 z-50">
                        {user ? (
                            <button
                                onClick={signOut}
                                className="text-left text-xs px-2 py-1 rounded hover:bg-white/10 focus:outline-none focus:bg-white/10"
                            >
                                Sign Out
                            </button>
                        ) : (
                            <>
                                <a
                                    href="/.auth/login/msa?post_login_redirect_uri=/"
                                    className="text-left text-xs px-2 py-1 rounded hover:bg-white/10 focus:outline-none focus:bg-white/10"
                                >
                                    Sign In with Microsoft
                                </a>
                                <button className="text-left text-xs px-2 py-1 rounded opacity-60 cursor-not-allowed bg-white/5 text-slate-400">
                                    Register (Provisioned by provider)
                                </button>
                            </>
                        )}
                    </div>
                </details>
            </div>
        </nav>
    );
}
