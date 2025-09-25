#!/usr/bin/env node
// Verifies deployable artifacts exist for SWA + Functions.
import {existsSync, statSync} from 'node:fs'
import {resolve} from 'node:path'

const checks = [
    {path: 'frontend/dist/index.html', required: true, desc: 'Frontend bundle (index.html)'},
    {path: 'frontend/dist/staticwebapp.config.json', required: true, desc: 'Static Web App config'},
    {path: 'frontend/api/dist/host.json', required: true, desc: 'Functions host.json'}
]

let failed = false
for (const c of checks) {
    const full = resolve(process.cwd(), c.path)
    if (!existsSync(full)) {
        console.error(`[verify-deployable] MISSING: ${c.desc} -> ${c.path}`)
        failed = true
        continue
    }
    try {
        const s = statSync(full)
        if (!s.isFile()) {
            console.error(`[verify-deployable] NOT A FILE: ${c.path}`)
            failed = true
        } else {
            console.log(`[verify-deployable] OK: ${c.desc}`)
        }
    } catch (e) {
        console.error(`[verify-deployable] ERROR reading ${c.path}:`, e.message)
        failed = true
    }
}

if (failed) {
    console.error('[verify-deployable] One or more required artifacts are missing.')
    process.exit(1)
}
console.log('[verify-deployable] All required deployment artifacts present.')
