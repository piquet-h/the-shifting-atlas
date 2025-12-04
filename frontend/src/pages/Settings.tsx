import React from 'react'

export default function Settings(): React.ReactElement {
    return (
        <div className="min-h-screen p-5 text-slate-100 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark">
            <h1 className="text-2xl font-semibold" tabIndex={-1}>
                Settings
            </h1>
            <p className="mt-3 text-atlas-muted">Configure your preferences for The Shifting Atlas experience.</p>
            <div className="mt-6 flex flex-col gap-4">
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-2">Display Settings</h2>
                    <p className="text-sm text-slate-400">Display settings will be available soon.</p>
                </section>
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-2">Audio Settings</h2>
                    <p className="text-sm text-slate-400">Audio settings will be available soon.</p>
                </section>
                <section className="p-4 rounded-lg bg-white/5 ring-1 ring-white/10">
                    <h2 className="text-lg font-medium mb-2">Account Settings</h2>
                    <p className="text-sm text-slate-400">Account management will be available soon.</p>
                </section>
            </div>
        </div>
    )
}
