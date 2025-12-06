import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound(): React.ReactElement {
    return (
        <div className="page-container flex flex-col items-center justify-center">
            <h1 className="text-4xl font-bold mb-4" tabIndex={-1}>
                404
            </h1>
            <h2 className="text-2xl font-semibold mb-3">Page Not Found</h2>
            <p className="text-atlas-muted mb-6 text-center max-w-md">
                The location you&apos;re looking for doesn&apos;t exist in The Shifting Atlas. Perhaps it has shifted away...
            </p>
            <Link to="/" className="btn-primary">
                Return Home
            </Link>
        </div>
    )
}
