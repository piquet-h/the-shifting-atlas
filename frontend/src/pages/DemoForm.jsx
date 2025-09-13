import React, { useState } from 'react'

export default function DemoForm() {
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')

    return (
        <main className="min-h-screen p-5 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark text-slate-100">
            <div className="max-w-xl mx-auto">
                <h1 className="text-2xl font-semibold mb-4">Demo Form</h1>
                <form className="space-y-4 bg-white/3 p-4 rounded-lg">
                    <div>
                        <label className="block text-sm font-medium mb-1">Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-md" placeholder="Your name" />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Email</label>
                        <input value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full rounded-md" placeholder="you@example.com" />
                    </div>

                    <div className="flex justify-end">
                        <button type="button" className="px-4 py-2 rounded bg-atlas-accent text-emerald-900 font-semibold">Submit</button>
                    </div>
                </form>
            </div>
        </main>
    )
}
