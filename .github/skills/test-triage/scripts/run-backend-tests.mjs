#!/usr/bin/env node
/*
 * Skill helper: run backend tests with a stable interface.
 */

/* global process, console */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../../')
const backendRoot = path.join(repoRoot, 'backend')

function getNpmCommand() {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function usage() {
    console.log(`Run backend tests\n\nUsage:\n  node .github/skills/test-triage/scripts/run-backend-tests.mjs [--scope unit|integration|all|e2e]\n\nNotes:\n  - Default scope is unit.\n  - e2e requires Cosmos configuration and may take a long time.\n`)
}

function parseArgs(argv) {
    let scope = 'unit'
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--help' || arg === '-h') return { help: true }
        if (arg === '--scope' && i + 1 < argv.length) {
            scope = argv[i + 1]
            i++
        }
    }
    return { help: false, scope }
}

function npmScriptForScope(scope) {
    switch (scope) {
        case 'unit':
            return 'test:unit'
        case 'integration':
            return 'test:integration'
        case 'e2e':
            return 'test:e2e'
        case 'all':
            return 'test'
        default:
            return null
    }
}

async function main() {
    const parsed = parseArgs(process.argv.slice(2))
    if (parsed.help) {
        usage()
        process.exit(0)
    }

    const script = npmScriptForScope(parsed.scope)
    if (!script) {
        console.error(`Invalid --scope: ${parsed.scope}`)
        usage()
        process.exit(2)
    }

    const npm = getNpmCommand()
    const child = spawn(npm, ['run', script], {
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
