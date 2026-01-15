#!/usr/bin/env node
/*
 * Skill helper: detect cross-package changes.
 */

/* global process, console */

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../../../')

function usage() {
    console.log(`Detect cross-package changes\n\nUsage:\n  node .github/skills/shared-release-workflow/scripts/detect-cross-package.mjs [--base <ref>]\n\nDefault:\n  --base main\n\nExit codes:\n  0 - OK (not cross-package)\n  1 - Cross-package detected (shared + backend)\n  2 - Error (git unavailable, invalid args)\n`)
}

function parseArgs(argv) {
    let base = 'main'
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--help' || arg === '-h') return { help: true }
        if (arg === '--base' && i + 1 < argv.length) {
            base = argv[i + 1]
            i++
        }
    }
    return { help: false, base }
}

function gitDiffNames(base) {
    // Use three-dot to compare base...HEAD (merge-base semantics).
    const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    })
    return out
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
}

async function main() {
    const parsed = parseArgs(process.argv.slice(2))
    if (parsed.help) {
        usage()
        process.exit(0)
    }

    let files
    try {
        files = gitDiffNames(parsed.base)
    } catch (err) {
        console.error('Failed to run git diff. Is git available and is this a git repo?')
        console.error(err?.message ?? String(err))
        process.exit(2)
    }

    const touchesShared = files.some((p) => p.startsWith('shared/'))
    const touchesBackend = files.some((p) => p.startsWith('backend/'))

    if (touchesShared && touchesBackend) {
        console.error('CROSS-PACKAGE DETECTED: diff touches both shared/ and backend/.')
        console.error('Rule: split into two PRs (shared publish first, backend integration second).')
        process.exit(1)
    }

    console.log('OK: no shared+backend cross-package diff detected.')
    process.exit(0)
}

main()
