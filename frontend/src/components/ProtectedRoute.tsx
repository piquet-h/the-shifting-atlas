/**
 * ProtectedRoute Component
 *
 * Wrapper for routes that require authentication.
 * Redirects unauthenticated users to the homepage.
 * Shows loading state during auth check.
 */
import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

interface ProtectedRouteProps {
    children: React.ReactElement
}

export default function ProtectedRoute({ children }: ProtectedRouteProps): React.ReactElement {
    const { isAuthenticated, loading } = useAuth()
    const location = useLocation()

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center py-4 sm:py-5 md:py-6 lg:py-8 text-slate-100">
                <div className="h-8 w-8 sm:h-10 sm:w-10 animate-spin rounded-full border-2 border-atlas-accent border-t-transparent" />
                <p className="mt-4 text-responsive-sm text-slate-400">Verifying access...</p>
            </div>
        )
    }

    if (!isAuthenticated) {
        // Redirect to homepage, preserving the intended destination in state
        return <Navigate to="/" state={{ from: location }} replace />
    }

    return children
}
