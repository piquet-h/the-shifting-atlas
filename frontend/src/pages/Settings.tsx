import React from 'react'

export default function Settings(): React.ReactElement {
    return (
        <div className="page-container">
            <h1 className="text-2xl font-semibold" tabIndex={-1}>
                Settings
            </h1>
            <p className="mt-3 text-atlas-muted">Configure your preferences for The Shifting Atlas experience.</p>
            <div className="mt-6 flex flex-col gap-4">
                <section className="card">
                    <h2 className="text-lg font-medium mb-2">Display Settings</h2>
                    <p className="text-sm text-slate-400">Display settings will be available soon.</p>
                </section>
                <section className="card">
                    <h2 className="text-lg font-medium mb-2">Audio Settings</h2>
                    <p className="text-sm text-slate-400">Audio settings will be available soon.</p>
                </section>
                <section className="card">
                    <h2 className="text-lg font-medium mb-2">Account Settings</h2>
                    <p className="text-sm text-slate-400">Account management will be available soon.</p>
                </section>
            </div>
        </div>
    )
}
