import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound(): React.ReactElement {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-5 text-slate-100 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark">
            <h1 className="text-4xl font-bold mb-4" tabIndex={-1}>
                404
            </h1>
            <h2 className="text-2xl font-semibold mb-3">Page Not Found</h2>
            <p className="text-atlas-muted mb-6 text-center max-w-md">
                The location you&apos;re looking for doesn&apos;t exist in The Shifting Atlas. Perhaps it has shifted away...
            </p>
            <Link
                to="/"
                className="px-6 py-3 rounded-lg font-semibold bg-gradient-to-r from-atlas-accent to-green-400 text-emerald-900 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white focus-visible:ring-offset-atlas-bg"
            >
                Return Home
            </Link>
        </div>
    )
}
