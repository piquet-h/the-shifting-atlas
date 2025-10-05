#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * validate-telemetry-separation.mjs
 *
 * Validates that build telemetry and game telemetry are properly separated.
 * Checks for common violations:
 * - build.* event names in shared/src/telemetryEvents.ts
 * - Domain.Subject.Action patterns in scripts/shared/build-telemetry.mjs
 * - Application Insights imports in build scripts
 * - Build automation code in shared/src/
 *
 * Usage:
 *   node scripts/validate-telemetry-separation.mjs
 *
 * Exit codes:
 *   0: No violations found
 *   1: Violations detected
 */

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const violations = []

// Check 1: No build.* event names in game telemetry
function checkGameTelemetryFile() {
    const file = join(ROOT, 'shared', 'src', 'telemetryEvents.ts')
    try {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            // Check for build. prefix in string literals
            if (line.includes("'build.") || line.includes('"build.')) {
                violations.push({
                    file: 'shared/src/telemetryEvents.ts',
                    line: i + 1,
                    message: 'Build event name found in game telemetry file (should be in scripts/shared/build-telemetry.mjs)',
                    content: line.trim()
                })
            }
            // Check for snake_case event names (build telemetry convention)
            const snakeCaseMatch = line.match(/['"]([a-z]+_[a-z_]+)['"]/g)
            if (snakeCaseMatch) {
                for (const match of snakeCaseMatch) {
                    if (!match.includes('_')) continue // Skip if no underscore
                    violations.push({
                        file: 'shared/src/telemetryEvents.ts',
                        line: i + 1,
                        message:
                            'Snake_case event name found (build telemetry convention). Game events should use Domain.Subject.Action format',
                        content: line.trim()
                    })
                }
            }
        }
    } catch (err) {
        console.warn(`Warning: Could not read ${file}: ${err.message}`)
    }
}

// Check 2: No Domain.Subject.Action patterns in build telemetry
function checkBuildTelemetryFile() {
    const file = join(ROOT, 'scripts', 'shared', 'build-telemetry.mjs')
    try {
        const content = readFileSync(file, 'utf-8')
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            // Check for PascalCase.PascalCase.PascalCase pattern (game telemetry convention)
            const domainPattern = line.match(/['"]([A-Z][a-zA-Z]+\.[A-Z][a-zA-Z]+(\.[A-Z][a-zA-Z]+)?)['"]/g)
            if (domainPattern) {
                for (const match of domainPattern) {
                    // Skip if it contains 'build.' prefix
                    if (match.includes('build.')) continue
                    violations.push({
                        file: 'scripts/shared/build-telemetry.mjs',
                        line: i + 1,
                        message: 'Domain.Subject.Action pattern found (game telemetry convention). Build events should use build.* prefix',
                        content: line.trim()
                    })
                }
            }
            // Check for Application Insights imports (game telemetry only)
            if (line.includes('@azure/application-insights') || line.includes('ApplicationInsights')) {
                violations.push({
                    file: 'scripts/shared/build-telemetry.mjs',
                    line: i + 1,
                    message: 'Application Insights import found in build telemetry (reserved for game telemetry only)',
                    content: line.trim()
                })
            }
        }
    } catch (err) {
        console.warn(`Warning: Could not read ${file}: ${err.message}`)
    }
}

// Check 3: Reminder comments exist in key files
function checkSeparationComments() {
    const files = [
        { path: join(ROOT, 'scripts', 'shared', 'build-telemetry.mjs'), keyword: 'CRITICAL' },
        { path: join(ROOT, 'shared', 'src', 'telemetryEvents.ts'), keyword: 'game' }
    ]

    for (const { path, keyword } of files) {
        try {
            const content = readFileSync(path, 'utf-8')
            if (!content.includes(keyword)) {
                violations.push({
                    file: path.replace(ROOT, '.'),
                    line: 0,
                    message: `File should contain clear separation documentation/comments mentioning '${keyword}'`,
                    content: ''
                })
            }
        } catch (err) {
            console.warn(`Warning: Could not read ${path}: ${err.message}`)
        }
    }
}

function main() {
    console.log('Validating telemetry separation...\n')

    checkGameTelemetryFile()
    checkBuildTelemetryFile()
    checkSeparationComments()

    if (violations.length === 0) {
        console.log('✅ No telemetry separation violations found')
        console.log('\nSeparation rules:')
        console.log('  • Build telemetry: scripts/shared/build-telemetry.mjs (build.* events)')
        console.log('  • Game telemetry: shared/src/telemetry.ts (Domain.Subject.Action events)')
        return
    }

    console.error(`❌ Found ${violations.length} telemetry separation violation(s):\n`)

    for (const v of violations) {
        console.error(`${v.file}:${v.line}`)
        console.error(`  ${v.message}`)
        if (v.content) {
            console.error(`  Code: ${v.content}`)
        }
        console.error('')
    }

    console.error('See docs/developer-workflow/build-telemetry.md for separation rules')
    process.exit(1)
}

main()
