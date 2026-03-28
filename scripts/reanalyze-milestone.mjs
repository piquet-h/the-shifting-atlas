#!/usr/bin/env node
/**
 * Reanalyze a GitHub milestone "delivery path" and keep its description in sync
 * after CRUD operations on milestone issues.
 *
 * Design goals:
 * - Deterministic output
 * - Conservative placement (unknown gaps are surfaced, not guessed)
 * - Avoid heredocs/quoting issues by using `gh api -F description=@file`
 * - Guard against `GITHUB_TOKEN` precedence causing milestone PATCH 403
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildCanonicalDescription } from './lib/milestone-delivery-description.mjs'

// Re-export for consumers that import from this script directly.
export { buildCanonicalDescription }

function parseArgs(argv) {
    const args = {
        repo: undefined,
        milestone: undefined,
        apply: false,
        print: false,
        verbose: false,
        all: false
    }

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--repo') {
            args.repo = argv[++i]
            continue
        }
        if (a === '--milestone' || a === '--milestoneNumber') {
            args.milestone = Number(argv[++i])
            continue
        }
        if (a === '--apply' || a === '--write') {
            args.apply = true
            continue
        }
        if (a === '--print') {
            args.print = true
            continue
        }
        if (a === '--verbose') {
            args.verbose = true
            continue
        }
        if (a === '--all') {
            args.all = true
            continue
        }
        if (a === '--help' || a === '-h') {
            args.help = true
            continue
        }
        throw new Error(`Unknown arg: ${a}`)
    }

    return args
}

function usage() {
    return `Usage:
  node scripts/reanalyze-milestone.mjs --repo <owner/repo> --milestone <number> [--print] [--apply]
  node scripts/reanalyze-milestone.mjs --repo <owner/repo> --all [--print] [--apply]

Examples:
  # Preview a single milestone
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --milestone 14 --print

  # Apply to a single milestone
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --milestone 14 --apply

  # Bulk preview all open milestones
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --all --print

  # Bulk apply all open milestones
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --all --apply

Notes:
  - Uses GitHub CLI (gh). If milestone PATCH fails with 403 due to env token precedence,
    the script will retry with GITHUB_TOKEN/GH_TOKEN removed.
  - Sub-issues are fetched for milestones with <50 issues to inform dependency ordering.
`
}

function removeEnvTokenPrecedence(env) {
    const e = { ...env }
    delete e.GITHUB_TOKEN
    delete e.GH_TOKEN
    return e
}

function runGh(args, { env, verbose }) {
    const result = spawnSync('gh', args, {
        env,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024
    })

    if (verbose) {
        // Avoid dumping tokens; only print command + exit code.
        console.error(`[gh] gh ${args.join(' ')} (exit ${result.status ?? 'null'})`)
        if (result.stderr) console.error(result.stderr.trimEnd())
    }

    return {
        ok: result.status === 0,
        status: result.status ?? 1,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? ''
    }
}

function isToken403(res) {
    return (
        res.status !== 0 &&
        (res.stdout.includes('Resource not accessible by personal access token') ||
            res.stderr.includes('Resource not accessible by personal access token') ||
            res.stdout.includes('HTTP 403') ||
            res.stderr.includes('HTTP 403'))
    )
}

function runGhWithFallback(args, { verbose }) {
    const primary = runGh(args, { env: process.env, verbose })
    if (primary.ok) return primary

    if (!isToken403(primary)) return primary

    const fallback = runGh(args, { env: removeEnvTokenPrecedence(process.env), verbose })
    if (fallback.ok) return fallback

    // Prefer the original error message, but include the fallback if different.
    const combined = {
        ...primary,
        stderr:
            primary.stderr + (fallback.stderr && fallback.stderr !== primary.stderr ? `\n--- fallback stderr ---\n${fallback.stderr}` : ''),
        stdout:
            primary.stdout + (fallback.stdout && fallback.stdout !== primary.stdout ? `\n--- fallback stdout ---\n${fallback.stdout}` : '')
    }
    return combined
}

/**
 * Fetch sub-issues for a single issue. Returns empty array on 404/error.
 */
function fetchSubIssues(repo, issueNum, { verbose }) {
    const res = runGhWithFallback(['api', `repos/${repo}/issues/${issueNum}/sub_issues`], { verbose })
    if (!res.ok) return []
    try {
        const parsed = JSON.parse(res.stdout)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

/**
 * Fetch sub-issues for all issues in a milestone (only when issue count < 50).
 * Returns Map<issueNumber, Array<{number, title}>>
 */
function fetchSubIssueMap(repo, issues, { verbose }) {
    const subIssuesByNumber = new Map()
    if (issues.length >= 50) return subIssuesByNumber

    for (const issue of issues) {
        const subs = fetchSubIssues(repo, issue.number, { verbose })
        if (subs.length > 0) {
            subIssuesByNumber.set(
                issue.number,
                subs.map((s) => ({ number: s.number, title: s.title }))
            )
        }
    }

    return subIssuesByNumber
}

function fetchMilestoneIssues(repo, milestoneNumber, { verbose }) {
    const issuesRes = runGhWithFallback(
        ['api', '-X', 'GET', '--paginate', `repos/${repo}/issues`, '-f', `milestone=${milestoneNumber}`, '-f', 'state=all'],
        { verbose }
    )
    if (!issuesRes.ok) return { ok: false, error: issuesRes.stderr || issuesRes.stdout }

    const rawIssues = JSON.parse(issuesRes.stdout)
    const issues = rawIssues
        .filter((i) => !i.pull_request)
        .map((i) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            state_reason: i.state_reason ?? null,
            body: i.body,
            labels: (i.labels ?? []).map((l) => l.name)
        }))

    return { ok: true, issues }
}

function applyMilestoneDescription(repo, milestoneNumber, description, { verbose }) {
    const tmpFile = path.join(os.tmpdir(), `milestone-${milestoneNumber}-description.txt`)
    fs.writeFileSync(tmpFile, description, 'utf8')

    return runGhWithFallback(['api', '-X', 'PATCH', `repos/${repo}/milestones/${milestoneNumber}`, '-F', `description=@${tmpFile}`], {
        verbose
    })
}

/**
 * Thin wrapper kept for backward compatibility with tests and external callers.
 * Delegates to buildCanonicalDescription with an empty sub-issue map.
 */
export function computeUpdatedDescription({ repo, milestone, issues }) {
    const { description: updatedDescription, summary } = buildCanonicalDescription({
        repo,
        milestone,
        issues,
        subIssuesByNumber: new Map(),
        existingDescription: milestone.description ?? ''
    })
    return { updatedDescription, summary }
}

function processSingleMilestone(args) {
    const milestoneRes = runGhWithFallback(['api', `repos/${args.repo}/milestones/${args.milestone}`], { verbose: args.verbose })
    if (!milestoneRes.ok) {
        console.error(milestoneRes.stderr || milestoneRes.stdout)
        process.exit(1)
    }

    const milestone = JSON.parse(milestoneRes.stdout)

    const { ok, issues, error } = fetchMilestoneIssues(args.repo, args.milestone, { verbose: args.verbose })
    if (!ok) {
        console.error(error)
        process.exit(1)
    }

    const subIssuesByNumber = fetchSubIssueMap(args.repo, issues, { verbose: args.verbose })

    const { description: updatedDescription, summary } = buildCanonicalDescription({
        repo: args.repo,
        milestone,
        issues,
        subIssuesByNumber,
        existingDescription: milestone.description ?? ''
    })

    console.error(JSON.stringify({ ...summary, willApply: args.apply }, null, 2))

    if (args.print && !args.apply) {
        console.log(updatedDescription)
    }

    if (!args.apply) return

    const patchRes = applyMilestoneDescription(args.repo, args.milestone, updatedDescription, { verbose: args.verbose })
    if (!patchRes.ok) {
        console.error(patchRes.stderr || patchRes.stdout)
        process.exit(1)
    }

    if (args.print) {
        console.log(updatedDescription)
    }

    console.error(`Updated milestone #${args.milestone} (${milestone.title}).`)
}

function processAllMilestones(args) {
    const milestonesRes = runGhWithFallback(['api', '-X', 'GET', '--paginate', `repos/${args.repo}/milestones`, '-f', 'state=open'], {
        verbose: args.verbose
    })
    if (!milestonesRes.ok) {
        console.error(milestonesRes.stderr || milestonesRes.stdout)
        process.exit(1)
    }

    const milestones = JSON.parse(milestonesRes.stdout)
    const results = []

    for (const ms of milestones) {
        const milestone = {
            number: ms.number,
            title: ms.title,
            state: ms.state,
            description: ms.description ?? ''
        }

        const { ok, issues, error } = fetchMilestoneIssues(args.repo, ms.number, { verbose: args.verbose })
        if (!ok) {
            console.error(`Failed to fetch issues for milestone ${ms.number}: ${error}`)
            results.push({ milestone: ms.number, title: ms.title, error: 'fetch-failed' })
            continue
        }

        const subIssuesByNumber = fetchSubIssueMap(args.repo, issues, { verbose: args.verbose })

        const { description: updatedDescription, summary } = buildCanonicalDescription({
            repo: args.repo,
            milestone,
            issues,
            subIssuesByNumber,
            existingDescription: milestone.description
        })

        const changed = updatedDescription.trimEnd() !== milestone.description.trimEnd()
        results.push({ milestone: ms.number, title: ms.title, changed })

        if (args.verbose) {
            console.error(JSON.stringify({ ...summary, willApply: args.apply }, null, 2))
        }

        if (args.print) {
            console.log(`\n# Milestone ${ms.number}: ${ms.title}\n`)
            console.log(updatedDescription)
        }

        if (args.apply && changed) {
            const patchRes = applyMilestoneDescription(args.repo, ms.number, updatedDescription, { verbose: args.verbose })
            if (!patchRes.ok) {
                console.error(`Failed to patch milestone ${ms.number}: ${patchRes.stderr || patchRes.stdout}`)
                results[results.length - 1].patchError = true
            } else {
                console.error(`Updated milestone #${ms.number} (${ms.title}).`)
            }
        }
    }

    console.error(
        JSON.stringify(
            {
                milestonesProcessed: milestones.length,
                changedCount: results.filter((r) => r.changed).length,
                applied: args.apply,
                results: results.map((r) => ({ milestone: r.milestone, title: r.title, changed: r.changed ?? false }))
            },
            null,
            2
        )
    )
}

function main() {
    const args = parseArgs(process.argv.slice(2))

    if (args.help) {
        console.log(usage())
        process.exit(0)
    }

    if (!args.repo) throw new Error('Missing --repo <owner/repo>')

    if (args.all) {
        processAllMilestones(args)
        return
    }

    if (!args.milestone || Number.isNaN(args.milestone)) throw new Error('Missing/invalid --milestone <number>')

    processSingleMilestone(args)
}

function isEntrypoint() {
    // When imported (e.g., from node:test), we must not execute CLI behavior.
    return import.meta.url === pathToFileURL(process.argv[1]).href
}

if (isEntrypoint()) {
    try {
        main()
    } catch (err) {
        console.error(err?.stack || String(err))
        process.exit(1)
    }
}
