import React from 'react';

export default function About(): React.ReactElement {
  return (
    <main className="min-h-screen p-5 text-slate-100 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark">
      <h1 className="text-2xl font-semibold">About The Shifting Atlas</h1>
      <p className="mt-3 text-atlas-muted">
        A minimal demo UI for the Shifting Atlas project. This site is a Vite + React + Tailwind
        scaffold wired to the backend functions.
      </p>
    </main>
  );
}
