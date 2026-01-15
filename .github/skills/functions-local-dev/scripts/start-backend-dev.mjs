#!/usr/bin/env node
/* global process, console */
/*
 * Skill helper: start backend dev loop.
 */

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
    console.log(`Start backend local dev\n\nUsage:\n  node .github/skills/functions-local-dev/scripts/start-backend-dev.mjs [--mode memory|cosmos] [--watch-only]\n\nNotes:\n  - --mode delegates to backend npm scripts use:memory / use:cosmos.\n  - Default runs backend dev loop (tsc watch + func start).\n`)
}

function parseArgs(argv) {
    let mode = null
    let watchOnly = false

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--help' || arg === '-h') return { help: true }
        if (arg === '--watch-only') {
            watchOnly = true
            continue
        }
        if (arg === '--mode' && i + 1 < argv.length) {
            mode = argv[i + 1]
            i++
        }
    }

    return { help: false, mode, watchOnly }
}

async function run(cmd, args, cwd) {
    await new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd,
            stdio: 'inherit',
            env: process.env
        })
        child.on('error', reject)
        child.on('exit', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
        })
    })
}

async function main() {
    const parsed = parseArgs(process.argv.slice(2))
    if (parsed.help) {
        usage()
        process.exit(0)
    }

    const npm = getNpmCommand()

    if (parsed.mode) {
        if (parsed.mode !== 'memory' && parsed.mode !== 'cosmos') {
            console.error(`Invalid --mode: ${parsed.mode}`)
            usage()
            process.exit(2)
        }
        await run(npm, ['run', parsed.mode === 'memory' ? 'use:memory' : 'use:cosmos'], backendRoot)
    }

    const script = parsed.watchOnly ? 'watch' : 'dev'
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
