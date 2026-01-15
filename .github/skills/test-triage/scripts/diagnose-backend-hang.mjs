#!/usr/bin/env node
/*
 * Skill helper: diagnose backend test hangs.
 *
 * Delegates to backend/test-diagnose.mjs which runs unit tests and then prints
 * why-is-node-running diagnostics.
 */

/* global process, console */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../../')
const backendRoot = path.join(repoRoot, 'backend')
const diagnoseScript = path.join(backendRoot, 'test-diagnose.mjs')

function usage() {
    console.log(`Diagnose backend test hangs\n\nUsage:\n  node .github/skills/test-triage/scripts/diagnose-backend-hang.mjs\n\nNotes:\n  - Runs backend unit tests and reports active Node handles.\n`)
}

async function main() {
    const args = process.argv.slice(2)
    if (args.includes('--help') || args.includes('-h')) {
        usage()
        process.exit(0)
    }

    if (!existsSync(diagnoseScript)) {
        console.error(`Missing backend diagnose script: ${diagnoseScript}`)
        process.exit(2)
    }

    const node = process.execPath
    const child = spawn(node, [diagnoseScript], {
        cwd: backendRoot,
        stdio: 'inherit',
        env: process.env
    })

    child.on('exit', (code) => process.exit(code ?? 1))
}

main().catch((err) => {
    console.error(err?.message ?? String(err))
    process.exit(2)
})
