#!/usr/bin/env node
/* eslint-env node */
/* global process */
// Verifies deployable artifacts exist for SWA + Functions.
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const checks = [
    { path: 'frontend/dist/index.html', required: true, desc: 'Frontend bundle (index.html)' },
    { path: 'frontend/dist/staticwebapp.config.json', required: true, desc: 'Static Web App config' }
]

let failed = false
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
