import React from 'react'

function Logo(): React.ReactElement {
  return (
    <div className="w-12 h-12 text-atlas-accent flex items-center justify-center" aria-hidden>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M7 12h10M12 7v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export default function EntryPageTailwind(): React.ReactElement {
  return (
    <main className="min-h-screen flex flex-col gap-4 p-5 text-slate-100 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark">
      <header className="flex items-center gap-3">
        <Logo />
        <div>
          <h1 className="text-xl font-semibold">The Shifting Atlas</h1>
          <p className="text-sm text-atlas-muted">A text-adventure MMO of drifting maps and hidden rooms.</p>
        </div>
      </header>

      <section className="bg-white/3 p-4 rounded-xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold">Begin your journey</h2>
            <p className="text-sm text-atlas-muted">Explore. Trade. Survive. Shape the Atlas with other players.</p>
          </div>

          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-lg font-semibold bg-gradient-to-r from-atlas-accent to-green-400 text-emerald-900">Play Now</button>
            <button className="px-4 py-2 rounded-lg border border-white/10 text-slate-300">Learn More</button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
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

      <footer className="mt-auto text-center text-slate-400 text-sm p-3">© The Shifting Atlas — built with love</footer>
    </main>
  )
}
