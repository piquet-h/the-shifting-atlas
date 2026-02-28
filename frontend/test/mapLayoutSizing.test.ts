import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const FRONTEND_ROOT = path.join(__dirname, '../src')
const APP_PATH = path.join(FRONTEND_ROOT, 'App.tsx')
const RESPONSIVE_LAYOUT_PATH = path.join(FRONTEND_ROOT, 'components/ResponsiveLayout.tsx')

describe('Map layout sizing contract', () => {
    it('App main landmark uses flex column sizing (so full-height pages can fill and scroll)', () => {
        const source = fs.readFileSync(APP_PATH, 'utf-8')

        // We want main to be a flex column with min-h-0 so its child scroll containers can size correctly.
        // This prevents components like Cytoscape maps from mounting into a 0-height container.
        expect(source).toMatch(/<main[\s\S]*className="[^"]*\bflex\b[^"]*\bflex-col\b[^"]*\bmin-h-0\b[^"]*"/)
    })

    it('ResponsiveLayout includes min-h-0 to allow flex children to size and avoid overflow collapse', () => {
        const source = fs.readFileSync(RESPONSIVE_LAYOUT_PATH, 'utf-8')

        // ResponsiveLayout is used as the immediate wrapper around <Routes />.
        // It must allow children to adopt full height (e.g., Map page) without collapsing.
        expect(source).toMatch(/'[^']*\bmin-h-0\b[^']*'/)
    })
})
