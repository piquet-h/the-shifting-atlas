#!/usr/bin/env node
/* eslint-env node */

/**
 * Verifies that TODO comments in source code are aligned with GitHub issues.
 *
 * Rules:
 * 1. Every TODO in runtime source (.ts, .tsx) MUST reference an issue: TODO(#NNN)
 * 2. TODOs referencing closed issues are flagged as stale
 * 3. TODOs in scripts/ and test files are exempt from the issue-reference requirement
 *    but stale references are still flagged
 *
 * Modes:
 *   --local    Skip GitHub API calls (syntax-only check; default when no GITHUB_TOKEN)
 *   --json     Output JSON instead of human-readable
 *   --fix-dry  Show what issue references could be added (informational)
 *
 * Environment:
 *   GITHUB_TOKEN or GH_TOKEN — used for issue state lookups (optional for local mode)
 *   VERIFY_TODO_ROOT — override repo root detection
 */

import { execSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

// --- Config ---

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.mjs']
const EXEMPT_PATHS = [/node_modules/, /dist\//, /\.d\.ts$/, /package-lock\.json$/]
// Paths where TODO without issue ref is allowed (warning, not error)
const SOFT_EXEMPT_PATHS = [/scripts\//, /test\//, /\.test\./, /\.spec\./]
const TODO_PATTERN = /\/\/\s*TODO(?:\(([^)]*)\))?[:\s]*(.*)/gi
const ISSUE_REF_PATTERN = /#(\d+)/

// --- Repo root ---

function findRepoRoot(startDir) {
    let current = startDir
    while (true) {
        if (existsSync(resolve(current, '.github'))) return current
        const parent = dirname(current)
        if (parent === current) return startDir
        current = parent
    }
}

const ROOT = process.env.VERIFY_TODO_ROOT ? resolve(process.env.VERIFY_TODO_ROOT) : findRepoRoot(process.cwd())

// --- File walking ---

function walk(dir, results = []) {
    let entries
    try {
        entries = readdirSync(dir)
    } catch {
        return results
    }
    for (const entry of entries) {
        const full = join(dir, entry)
        if (EXEMPT_PATHS.some((p) => p.test(full))) continue
        let st
        try {
            st = statSync(full)
        } catch {
            continue
        }
        if (st.isDirectory()) {
            walk(full, results)
        } else if (SCAN_EXTENSIONS.some((ext) => full.endsWith(ext))) {
            results.push(full)
        }
    }
    return results
}

// --- GitHub issue lookup ---

function lookupIssueStates(issueNumbers) {
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
    if (!token && !hasGhCli()) return null // local mode

    const states = new Map()
    for (const num of issueNumbers) {
        try {
            const result = execSync(`gh api "repos/piquet-h/the-shifting-atlas/issues/${num}" --jq ".state"`, {
                encoding: 'utf-8',
                timeout: 10000,
                stdio: ['pipe', 'pipe', 'pipe']
            }).trim()
            states.set(num, result)
        } catch {
            states.set(num, 'unknown')
        }
    }
    return states
}

function hasGhCli() {
    try {
        execSync('which gh', { stdio: 'pipe' })
        return true
    } catch {
        return false
    }
}

// --- Main ---

function main() {
    const args = process.argv.slice(2)
    const jsonMode = args.includes('--json')
    const localMode = args.includes('--local')

    const issues = []
    const allIssueRefs = new Set()
    const todoEntries = []

    // Scan files
    const files = walk(ROOT)
    for (const file of files) {
        const relPath = relative(ROOT, file)
        let content
        try {
            content = readFileSync(file, 'utf-8')
        } catch {
            continue
        }

        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            // Reset regex lastIndex for global pattern
            TODO_PATTERN.lastIndex = 0
            let match
            while ((match = TODO_PATTERN.exec(line)) !== null) {
                const annotation = match[1] || '' // content inside TODO(...)
                const description = match[2]?.trim() || ''
                const lineNum = i + 1

                // Skip KQL todouble() false positives
                if (/todouble/i.test(line) && !annotation) continue

                const issueMatch = annotation.match(ISSUE_REF_PATTERN) || description.match(ISSUE_REF_PATTERN)
                const issueNum = issueMatch ? parseInt(issueMatch[1], 10) : null
                const isSoftExempt = SOFT_EXEMPT_PATHS.some((p) => p.test(relPath))

                todoEntries.push({
                    file: relPath,
                    line: lineNum,
                    annotation,
                    description,
                    issueNum,
                    isSoftExempt
                })

                if (issueNum) {
                    allIssueRefs.add(issueNum)
                } else if (!isSoftExempt) {
                    issues.push({
                        type: 'missing-issue-ref',
                        file: relPath,
                        line: lineNum,
                        text: description,
                        severity: 'error'
                    })
                } else {
                    issues.push({
                        type: 'missing-issue-ref',
                        file: relPath,
                        line: lineNum,
                        text: description,
                        severity: 'warning'
                    })
                }
            }
        }
    }

    // Check issue states (unless local mode)
    let issueStates = null
    if (!localMode && allIssueRefs.size > 0) {
        issueStates = lookupIssueStates(allIssueRefs)
    }

    if (issueStates) {
        for (const entry of todoEntries) {
            if (!entry.issueNum) continue
            const state = issueStates.get(entry.issueNum)
            if (state === 'closed') {
                issues.push({
                    type: 'stale-issue-ref',
                    file: entry.file,
                    line: entry.line,
                    issueNum: entry.issueNum,
                    text: entry.description,
                    severity: 'error'
                })
            }
        }
    }

    // Determine pass/fail (errors only; warnings don't fail)
    const errors = issues.filter((i) => i.severity === 'error')
    const warnings = issues.filter((i) => i.severity === 'warning')
    const failed = errors.length > 0

    // Output
    if (jsonMode) {
        const result = {
            status: failed ? 'fail' : 'pass',
            summary: {
                totalTodos: todoEntries.length,
                withIssueRef: todoEntries.filter((e) => e.issueNum).length,
                withoutIssueRef: todoEntries.filter((e) => !e.issueNum).length,
                staleRefs: issues.filter((i) => i.type === 'stale-issue-ref').length,
                apiChecked: issueStates !== null
            },
            errors,
            warnings,
            todos: todoEntries.map((e) => ({
                file: e.file,
                line: e.line,
                issueNum: e.issueNum,
                description: e.description,
                exempt: e.isSoftExempt
            })),
            timestamp: new Date().toISOString()
        }
        process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } else {
        // Human-readable
        if (todoEntries.length === 0) {
            process.stderr.write('[verify-todo] No TODO comments found.\n')
        } else {
            process.stderr.write(
                `[verify-todo] Found ${todoEntries.length} TODOs: ${todoEntries.filter((e) => e.issueNum).length} with issue refs, ${todoEntries.filter((e) => !e.issueNum).length} without.\n`
            )
            if (issueStates) {
                process.stderr.write(`[verify-todo] Checked ${allIssueRefs.size} issue(s) against GitHub API.\n`)
            } else {
                process.stderr.write('[verify-todo] Skipped GitHub API checks (local mode or no auth).\n')
            }
        }

        for (const issue of errors) {
            switch (issue.type) {
                case 'missing-issue-ref':
                    process.stderr.write(
                        `[verify-todo] ERROR ${issue.file}:${issue.line} — TODO without issue reference: "${issue.text}"\n`
                    )
                    break
                case 'stale-issue-ref':
                    process.stderr.write(
                        `[verify-todo] ERROR ${issue.file}:${issue.line} — TODO(#${issue.issueNum}) references CLOSED issue\n`
                    )
                    break
            }
        }

        for (const issue of warnings) {
            process.stderr.write(
                `[verify-todo] WARN  ${issue.file}:${issue.line} — TODO without issue reference (exempt path): "${issue.text}"\n`
            )
        }

        if (failed) {
            process.stderr.write(`[verify-todo] FAIL — ${errors.length} error(s) detected.\n`)
        } else {
            process.stderr.write('[verify-todo] PASS\n')
        }
    }

    process.exit(failed ? 1 : 0)
}

main()
