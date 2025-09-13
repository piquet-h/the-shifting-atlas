import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import EntryPageTailwind from './components/EntryPage.tailwind'
import About from './pages/About'
import DemoForm from './pages/DemoForm'
import Nav from './components/Nav'

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-root min-h-screen">
                <Nav />
                <Routes>
                    <Route path="/" element={<EntryPageTailwind />} />
                    <Route path="/demo/form" element={<DemoForm />} />
                    <Route path="/about" element={<About />} />
                </Routes>
            </div>
        </BrowserRouter>
    )
}
