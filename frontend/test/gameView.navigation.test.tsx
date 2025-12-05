/**
 * GameView Navigation Tests
 *
 * Tests for the navigation callback optimization:
 * - Verifies TanStack Query mutation pattern is used correctly
 * - Documents the optimization: extracting stable mutate function
 * - Ensures navigation blocking behavior is preserved
 *
 * Note: These tests verify the implementation pattern rather than runtime behavior
 * since the project uses server-side rendering for tests without full DOM testing setup.
 */

import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const GAMEVIEW_PATH = path.join(__dirname, '../src/components/GameView.tsx')

describe('GameView Navigation Optimization', () => {
    it('extracts stable mutate function from useMutation', () => {
        // Read the GameView component source code
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        // Verify the optimized pattern is implemented:
        // 1. Extract mutate function from mutation object
        // 2. Use the extracted function in useCallback dependencies

        // Check for the pattern: const { mutate: navigateMutate } = navigateMutation
        expect(source).toMatch(/const\s+{\s*mutate:\s*\w+\s*}\s*=\s*navigateMutation/)

        // Check that the extracted function is used in the callback
        expect(source).toMatch(/navigateMutate\s*\(\s*{/)

        // Verify useCallback is used
        expect(source).toMatch(/const\s+handleNavigate\s*=\s*useCallback/)
    })

    it('uses navigateMutation.isPending for UI busy state', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        // Verify that mutation.isPending is used to disable navigation buttons
        expect(source).toMatch(/disabled={navigateMutation\.isPending}/)

        // This ensures that concurrent navigations are prevented at the UI level
        // The mutation will only process one request at a time
    })

    it('does not include full mutation object in useCallback dependencies', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        // The anti-pattern would be: [playerGuid, navigateMutation]
        // The correct pattern is: [playerGuid, navigateMutate] (extracted function)

        // Find the handleNavigate useCallback
        const callbackMatch = source.match(/const\s+handleNavigate\s*=\s*useCallback\s*\(([\s\S]*?)\s*,\s*\[([\s\S]*?)\]\s*\)/)

        expect(callbackMatch).not.toBeNull()

        if (callbackMatch) {
            const dependencies = callbackMatch[2]

            // Should NOT include the full navigateMutation object
            expect(dependencies).not.toMatch(/\bnavigateMutation\b/)

            // Should include the extracted mutate function (navigateMutate or similar)
            // This is the stable function reference
            expect(dependencies).toMatch(/navigate\w*[Mm]utate/)
        }
    })

    it('documents the optimization in code comments', () => {
        const source = fs.readFileSync(GAMEVIEW_PATH, 'utf-8')

        // Verify there's a comment explaining the pattern
        // This helps future developers understand the optimization
        const hasOptimizationComment =
            source.includes('stable mutate function') || source.includes('Extract stable') || source.includes('avoid callback recreation')

        expect(hasOptimizationComment).toBe(true)
    })
})
