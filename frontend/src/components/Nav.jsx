import React from 'react'
import { Link } from 'react-router-dom'

export default function Nav() {
    return (
        <nav className="w-full flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
                <Link to="/" className="text-lg font-semibold text-slate-100">The Shifting Atlas</Link>
            </div>
            <div className="flex items-center gap-3">
                <Link to="/demo/form" className="text-sm text-slate-300 hover:text-white">Demo Form</Link>
                <Link to="/about" className="text-sm text-slate-300 hover:text-white">About</Link>
            </div>
        </nav>
    )
}
