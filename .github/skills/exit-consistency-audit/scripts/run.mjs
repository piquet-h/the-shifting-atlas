#!/usr/bin/env node
/* global process, console */
/*
 * Skill wrapper: Exit consistency audit
 *
 * Purpose:
 * - Provide a stable, documented entrypoint for running `scripts/scan-exits-consistency.mjs`
 * - Optionally ensure build artifacts exist before scanning
 */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../../')

const scanScript = path.join(repoRoot, 'scripts', 'scan-exits-consistency.mjs')
const backendDistMarker = path.join(repoRoot, 'backend', 'dist', 'src', 'persistenceConfig.js')
const sharedDistMarker = path.join(repoRoot, 'shared', 'dist', 'domainModels.js')

function getNpmCommand() {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function getNodeCommand() {
    return process.execPath
}

function usage() {
    // Intentionally minimal: this is primarily invoked by agents.
    console.log(`Exit consistency audit wrapper\n\nUsage:\n  node .github/skills/exit-consistency-audit/scripts/run.mjs [--build] [--output=report.json] [--seed-locations=loc1,loc2]\n\nNotes:\n  - Requires Cosmos persistence mode (Gremlin).\n  - Needs backend/shared build artifacts; pass --build to generate them.\n`)
}

function parseArgs(argv) {
    const passthrough = []
    let build = false

    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            return { help: true, build: false, passthrough: [] }
        }
        if (arg === '--build') {
            build = true
            continue
        }
        passthrough.push(arg)
    }

    return { help: false, build, passthrough }
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
    const { help, build, passthrough } = parseArgs(process.argv.slice(2))
    if (help) {
        usage()
        process.exit(0)
    }

    if (!existsSync(scanScript)) {
        console.error(`Missing scanner script: ${scanScript}`)
        process.exit(2)
    }

    const needsBuild = !existsSync(backendDistMarker) || !existsSync(sharedDistMarker)
    if (needsBuild) {
        if (!build) {
            console.error('Build artifacts missing for exit scan.')
            console.error(`Expected: ${backendDistMarker}`)
            console.error(`Expected: ${sharedDistMarker}`)
            console.error('Fix: run `npm run build:shared` and `npm run build:backend`, or rerun with --build.')
            process.exit(2)
        }

        console.error('Building prerequisites (shared + backend)...')
        await run(getNpmCommand(), ['run', 'build:shared'], repoRoot)
        await run(getNpmCommand(), ['run', 'build:backend'], repoRoot)
    }

    const node = getNodeCommand()
    const args = [scanScript, ...passthrough]

    const child = spawn(node, args, {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env
    })

    child.on('exit', (code) => process.exit(code ?? 1))
}

main().catch((err) => {
    console.error(err?.message ?? String(err))
    process.exit(2)
})
