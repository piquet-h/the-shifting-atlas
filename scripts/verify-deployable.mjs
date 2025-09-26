#!/usr/bin/env node
/* eslint-env node */
/* global process */
// Verifies deployable artifacts exist for SWA + Functions.
import {existsSync, statSync} from 'node:fs'
import {resolve} from 'node:path'

const checks = [
    {path: 'frontend/dist/index.html', required: true, desc: 'Frontend bundle (index.html)'},
    {path: 'frontend/dist/staticwebapp.config.json', required: true, desc: 'Static Web App config'},
    {path: 'frontend/api/host.json', required: true, desc: 'Functions host.json (api root deployment)'},
    {path: 'frontend/api/node_modules/@atlas/shared/dist/index.js', required: true, desc: 'Vendored shared package'},
    {path: 'frontend/api/node_modules/@azure/functions/package.json', required: true, desc: 'Azure Functions runtime dependency'},
    {path: 'frontend/api/node_modules/applicationinsights/package.json', required: true, desc: 'App Insights SDK dependency'}
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
            // Extra symlink guard for vendored shared
            if (c.path.includes('@atlas/shared')) {
                const dirStat = statSync(resolve(process.cwd(), 'frontend/api/node_modules/@atlas/shared'))
                if (dirStat.isSymbolicLink()) {
                    process.stderr.write('[verify-deployable] Vendored shared is still a symlink!\n')
                    failed = true
                } else {
                    process.stdout.write(`[verify-deployable] OK: ${c.desc}\n`)
                }
            } else {
                process.stdout.write(`[verify-deployable] OK: ${c.desc}\n`)
            }
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
