/**
 * Profile Page
 *
 * User profile and account management page.
 * Protected route - requires authentication.
 */
import React from 'react'
import { useAuth } from '../hooks/useAuth'

export default function Profile(): React.ReactElement {
    const { user, signOut } = useAuth()

    return (
        <div className="min-h-screen p-5 text-slate-100 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark">
            <h1 className="text-2xl font-semibold" tabIndex={-1}>
                Profile
            </h1>
            <div className="mt-6 flex flex-col gap-4 max-w-2xl">
                {/* User Information */}
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-4">Account Information</h2>
                    <dl className="space-y-3">
                        <div>
                            <dt className="text-sm text-slate-400">Display Name</dt>
                            <dd className="text-base text-slate-100 mt-1">{user?.userDetails || 'Explorer'}</dd>
                        </div>
                        <div>
                            <dt className="text-sm text-slate-400">User ID</dt>
                            <dd className="text-sm text-slate-100 mt-1 font-mono break-all">{user?.userId || 'N/A'}</dd>
                        </div>
                        <div>
                            <dt className="text-sm text-slate-400">Identity Provider</dt>
                            <dd className="text-base text-slate-100 mt-1 capitalize">{user?.identityProvider || 'N/A'}</dd>
                        </div>
                        {user?.userRoles && user.userRoles.length > 0 && (
                            <div>
                                <dt className="text-sm text-slate-400">Roles</dt>
                                <dd className="text-base text-slate-100 mt-1">{user.userRoles.join(', ')}</dd>
                            </div>
                        )}
                    </dl>
                </section>

                {/* Game Progress */}
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-2">Game Progress</h2>
                    <p className="text-sm text-slate-400">Progress tracking will be available soon.</p>
                </section>

                {/* Account Actions */}
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-4">Account Actions</h2>
                    <button
                        onClick={() => signOut('/')}
                        className="touch-target px-4 py-2 rounded-lg font-medium text-responsive-base bg-red-600 hover:bg-red-700 text-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-500 focus-visible:ring-offset-atlas-bg"
                    >
                        Sign Out
                    </button>
                </section>
            </div>
        </div>
    )
}
