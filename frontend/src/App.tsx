import React, { useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import EntryPageTailwind from './components/EntryPage'
import About from './pages/About'
import DemoForm from './pages/DemoForm'
import Nav from './components/Nav'
import LiveAnnouncer from './components/LiveAnnouncer'

function ScrollAndFocus(): null {
  const location = useLocation()
  const mainRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    // On route change focus the first h1 for screen reader context
    const heading = mainRef.current?.querySelector('h1') as HTMLHeadingElement | null
    if (heading) heading.focus()
  }, [location])
  return null
}

export default function App(): React.ReactElement {
  return (
    <BrowserRouter>
      <a href="#main" className="skip-link sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-slate-800 text-white px-4 py-2 rounded">
        Skip to main content
      </a>
      <div className="app-root min-h-screen flex flex-col" aria-label="Application Shell">
        <Nav />
        <LiveAnnouncer />
        <Routes>
          <Route
            path="/"
            element={<EntryPageTailwind />}
          />
          <Route path="/demo/form" element={<DemoForm />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </div>
      <ScrollAndFocus />
    </BrowserRouter>
  )
}
