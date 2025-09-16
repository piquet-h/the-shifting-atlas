import React, { useEffect, useState } from 'react';

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
 */

// Renamed from EntryPage to Homepage to better reflect its role as the landing experience.
function Logo(): React.ReactElement {
  return (
    <div className="w-12 h-12 text-atlas-accent flex items-center justify-center" aria-hidden>
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 12h10M12 7v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function Homepage(): React.ReactElement {
  const [isNewUser, setIsNewUser] = useState<boolean>(true);
  const [acknowledged, setAcknowledged] = useState(false);

  // Detect returning visitor using localStorage (MVP placeholder)
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window) {
        const flag = window.localStorage.getItem('tsa.hasVisited');
        if (flag === '1') setIsNewUser(false);
      }
    } catch {
      /* non-blocking */
    }
  }, []);

  const handlePrimaryCTA = () => {
    try {
      if (typeof window !== 'undefined' && 'localStorage' in window) {
        window.localStorage.setItem('tsa.hasVisited', '1');
      }
    } catch {
      /* ignore */
    }
    setIsNewUser(false);
    setAcknowledged(true);
  };

  // Announce mode switch for screen readers (simple polite region pattern)
  useEffect(() => {
    if (acknowledged) {
      const region = document.getElementById('mode-announcement');
      if (region) {
        region.textContent = 'Welcome explorer. Profile scaffold will appear here soon.';
      }
    }
  }, [acknowledged]);

  return (
    <main
      id="main"
      className="min-h-screen flex flex-col gap-6 p-5 text-slate-100 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark"
      aria-labelledby="page-title"
    >
      <header className="flex items-center gap-3">
        <Logo />
        <div>
          <h1 id="page-title" tabIndex={-1} className="text-xl font-semibold tracking-tight">
            The Shifting Atlas
          </h1>
          <p className="text-sm text-atlas-muted">
            A text-adventure MMO of drifting maps and hidden rooms.
          </p>
        </div>
      </header>

      {isNewUser ? (
        <>
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
                  Discover rooms that weren&apos;t there yesterday, trade with wanderers, and carve
                  your story into a world that never pauses. Cooperative, asynchronous, always
                  evolving.
                </p>
                <div className="mt-5 flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handlePrimaryCTA}
                    className="px-5 py-3 rounded-lg font-semibold bg-gradient-to-r from-atlas-accent to-green-400 text-emerald-900 shadow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-atlas-accent focus:ring-offset-atlas-bg"
                  >
                    Create Your Explorer
                  </button>
                  <button className="px-5 py-3 rounded-lg border border-white/15 text-slate-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-400 focus:ring-offset-atlas-bg">
                    Learn More
                  </button>
                </div>
                <div id="mode-announcement" className="sr-only" aria-live="polite" />
              </div>
              <aside className="grid grid-cols-3 gap-4 text-center text-xs font-medium pt-2 sm:pt-0">
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
              </aside>
            </div>
          </section>

          {/* Quick Start Steps */}
          <section aria-labelledby="quick-start-title" className="grid gap-4 sm:grid-cols-3">
            <h2 id="quick-start-title" className="sr-only">
              Quick start steps
            </h2>
            {[
              {
                title: '1. Claim a Starting Room',
                body: 'You begin at the Fringe. Each room you explore anchors the map for others until it drifts again.',
              },
              {
                title: '2. Gather & Trade',
                body: 'Collect curios and lore fragments—trade asynchronously even while players are offline.',
              },
              {
                title: '3. Influence the Atlas',
                body: 'Trigger world events that reroute passages, unlock factions, and reshape traversal.',
              },
            ].map((item) => (
              <div
                key={item.title}
                className="p-4 rounded-xl bg-white/4 ring-1 ring-white/10 flex flex-col gap-2"
              >
                <h3 className="text-sm font-semibold tracking-wide text-white">{item.title}</h3>
                <p className="text-xs text-slate-300 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </section>

          {/* Secondary Pillars reused (semantic reinforcement) */}
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Game pillars">
            <div className="p-3 rounded-lg bg-white/3">
              <h3 className="font-semibold">Persistent world</h3>
              <p className="text-sm text-atlas-muted">
                Actions persist through asynchronous world events.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-white/3">
              <h3 className="font-semibold">Player-driven stories</h3>
              <p className="text-sm text-slate-400">
                Choices ripple across the Atlas and alter the map.
              </p>
            </div>
            <div className="p-3 rounded-lg bg-white/3">
              <h3 className="font-semibold">Mobile first</h3>
              <p className="text-sm text-slate-400">
                Designed to work beautifully on phones and scale up.
              </p>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="bg-white/3 p-4 rounded-xl shadow-lg" aria-labelledby="begin-journey">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <h2 id="begin-journey" className="text-lg font-semibold">
                  Continue your journey
                </h2>
                <p className="text-sm text-atlas-muted">
                  Pick up where you left off—the map has shifted.
                </p>
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-atlas-accent to-green-400 text-emerald-900">
                  Enter World
                </button>
                <button className="px-4 py-2 rounded-lg border border-white/10 text-slate-300">
                  Change Explorer
                </button>
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
        </>
      )}

      <footer className="mt-auto text-center text-slate-400 text-sm p-3">
        © The Shifting Atlas — built with love
      </footer>
    </main>
  );
}
