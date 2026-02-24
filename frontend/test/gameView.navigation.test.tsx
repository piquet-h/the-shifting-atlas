/**
 * GameView Navigation Tests
 *
 * Tests for the GameView navigation architecture after decomposition:
 * - Verifies navigation mutation is moved into useGameNavigationFlow hook
 * - Verifies GameView passes navigation busy state to layout component
 * - Ensures navigation wrapper callback remains in GameView composition
 */

import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const GAMEVIEW_PATH = path.join(__dirname, '../src/components/GameView.tsx')
const GAMEVIEW_HOOK_PATH = path.join(__dirname, '../src/components/hooks/useGameNavigationFlow.ts')

describe('GameView Navigation Optimization', () => {
    it('moves useMutation implementation to useGameNavigationFlow hook', () => {
        const gameViewSource = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')
        const hookSource = fs.readFileSync(GAMEVIEW_HOOK_PATH, 'utf-8')

        expect(gameViewSource).toMatch(/from '\.\/hooks\/useGameNavigationFlow'/)
        expect(gameViewSource).not.toMatch(/const\s+navigateMutation\s*=\s*useMutation\(/)
        expect(hookSource).toMatch(/const\s+navigateMutation\s*=\s*useMutation\(/)
    })

    it('passes navigation busy state to layout component', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        expect(source).toMatch(/navigationDisabled={navigatePending}/)
        expect(source).toMatch(/const\s*{[\s\S]*navigatePending[\s\S]*}\s*=\s*useGameNavigationFlow\(/)
    })

    it('retains navigate callback flow in extracted hook', () => {
        const hookSource = fs.readFileSync(GAMEVIEW_HOOK_PATH, 'utf-8')

        expect(hookSource).toMatch(/const\s+handleNavigate\s*=\s*useCallback/)
        expect(hookSource).toMatch(/const\s+{\s*mutate:\s*\w+\s*}\s*=\s*navigateMutation/)
        expect(hookSource).toMatch(/navigate\w*Mutate\s*\(\s*{\s*direction,\s*correlationId\s*}\s*\)/)
    })

    it('documents decomposition intent in code comments', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        const hasOptimizationComment =
            source.includes('Main game view component orchestrating') || source.includes('Responsive breakpoints')

        expect(hasOptimizationComment).toBe(true)
    })
})
