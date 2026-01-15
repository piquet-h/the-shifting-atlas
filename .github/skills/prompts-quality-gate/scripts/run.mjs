#!/usr/bin/env node
/*
 * Skill wrapper: Prompts quality gate
 */

/* global process, console */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../../')

const validateScript = path.join(repoRoot, 'scripts', 'validate-prompts.mjs')
const bundleScript = path.join(repoRoot, 'scripts', 'bundle-prompts.mjs')
const sharedDistSchemaMarker = path.join(repoRoot, 'shared', 'dist', 'prompts', 'schema.js')

function getNpmCommand() {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm'
}

function getNodeCommand() {
    return process.execPath
}

function usage() {
    console.log(`Prompts quality gate wrapper\n\nUsage:\n  node .github/skills/prompts-quality-gate/scripts/run.mjs [--build] [--validate-only] [--bundle-only] [--output <path>]\n\nNotes:\n  - Requires shared build artifacts (shared/dist).\n  - Default behavior is validate then bundle.\n`)
}

function parseArgs(argv) {
    let build = false
    let validateOnly = false
    let bundleOnly = false
    const bundleArgs = []

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--help' || arg === '-h') return { help: true }
        if (arg === '--build') {
            build = true
            continue
        }
        if (arg === '--validate-only') {
            validateOnly = true
            continue
        }
        if (arg === '--bundle-only') {
            bundleOnly = true
            continue
        }
        if (arg === '--output' && i + 1 < argv.length) {
            bundleArgs.push('--output', argv[i + 1])
            i++
            continue
        }

        // Unknown args are forwarded to the bundler (for future extensibility)
        bundleArgs.push(arg)
    }

    // Normalize mutually-exclusive flags.
    if (validateOnly) bundleOnly = false
    if (bundleOnly) validateOnly = false

    return { help: false, build, validateOnly, bundleOnly, bundleArgs }
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

    if (!existsSync(validateScript) || !existsSync(bundleScript)) {
        console.error('Missing prompts scripts. Expected:')
        console.error(`- ${validateScript}`)
        console.error(`- ${bundleScript}`)
        process.exit(2)
    }

    const needsBuild = !existsSync(sharedDistSchemaMarker)
    if (needsBuild) {
        if (!parsed.build) {
            console.error('Shared build artifacts missing for prompts validation/bundling.')
            console.error(`Expected: ${sharedDistSchemaMarker}`)
            console.error('Fix: run `npm run build:shared`, or rerun with --build.')
            process.exit(2)
        }

        console.error('Building shared prerequisites...')
        await run(getNpmCommand(), ['run', 'build:shared'], repoRoot)
    }

    const node = getNodeCommand()

    if (!parsed.bundleOnly) {
        await run(node, [validateScript], repoRoot)
    }

    if (!parsed.validateOnly) {
        await run(node, [bundleScript, ...parsed.bundleArgs], repoRoot)
    }
}

main().catch((err) => {
    console.error(err?.message ?? String(err))
    process.exit(2)
})
