import React, { useEffect, useRef } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import Homepage from './components/Homepage'
import LiveAnnouncer from './components/LiveAnnouncer'
import Nav from './components/Nav'
import ProtectedRoute from './components/ProtectedRoute'
import ResponsiveLayout from './components/ResponsiveLayout'
import About from './pages/About'
import Game from './pages/Game'
import Help from './pages/Help'
import LearnMore from './pages/LearnMore'
import NotFound from './pages/NotFound'
import Profile from './pages/Profile'
import Settings from './pages/Settings'

/** Moves focus to <h1> or main landmark after navigation. Main landmark is global; pages should not render their own <main>. */
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
                Skip to main content.
            </a>
            <div className="app-root min-h-screen flex flex-col lg:gap-4">
                <Nav />
                {/* Global main landmark wraps all routed content */}
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
                            <Route path="/game" element={<Game />} />
                            <Route path="/learn-more" element={<LearnMore />} />
                            <Route
                                path="/profile"
                                element={
                                    <ProtectedRoute>
                                        <Profile />
                                    </ProtectedRoute>
                                }
                            />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/help" element={<Help />} />
                            <Route path="/about" element={<About />} />
                            <Route path="*" element={<NotFound />} />
                        </Routes>
                    </ResponsiveLayout>
                </main>
            </div>
            <RouteFocusManager mainRef={mainRef} />
        </BrowserRouter>
    )
}
