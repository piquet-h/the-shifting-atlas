import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Nav
 * Simplified after removal of demo + about pages.
 * Adds a placeholder user menu trigger for future auth/profile integration.
 * TODO(auth): Replace placeholder with real user context (Azure AD B2C / custom identity) once implemented.
 */

export default function Nav(): React.ReactElement {
  return (
    <nav className="w-full flex items-center justify-between py-3 px-1" aria-label="Primary">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-lg font-semibold text-slate-100 tracking-tight">
          The Shifting Atlas
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-white/5 text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-atlas-accent focus:ring-offset-2 focus:ring-offset-atlas-bg"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label="User menu (placeholder)"
        >
          Guest
        </button>
      </div>
    </nav>
  );
}
