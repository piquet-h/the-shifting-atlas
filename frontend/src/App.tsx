import React, { useEffect, useRef } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Homepage from './components/Homepage'
import LiveAnnouncer from './components/LiveAnnouncer'
import Nav from './components/Nav'
import ResponsiveLayout from './components/ResponsiveLayout'

/**
 * RouteFocusManager
 * Moves focus to the page <h1> (or the main landmark if missing) after navigation.
 * NOTE: The main landmark now lives in App (instead of each page) so individual pages
 * should NOT render their own <main>. This ensures axe "region" rule satisfaction by
 * containing all routed content within landmarks.
 */
function RouteFocusManager({ mainRef }: { mainRef: React.RefObject<HTMLElement | null> }): null {
    const location = useLocation()
    useEffect(() => {
        const heading = mainRef.current?.querySelector('h1')
        if (heading instanceof HTMLElement) heading.focus()
        else if (mainRef.current) mainRef.current.focus()
    }, [location, mainRef])
    return null
}

export default function App(): React.ReactElement {
    const mainRef = useRef<HTMLElement | null>(null)
    return (
        <BrowserRouter>
            <a
                href="#main"
                className="skip-link sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-slate-800 text-white px-4 py-2 rounded"
            >
                Skip to the main content
            </a>
            <div className="app-root min-h-screen flex flex-col lg:gap-4">
                <Nav />
                {/* Single global main landmark wraps all routed page content */}
                <main
                    id="main"
                    ref={mainRef}
                    tabIndex={-1}
                    className="flex-1 outline-none focus-visible:ring-2 focus-visible:ring-atlas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-atlas-bg"
                    aria-label="Main content"
                >
                    <LiveAnnouncer />
                    <ResponsiveLayout>
                        <Routes>
                            <Route path="/" element={<Homepage />} />
                            {/* Future routes go here. */}
                        </Routes>
                    </ResponsiveLayout>
                </main>
            </div>
            <RouteFocusManager mainRef={mainRef} />
        </BrowserRouter>
    )
}
