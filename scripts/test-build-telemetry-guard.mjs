#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * Test harness for build telemetry guard validation.
 *
 * Creates temporary test files with build.* telemetry in game domain code,
 * runs validation, and verifies detection.
 *
 * Exit codes:
 *   0: All tests passed
 *   1: Tests failed
 */

import { writeFileSync, unlinkSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

// Test fixtures
const testFixtures = [
    {
        name: 'Direct build.* event usage in game code',
        path: join(ROOT, 'shared', 'src', '__test_build_violation.ts'),
        content: `// Test fixture: violates build telemetry guard
export function testFunction() {
    const event = 'build.ordering_applied'
    console.log(event)
}
`
    },
    {
        name: 'Import from build-telemetry in game code',
        path: join(ROOT, 'backend', 'src', '__test_import_violation.ts'),
        content: `// Test fixture: violates build telemetry guard
import { trackOrderingApplied } from '../../scripts/shared/build-telemetry.mjs'

export function testFunction() {
    trackOrderingApplied({ issueNumber: 1 })
}
`
    }
]

function runTest(testName, setupFn, cleanupFn) {
    console.log(`\n▶ Test: ${testName}`)

    try {
        setupFn()

        // Run validation (should fail)
        try {
            const result = execSync('node scripts/validate-telemetry-separation.mjs', {
                cwd: ROOT,
                encoding: 'utf-8'
            })

            // If we get here, validation passed (unexpected)
            console.error('  ❌ FAIL: Validation should have detected violations')
            console.error('  Output:', result)
            return false
        } catch (err) {
            // Validation failed (expected)
            const stdout = err.stdout || ''
            const stderr = err.stderr || ''
            const output = stdout + stderr

            // Check that it detected violations
            if (output.includes('telemetry separation violation')) {
                console.log('  ✅ PASS: Violations correctly detected')
                return true
            } else {
                console.error('  ❌ FAIL: Unexpected validation output')
                console.error('  stdout:', stdout)
                console.error('  stderr:', stderr)
                return false
            }
        }
    } finally {
        cleanupFn()
    }
}

function main() {
    console.log('Testing build telemetry guard validation...\n')

    let allPassed = true

    // Test 1: Direct build.* event string usage
    allPassed =
        runTest(
            'Detect build.* event string in shared/src/',
            () => {
                const dir = dirname(testFixtures[0].path)
                if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
                writeFileSync(testFixtures[0].path, testFixtures[0].content)
            },
            () => {
                try {
                    unlinkSync(testFixtures[0].path)
                } catch (err) {
                    // File might not exist
                }
            }
        ) && allPassed

    // Test 2: Import from build-telemetry module
    allPassed =
        runTest(
            'Detect build-telemetry import in backend/src/',
            () => {
                const dir = dirname(testFixtures[1].path)
                if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
                writeFileSync(testFixtures[1].path, testFixtures[1].content)
            },
            () => {
                try {
                    unlinkSync(testFixtures[1].path)
                } catch (err) {
                    // File might not exist
                }
            }
        ) && allPassed

    // Test 3: Verify clean state passes
    console.log('\n▶ Test: Clean codebase passes validation')
    try {
        const result = execSync('node scripts/validate-telemetry-separation.mjs', {
            cwd: ROOT,
            encoding: 'utf-8'
        })
        console.log('  ✅ PASS: Clean codebase passes validation')
    } catch (err) {
        console.error('  ❌ FAIL: Clean codebase should pass validation')
        console.error('  stdout:', err.stdout || '')
        console.error('  stderr:', err.stderr || '')
        allPassed = false
    }

    console.log('\n' + '='.repeat(60))
    if (allPassed) {
        console.log('✅ All build telemetry guard tests passed')
        process.exit(0)
    } else {
        console.error('❌ Some tests failed')
        process.exit(1)
    }
}

main()
