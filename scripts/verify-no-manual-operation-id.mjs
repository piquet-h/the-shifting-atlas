#!/usr/bin/env node
/**
 * Verify no manual operationId insertion outside telemetry helpers
 *
 * This script checks that operationId is not manually set in code outside of
 * the telemetry helper functions. The operationId should only be attached
 * automatically by trackGameEvent/trackGameEventStrict.
 *
 * Usage: node scripts/verify-no-manual-operation-id.mjs
 * Exit code: 0 (success), 1 (violations found)
 */

import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

console.log('🔍 Checking for manual operationId insertion...\n')

// Files to exclude (telemetry helpers where operationId manipulation is allowed)
const excludeFiles = ['backend/src/telemetry.ts', 'shared/src/telemetry.ts', 'frontend/src/services/telemetry.ts']

// Directories to exclude from search
const excludeDirs = ['node_modules', 'dist', '.git', 'coverage', '.azure']

let foundViolations = false

try {
    // Search for "operationId:" in object literals (but exclude test files and telemetry helpers)
    let excludeArgs = excludeDirs.map((dir) => `--exclude-dir=${dir}`).join(' ')
    excludeArgs += ' --exclude="*.test.ts"' // Exclude test files
    excludeArgs += ' --exclude="*.test.tsx"'

    // Check if directories exist before grepping
    const searchDirs = ['backend/src', 'shared/src', 'frontend/src'].filter((dir) => {
        try {
            execSync(`cd "${rootDir}" && test -d ${dir}`, { encoding: 'utf-8' })
            return true
        } catch {
            return false
        }
    })

    if (searchDirs.length === 0) {
        console.log('⚠️  No source directories found to check.')
        process.exit(0)
    }

    const cmd = `cd "${rootDir}" && grep -rn "operationId:" ${searchDirs.join(' ')} ${excludeArgs} --include="*.ts" --include="*.tsx" || true`
    const output = execSync(cmd, { encoding: 'utf-8' })

    if (output.trim()) {
        const lines = output.trim().split('\n')
        const violations = []

        for (const line of lines) {
            // Parse the grep output: filename:linenum:content
            const match = line.match(/^([^:]+):(\d+):(.*)$/)
            if (!match) continue

            const [, filepath, lineNum, content] = match

            // Skip excluded files
            if (excludeFiles.some((f) => filepath.includes(f))) continue

            // Skip lines that are just reading operationId (like type definitions or destructuring)
            if (content.includes('operationId?:') || content.includes('operationId :')) continue
            if (content.includes('// operationId') || content.includes('* operationId')) continue

            // Check if this is actually setting operationId in an object literal or trackGameEvent call
            if (
                content.includes('operationId:') &&
                (content.includes('trackGameEvent') || content.includes('properties') || content.includes('{'))
            ) {
                violations.push(line)
            }
        }

        if (violations.length > 0) {
            foundViolations = true
            console.log('❌ Found manual operationId usage:\n')
            violations.forEach((violation) => console.log(`  ${violation}`))
            console.log()
        }
    }
} catch (error) {
    // grep returns non-zero when no matches found, which is what we want
    if (error.status !== 1) {
        console.error('Error running grep:', error.message)
    }
}

if (foundViolations) {
    console.log('❌ Violations found!')
    console.log('\n💡 Tip: operationId should only be set by trackGameEvent/trackGameEventStrict helpers.')
    console.log('   These helpers automatically attach operationId from Application Insights context.')
    console.log('   Remove manual operationId properties and let the helpers handle it.\n')
    process.exit(1)
} else {
    console.log('✅ No manual operationId insertion found outside telemetry helpers.\n')
    process.exit(0)
}
