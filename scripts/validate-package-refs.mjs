#!/usr/bin/env node

/**
 * Validate that backend/package.json uses registry references, not file-based references.
 * This prevents CI/deployment failures caused by file:../shared patterns that only work locally.
 *
 * Exit codes:
 * 0 - All validations passed
 * 1 - File-based reference detected (forbidden pattern)
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, '..')

const BACKEND_PACKAGE_JSON = join(rootDir, 'backend', 'package.json')

function validatePackageJson(filePath) {
    let content
    try {
        content = readFileSync(filePath, 'utf8')
    } catch (err) {
        console.error(`❌ Could not read ${filePath}: ${err.message}`)
        process.exit(1)
    }

    let parsed
    try {
        parsed = JSON.parse(content)
    } catch (err) {
        console.error(`❌ Invalid JSON in ${filePath}: ${err.message}`)
        process.exit(1)
    }

    const dependencies = parsed.dependencies || {}
    const devDependencies = parsed.devDependencies || {}
    const allDeps = { ...dependencies, ...devDependencies }

    const violations = []

    for (const [name, version] of Object.entries(allDeps)) {
        // Check for file: protocol references (forbidden)
        if (typeof version === 'string' && version.startsWith('file:')) {
            violations.push({ name, version })
        }
    }

    if (violations.length > 0) {
        console.error(`\n❌ VALIDATION FAILED: File-based package references detected in ${filePath}\n`)
        console.error('The following dependencies use file: protocol (forbidden in CI/deployment):\n')
        violations.forEach(({ name, version }) => {
            console.error(`  - ${name}: ${version}`)
        })
        console.error('\n⚠️  File-based references only work locally. Use registry references instead:')
        console.error('  ✅ CORRECT:   "@piquet-h/shared": "^0.3.5"')
        console.error('  ❌ FORBIDDEN: "@piquet-h/shared": "file:../shared"\n')
        console.error('See .github/copilot-instructions.md Section 12.1 for full policy.\n')
        process.exit(1)
    }

    console.log(`✅ All dependencies in ${filePath} use valid registry references`)
}

// Run validation
console.log('Validating package references...\n')
validatePackageJson(BACKEND_PACKAGE_JSON)
console.log('\n✅ All package reference validations passed')
