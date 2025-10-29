#!/usr/bin/env node
/* eslint-env node */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Verification script for instruction files.
 * Checks:
 * 1. Last reviewed freshness (<= 90 days)
 * 2. Deprecated DI patterns file presence & banner
 * 3. Duplicate phrase occurrences across files (high duplication noise)
 * 4. World prompt templates not embedded inline (should be externalized)
 * 5. Presence of Last reviewed marker per file
 */

function findRepoRoot(startDir) {
    let current = startDir
    while (true) {
        const candidate = resolve(current, '.github')
        if (existsSync(candidate)) return current
        const parent = dirname(current)
        if (parent === current) return startDir // fallback
        current = parent
    }
}

const ROOT = findRepoRoot(process.cwd())
const GITHUB_DIR = resolve(ROOT, '.github')
const INSTRUCTIONS_DIR = resolve(GITHUB_DIR, 'instructions')

const MAX_AGE_DAYS = 90
const DUPLICATE_PHRASES = ['Partition keys', 'dual persistence', 'Azure Functions Runtime v4', 'Service Bus', 'Cosmos DB']
// Whitelist: phrases allowed to appear in these relative paths without triggering duplication warning
const PHRASE_WHITELIST = {
    'Service Bus': ['.github/copilot-instructions.md', '.github/instructions/backend/.instructions.md'],
    'Cosmos DB': ['.github/copilot-instructions.md', '.github/instructions/backend/.instructions.md']
}
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
    const issues = []
    let failed = false
    const files = listInstructionFiles()

    const phraseOccurrences = Object.fromEntries(DUPLICATE_PHRASES.map((p) => [p, []]))

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
            issues.push({ type: 'missingLastReviewed', file: relativeToRoot(file) })
        } else {
            const age = daysSince(lr)
            if (age > MAX_AGE_DAYS) {
                issues.push({ type: 'stale', file: relativeToRoot(file), ageDays: age, lastReviewed: lr })
                failed = true
            }
        }

        // Deprecated DI patterns file check
        if (file.endsWith('inversify-di-patterns.md') && !/DEPRECATION NOTICE/i.test(content)) {
            issues.push({ type: 'deprecationBannerMissing', file: relativeToRoot(file) })
            failed = true
        }

        // World prompt inline check
        if (file.endsWith('world/.instructions.md')) {
            for (const starter of WORLD_INLINE_PROMPT_STARTERS) {
                if (content.includes(starter)) {
                    issues.push({ type: 'inlinePrompt', file: relativeToRoot(file), starter })
                    failed = true
                }
            }
        }

        // Phrase duplication counts
        for (const phrase of DUPLICATE_PHRASES) {
            if (content.includes(phrase)) phraseOccurrences[phrase].push(relativeToRoot(file))
        }
    }

    // Duplication report with whitelist consideration
    for (const [phrase, filesWithPhrase] of Object.entries(phraseOccurrences)) {
        const count = filesWithPhrase.length
        if (count > 3) {
            const whitelist = PHRASE_WHITELIST[phrase] || []
            const allWhitelisted = filesWithPhrase.every((f) => whitelist.includes(f))
            if (!allWhitelisted) {
                issues.push({ type: 'duplication', phrase, count, files: filesWithPhrase })
            }
        }
    }

    const jsonMode = process.argv.includes('--json') || process.env.VERIFY_INSTRUCTIONS_JSON === '1'
    if (jsonMode) {
        const result = {
            status: failed ? 'fail' : 'pass',
            issues,
            root: ROOT,
            timestamp: new Date().toISOString()
        }
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        process.exit(failed ? 1 : 0)
    }

    // Human-readable output
    for (const issue of issues) {
        switch (issue.type) {
            case 'missingLastReviewed':
                process.stderr.write(`[verify-instructions] WARN missing Last reviewed marker: ${issue.file}\n`)
                break
            case 'stale':
                process.stderr.write(
                    `[verify-instructions] STALE (${issue.ageDays}d) ${issue.file} (last reviewed ${issue.lastReviewed})\n`
                )
                break
            case 'deprecationBannerMissing':
                process.stderr.write('[verify-instructions] MISSING deprecation banner in inversify-di-patterns.md\n')
                break
            case 'inlinePrompt':
                process.stderr.write(
                    `[verify-instructions] INLINE PROMPT FOUND ("${issue.starter}") in ${issue.file} – use worldTemplates.ts\n`
                )
                break
            case 'duplication':
                process.stderr.write(
                    `[verify-instructions] DUPLICATION: phrase "${issue.phrase}" appears in ${issue.count} files: ${issue.files.join(
                        ', '
                    )} (consider slimming)\n`
                )
                break
        }
    }

    if (failed) {
        process.stderr.write('[verify-instructions] FAIL – issues detected.\n')
        process.exit(1)
    }
    process.stdout.write('[verify-instructions] PASS – all checks OK.\n')
}

main()

function relativeToRoot(absPath) {
    return absPath.startsWith(ROOT) ? absPath.slice(ROOT.length + 1) : absPath
}
