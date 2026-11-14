#!/usr/bin/env node
/* eslint-env node */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

function findRepoRoot(startDir) {
    let current = startDir
    while (true) {
        const candidate = resolve(current, '.github')
        if (existsSync(candidate)) return current
        const parent = dirname(current)
        if (parent === current) return startDir
        current = parent
    }
}

const ROOT = process.env.VERIFY_DOCS_POLICY_ROOT ? resolve(process.env.VERIFY_DOCS_POLICY_ROOT) : findRepoRoot(process.cwd())
const DOCS_INSTRUCTIONS = resolve(ROOT, '.github/instructions/docs.instructions.md')
const TARGET_PATH_PREFIXES = ['docs/design-modules/', 'docs/concept/']
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'playwright-report', '.deploy'])

const ARCHITECTURE_DETAIL_PATTERNS = [
    /\bcosmos\s*db\b/i,
    /\bpartition\s+key\b/i,
    /\bservice\s+bus\b/i,
    /\bqueue\s+trigger\b/i,
    /\bhttp\s+trigger\b/i,
    /\bapplication\s+insights\b/i,
    /\bmanaged\s+identity\b/i,
    /\b@azure\//i,
    /\bfunction\s+app\b/i,
    /\btelemetryevents\.ts\b/i,
    /\bgame_event_names\b/i
]

function parsePlanningTermsFromInstructions(content) {
    const marker = 'Planning/leakage indicator verbs'
    const idx = content.indexOf(marker)
    if (idx === -1) return []

    const tail = content.slice(idx)
    const codeMatch = tail.match(/`([^`]+)`/)
    if (!codeMatch) return []

    return codeMatch[1]
        .split(',')
        .map((term) => term.trim().toLowerCase())
        .filter(Boolean)
}

function listAllRepoMarkdownFiles() {
    const files = []

    function walk(dir) {
        for (const entry of readdirSync(dir)) {
            if (IGNORED_DIRS.has(entry)) continue
            const full = join(dir, entry)
            const st = statSync(full)
            if (st.isDirectory()) {
                walk(full)
            } else if (entry.endsWith('.md')) {
                files.push(full)
            }
        }
    }

    walk(ROOT)
    return files
}

function analyzeBrokenLinks(absPath, relPath, content) {
    const issues = []
    const lines = content.split(/\r?\n/)
    let inCodeFence = false
    const linkRx = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()
        if (trimmed.startsWith('```')) {
            inCodeFence = !inCodeFence
            continue
        }
        if (inCodeFence) continue

        // Ignore inline backtick code spans on the line so prose examples like `[foo](./bar.md)` don't false-positive
        const withoutInlineCode = line.replace(/`[^`]*`/g, '')
        for (const match of withoutInlineCode.matchAll(linkRx)) {
            const rawTarget = match[1].trim()
            if (!rawTarget || rawTarget.startsWith('#') || /^[a-z]+:/i.test(rawTarget) || rawTarget.startsWith('/')) {
                continue
            }
            const cleanTarget = rawTarget.split('#')[0].split('?')[0].trim()
            if (!cleanTarget) continue
            const resolvedTarget = resolve(dirname(absPath), cleanTarget)
            if (!existsSync(resolvedTarget)) {
                issues.push({
                    type: 'broken-link',
                    file: relPath,
                    line: i + 1,
                    term: rawTarget,
                    excerpt: trimmed.slice(0, 180)
                })
            }
        }
    }

    return issues
}

function isTargetDoc(relPath) {
    return TARGET_PATH_PREFIXES.some((prefix) => relPath.startsWith(prefix))
}

function lineHasTerm(line, term) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'i')
    return regex.test(line)
}

function analyzeFile(relPath, content, planningTerms) {
    const issues = []
    const lines = content.split(/\r?\n/)
    let inCodeFence = false

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const trimmed = line.trim()

        if (trimmed.startsWith('```')) {
            inCodeFence = !inCodeFence
            continue
        }

        if (inCodeFence) continue

        for (const term of planningTerms) {
            if (lineHasTerm(line, term)) {
                issues.push({
                    type: 'planning-leakage',
                    file: relPath,
                    line: i + 1,
                    term,
                    excerpt: trimmed.slice(0, 180)
                })
            }
        }

        if (/^\s*-\s*\[[ xX]\]/.test(line)) {
            issues.push({
                type: 'inline-checklist',
                file: relPath,
                line: i + 1,
                term: 'checklist',
                excerpt: trimmed.slice(0, 180)
            })
        }

        if (/\bacceptance\s+criteria\b/i.test(line)) {
            issues.push({
                type: 'acceptance-criteria',
                file: relPath,
                line: i + 1,
                term: 'acceptance criteria',
                excerpt: trimmed.slice(0, 180)
            })
        }

        for (const pattern of ARCHITECTURE_DETAIL_PATTERNS) {
            if (pattern.test(line)) {
                issues.push({
                    type: 'architecture-detail',
                    file: relPath,
                    line: i + 1,
                    term: pattern.source,
                    excerpt: trimmed.slice(0, 180)
                })
            }
        }
    }

    return issues
}

function groupCounts(issues) {
    const counts = {}
    for (const issue of issues) {
        counts[issue.type] = (counts[issue.type] || 0) + 1
    }
    return counts
}

function main() {
    const args = new Set(process.argv.slice(2))
    const jsonMode = args.has('--json') || process.env.VERIFY_DOCS_POLICY_JSON === '1'
    const strictMode = args.has('--strict') || process.env.VERIFY_DOCS_POLICY_STRICT === '1'
    const checkLinks = args.has('--check-links') || process.env.VERIFY_DOCS_POLICY_LINKS === '1'

    const instructions = readFileSync(DOCS_INSTRUCTIONS, 'utf8')
    const planningTerms = parsePlanningTermsFromInstructions(instructions)

    if (planningTerms.length === 0) {
        process.stderr.write('[verify-docs-policy] ERROR: could not parse planning/leakage terms from docs instructions.\n')
        process.exit(1)
    }

    const files = listAllRepoMarkdownFiles()
    const issues = []

    for (const absPath of files) {
        const relPath = relative(ROOT, absPath).replace(/\\/g, '/')
        const content = readFileSync(absPath, 'utf8')
        if (isTargetDoc(relPath)) {
            issues.push(...analyzeFile(relPath, content, planningTerms))
        }
        if (checkLinks) {
            issues.push(...analyzeBrokenLinks(absPath, relPath, content))
        }
    }

    const counts = groupCounts(issues)
    const status = issues.length === 0 ? 'pass' : strictMode ? 'fail' : 'warn'
    const result = {
        status,
        mode: strictMode ? 'strict' : 'warn',
        issues,
        counts,
        scannedTargets: checkLinks ? [...TARGET_PATH_PREFIXES, '**/*.md (links)'] : TARGET_PATH_PREFIXES,
        timestamp: new Date().toISOString()
    }

    if (jsonMode) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
        process.exit(strictMode && issues.length > 0 ? 1 : 0)
    }

    process.stdout.write(
        `[verify-docs-policy] scanned ${TARGET_PATH_PREFIXES.join(', ')} — found ${issues.length} potential policy issue(s).\n`
    )

    if (issues.length > 0) {
        const maxPrint = 80
        const toPrint = issues.slice(0, maxPrint)
        for (const issue of toPrint) {
            process.stderr.write(`[verify-docs-policy] WARN ${issue.type} ${issue.file}:${issue.line} :: ${issue.excerpt || issue.term}\n`)
        }
        if (issues.length > maxPrint) {
            process.stderr.write(
                `[verify-docs-policy] WARN ... ${issues.length - maxPrint} additional issue(s) omitted (use --json for full output).\n`
            )
        }
    }

    process.stdout.write(`[verify-docs-policy] counts: ${JSON.stringify(counts)}\n`)

    if (strictMode && issues.length > 0) {
        process.stderr.write('[verify-docs-policy] FAIL (strict mode) — policy issues detected.\n')
        process.exit(1)
    }

    process.stdout.write(`[verify-docs-policy] ${strictMode ? 'STRICT' : 'WARN-ONLY'} mode complete.\n`)
    process.exit(0)
}

main()
