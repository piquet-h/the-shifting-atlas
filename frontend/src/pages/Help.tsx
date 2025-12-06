import React from 'react'

export default function Help(): React.ReactElement {
    return (
        <div className="page-container">
            <h1 className="text-2xl font-semibold" tabIndex={-1}>
                Help & Support
            </h1>
            <p className="mt-3 text-atlas-muted">Learn how to navigate The Shifting Atlas and get the most out of your exploration.</p>
            <div className="mt-6 flex flex-col gap-4">
                <section className="card">
                    <h2 className="text-lg font-medium mb-2">Getting Started</h2>
                    <p className="text-sm text-slate-300 mb-2">
                        The Shifting Atlas is a text-based exploration game where you navigate through an ever-changing world.
                    </p>
                    <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                        <li>
                            Use commands like &quot;look&quot;, &quot;north&quot;, &quot;south&quot;, &quot;east&quot;, &quot;west&quot; to
                            navigate
                        </li>
                        <li>Your progress is automatically saved</li>
                        <li>The world evolves based on player actions</li>
                    </ul>
                </section>
                <section className="card">
                    <h2 className="text-lg font-medium mb-2">Common Commands</h2>
                    <ul className="list-disc list-inside text-sm text-slate-300 space-y-1">
                        <li>
                            <code className="code-inline">look</code> - Examine your current location
                        </li>
                        <li>
                            <code className="code-inline">north/south/east/west</code> - Move in a direction
                        </li>
                        <li>
                            <code className="code-inline">inventory</code> - View your items
                        </li>
                    </ul>
                </section>
                <section className="card">
                    <h2 className="text-lg font-medium mb-2">Need More Help?</h2>
                    <p className="text-sm text-slate-300">For additional support, please visit our community forums or contact support.</p>
                </section>
            </div>
        </div>
    )
}
