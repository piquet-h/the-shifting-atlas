import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const FRONTEND_ROOT = path.join(__dirname, '../src')
const APP_PATH = path.join(FRONTEND_ROOT, 'App.tsx')
const HOMEPAGE_PATH = path.join(FRONTEND_ROOT, 'components/Homepage.tsx')
const GAME_PATH = path.join(FRONTEND_ROOT, 'pages/Game.tsx')
const PROTECTED_ROUTE_PATH = path.join(FRONTEND_ROOT, 'components/ProtectedRoute.tsx')
const TAILWIND_PATH = path.join(FRONTEND_ROOT, 'tailwind.css')

describe('No full-page scrollbar layout contract', () => {
    it('uses dynamic viewport height without extra root gap in App shell', () => {
        const source = fs.readFileSync(APP_PATH, 'utf-8')

        // App shell should size to dynamic viewport and avoid extra flex gap that can force overflow.
        expect(source).toMatch(/className="[^"]*\bh-dvh\b[^"]*\boverflow-hidden\b[^"]*"/)
        expect(source).not.toMatch(/\blg:gap-4\b/)
    })

    it('avoids min-h-screen on routed surfaces that live inside the app shell', () => {
        const homepage = fs.readFileSync(HOMEPAGE_PATH, 'utf-8')
        const game = fs.readFileSync(GAME_PATH, 'utf-8')
        const protectedRoute = fs.readFileSync(PROTECTED_ROUTE_PATH, 'utf-8')
        const tailwind = fs.readFileSync(TAILWIND_PATH, 'utf-8')

        // These screens render inside App's fixed-height shell. Using min-h-screen here can push content
        // beyond viewport and create an unwanted page-level scrollbar.
        expect(homepage).not.toMatch(/\bmin-h-screen\b/)
        expect(game).not.toMatch(/\bmin-h-screen\b/)
        expect(protectedRoute).not.toMatch(/\bmin-h-screen\b/)

        // Shared page utility used by Help/About must also avoid screen-height forcing.
        expect(tailwind).not.toMatch(/\.page-container\s*\{[\s\S]*\bmin-h-screen\b/)
    })
})
