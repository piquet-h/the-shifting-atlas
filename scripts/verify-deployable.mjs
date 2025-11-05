#!/usr/bin/env node
/* eslint-env node */
/* global process */
// Verifies deployable artifacts exist for SWA + Functions AND validates package references.
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const checks = [
    { path: 'frontend/dist/index.html', required: true, desc: 'Frontend bundle (index.html)' },
    { path: 'frontend/dist/staticwebapp.config.json', required: true, desc: 'Static Web App config' }
]

// Validate backend package.json for file-based references (forbidden pattern)
function validateBackendPackageJson() {
    const pkgPath = resolve(process.cwd(), 'backend/package.json')
    if (!existsSync(pkgPath)) {
        process.stderr.write('[verify-deployable] WARNING: backend/package.json not found, skipping validation\n')
        return true
    }

    try {
        const content = readFileSync(pkgPath, 'utf8')
        const parsed = JSON.parse(content)
        const dependencies = { ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) }

        const violations = []
        for (const [name, version] of Object.entries(dependencies)) {
            if (typeof version === 'string' && version.startsWith('file:')) {
                violations.push({ name, version })
            }
        }

        if (violations.length > 0) {
            process.stderr.write('[verify-deployable] FORBIDDEN: File-based package references detected:\n')
            violations.forEach(({ name, version }) => {
                process.stderr.write(`  ❌ ${name}: ${version}\n`)
            })
            process.stderr.write('  Use registry references instead (e.g., "@piquet-h/shared": "^0.3.5")\n')
            process.stderr.write('  See .github/copilot-instructions.md Section 12.1\n')
            return false
        }

        process.stdout.write('[verify-deployable] OK: Package references use registry (no file: patterns)\n')
        return true
    } catch (err) {
        process.stderr.write(`[verify-deployable] ERROR validating backend/package.json: ${err.message}\n`)
        return false
    }
}

// Ensure shared seed file has not been reintroduced (Option 2 canonical backend seed).
function ensureNoSharedSeedFile() {
    const seedPath = resolve(process.cwd(), 'shared/src/data/villageLocations.json')
    if (existsSync(seedPath)) {
        process.stderr.write(
            '[verify-deployable] FORBIDDEN: shared/src/data/villageLocations.json exists. Backend seed is canonical; remove duplicate.\n'
        )
        return false
    }
    process.stdout.write('[verify-deployable] OK: No duplicate shared seed file present.\n')
    return true
}

let failed = !validateBackendPackageJson()
failed = !ensureNoSharedSeedFile() || failed

for (const c of checks) {
    const full = resolve(process.cwd(), c.path)
    if (!existsSync(full)) {
        process.stderr.write(`[verify-deployable] MISSING: ${c.desc} -> ${c.path}\n`)
        failed = true
        continue
    }
    try {
        const s = statSync(full)
        if (!s.isFile()) {
            process.stderr.write(`[verify-deployable] NOT A FILE: ${c.path}\n`)
            failed = true
        } else {
            process.stdout.write(`[verify-deployable] OK: ${c.desc}\n`)
        }
    } catch (e) {
        process.stderr.write(`[verify-deployable] ERROR reading ${c.path}: ${e.message}\n`)
        failed = true
    }
}

if (failed) {
    process.stderr.write('[verify-deployable] One or more required artifacts are missing.\n')
    process.exit(1)
}
process.stdout.write('[verify-deployable] All required deployment artifacts present.\n')
