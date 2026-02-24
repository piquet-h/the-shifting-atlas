import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const ROOT = path.join(__dirname, '../src/components')
const GAMEVIEW_PATH = path.join(ROOT, 'GameView.tsx')
const HOOK_PATH = path.join(ROOT, 'hooks/useGameNavigationFlow.ts')
const LAYOUT_PATH = path.join(ROOT, 'layout/GameViewLayout.tsx')
const OVERLAYS_PATH = path.join(ROOT, 'layout/GameViewOverlays.tsx')
const PANELS_PATH = path.join(ROOT, 'layout/GameViewPanels.tsx')

describe('GameView refactor seams', () => {
    it('extracts navigation flow into dedicated hook module', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        expect(fs.existsSync(HOOK_PATH)).toBe(true)
        expect(source).toMatch(/from '\.\/hooks\/useGameNavigationFlow'/)
        expect(source).not.toMatch(/const\s+navigateMutation\s*=\s*useMutation\(/)
    })

    it('extracts layout and overlay rendering into dedicated component modules', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        expect(fs.existsSync(LAYOUT_PATH)).toBe(true)
        expect(fs.existsSync(OVERLAYS_PATH)).toBe(true)
        expect(fs.existsSync(PANELS_PATH)).toBe(true)

        expect(source).toMatch(/from '\.\/layout\/GameViewLayout'/)
        expect(source).toMatch(/from '\.\/layout\/GameViewOverlays'/)
        expect(source).toMatch(/from '\.\/layout\/GameViewPanels'/)
    })
})
