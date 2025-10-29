#!/usr/bin/env node
/* eslint-env node */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Verification script for instruction files.
 * Checks:
 * 1. Last reviewed freshness (<= 90 days)
 * 2. Deprecated DI patterns file presence & banner
 * 3. Duplicate phrase occurrences across files (high duplication noise)
 * 4. World prompt templates not embedded inline (should be externalized)
 * 5. Presence of Last reviewed marker per file
 */

const ROOT = process.cwd()
const GITHUB_DIR = resolve(ROOT, '.github')
const INSTRUCTIONS_DIR = resolve(GITHUB_DIR, 'instructions')

const MAX_AGE_DAYS = 90
const DUPLICATE_PHRASES = ['Partition keys', 'dual persistence', 'Azure Functions Runtime v4', 'Service Bus', 'Cosmos DB']
const WORLD_INLINE_PROMPT_STARTERS = ['Generate a [terrain_type] location', 'Generate dialogue for [npc_name]', 'Create a [quest_type]']

function listInstructionFiles() {
    const coreFiles = [
        'copilot-instructions.md',
        'copilot-quickref.md',
        'copilot-language-style.md',
        'copilot-commit-message-instructions.md'
    ].map((f) => resolve(GITHUB_DIR, f))

    const moduleFiles = []
    function walk(dir) {
        const entries = readdirSync(dir)
        for (const e of entries) {
            const full = join(dir, e)
            const st = statSync(full)
            if (st.isDirectory()) walk(full)
            else if (e.endsWith('.md')) moduleFiles.push(full)
        }
    }
    walk(INSTRUCTIONS_DIR)
    return [...coreFiles, ...moduleFiles]
}

function parseLastReviewed(content) {
    const m = content.match(/Last reviewed:\s*(\d{4}-\d{2}-\d{2})/)
    return m ? m[1] : null
}

function daysSince(dateStr) {
    const then = new Date(dateStr + 'T00:00:00Z')
    const now = new Date()
    return Math.floor((now - then) / (1000 * 60 * 60 * 24))
}

function main() {
    let failed = false
    const files = listInstructionFiles()

    const phraseCounts = Object.fromEntries(DUPLICATE_PHRASES.map((p) => [p, 0]))

    for (const file of files) {
        let content
        try {
            content = readFileSync(file, 'utf8')
        } catch (e) {
            process.stderr.write(`[verify-instructions] ERROR reading ${file}: ${e.message}\n`)
            failed = true
            continue
        }

        // Last reviewed check
        const lr = parseLastReviewed(content)
        if (!lr) {
            process.stderr.write(`[verify-instructions] WARN missing Last reviewed marker: ${file}\n`)
        } else {
            const age = daysSince(lr)
            if (age > MAX_AGE_DAYS) {
                process.stderr.write(`[verify-instructions] STALE (${age}d) ${file} (last reviewed ${lr})\n`)
                failed = true
            }
        }

        // Deprecated DI patterns file check
        if (file.endsWith('inversify-di-patterns.md')) {
            if (!/DEPRECATION NOTICE/i.test(content)) {
                process.stderr.write('[verify-instructions] MISSING deprecation banner in inversify-di-patterns.md\n')
                failed = true
            }
        }

        // World prompt inline check
        if (file.endsWith('world/.instructions.md')) {
            for (const starter of WORLD_INLINE_PROMPT_STARTERS) {
                if (content.includes(starter)) {
                    process.stderr.write(
                        `[verify-instructions] INLINE PROMPT FOUND (“${starter}”) should be externalized in worldTemplates.ts\n`
                    )
                    failed = true
                }
            }
        }

        // Phrase duplication counts
        for (const phrase of DUPLICATE_PHRASES) {
            if (content.includes(phrase)) phraseCounts[phrase]++
        }
    }

    // Duplication report
    for (const [phrase, count] of Object.entries(phraseCounts)) {
        if (count > 3) {
            // threshold; appears broadly
            process.stderr.write(
                `[verify-instructions] DUPLICATION: phrase “${phrase}” appears in ${count} instruction files (consider slimming)\n`
            )
        }
    }

    if (failed) {
        process.stderr.write('[verify-instructions] FAIL – issues detected.\n')
        process.exit(1)
    } else {
        process.stdout.write('[verify-instructions] PASS – all checks OK.\n')
    }
}

main()
