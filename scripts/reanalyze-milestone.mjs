#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { buildCanonicalDescription, generateMilestoneDescription } from './lib/milestone-delivery-description.mjs'

export { buildCanonicalDescription, generateMilestoneDescription }

function parseArgs(argv) {
    const args = {
        repo: undefined,
        milestone: undefined,
        all: false,
        state: 'all',
        apply: false,
        print: false,
        strict: false,
        verbose: false
    }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--repo') {
            args.repo = argv[++i]
            continue
        }
        if (arg === '--milestone' || arg === '--milestoneNumber') {
            args.milestone = Number(argv[++i])
            continue
        }
        if (arg === '--all') {
            args.all = true
            continue
        }
        if (arg === '--state') {
            args.state = argv[++i]
            continue
        }
        if (arg === '--apply' || arg === '--write') {
            args.apply = true
            continue
        }
        if (arg === '--print') {
            args.print = true
            continue
        }
        if (arg === '--strict') {
            args.strict = true
            continue
        }
        if (arg === '--verbose') {
            args.verbose = true
            continue
        }
        if (arg === '--help' || arg === '-h') {
            args.help = true
            continue
        }
        throw new Error(`Unknown arg: ${arg}`)
    }

    return args
}

function usage() {
    return `Usage:
  node scripts/reanalyze-milestone.mjs --repo <owner/repo> (--milestone <number> | --all [--state <open|closed|all>]) [--print] [--apply] [--strict]

Examples:
  # Preview a single milestone
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --milestone 14 --print

  # Apply to a single milestone
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --milestone 14 --apply

  # Bulk preview all milestones
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --all --state all --print

  # Bulk apply all milestones
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --all --state all --apply

Notes:
  - Uses GitHub CLI (gh). If milestone PATCH fails with 403 due to env token precedence,
    the script will retry with GITHUB_TOKEN/GH_TOKEN removed.
  - Strict mode fails if dependency conflicts, dependency-order violations, or external blockers remain.
`
}

function removeEnvTokenPrecedence(env) {
    const nextEnv = { ...env }
    delete nextEnv.GITHUB_TOKEN
    delete nextEnv.GH_TOKEN
    return nextEnv
}

function runGh(args, { env, verbose }) {
    const result = spawnSync('gh', args, {
        env,
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024
    })

    if (verbose) {
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

function isToken403(result) {
    return (
        result.status !== 0 &&
        (result.stdout.includes('Resource not accessible by personal access token') ||
            result.stderr.includes('Resource not accessible by personal access token') ||
            result.stdout.includes('HTTP 403') ||
            result.stderr.includes('HTTP 403'))
    )
}

function runGhWithFallback(args, { verbose }) {
    const primary = runGh(args, { env: process.env, verbose })
    if (primary.ok) return primary
    if (!isToken403(primary)) return primary

    const fallback = runGh(args, { env: removeEnvTokenPrecedence(process.env), verbose })
    if (fallback.ok) return fallback

    return {
        ...primary,
        stderr: primary.stderr + (fallback.stderr && fallback.stderr !== primary.stderr ? `\n--- fallback stderr ---\n${fallback.stderr}` : ''),
        stdout: primary.stdout + (fallback.stdout && fallback.stdout !== primary.stdout ? `\n--- fallback stdout ---\n${fallback.stdout}` : '')
    }
}

function fetchJson(args, verbose) {
    const result = runGhWithFallback(args, { verbose })
    if (!result.ok) {
        throw new Error(result.stderr || result.stdout)
    }
    return JSON.parse(result.stdout)
}

function fetchMilestones(repo, state, verbose) {
    return fetchJson(['api', `repos/${repo}/milestones?state=${state}&per_page=100`], verbose).map((milestone) => ({
        number: milestone.number,
        title: milestone.title,
        state: milestone.state,
        description: milestone.description ?? ''
    }))
}

function fetchMilestone(repo, milestoneNumber, verbose) {
    const milestone = fetchJson(['api', `repos/${repo}/milestones/${milestoneNumber}`], verbose)
    return {
        number: milestone.number,
        title: milestone.title,
        state: milestone.state,
        description: milestone.description ?? ''
    }
}

function fetchMilestoneIssues(repo, milestoneNumber, verbose) {
    const rawIssues = fetchJson(['api', '-X', 'GET', '--paginate', `repos/${repo}/issues`, '-f', `milestone=${milestoneNumber}`, '-f', 'state=all'], verbose)
    return rawIssues
        .filter((issue) => !issue.pull_request)
        .map((issue) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            state_reason: issue.state_reason ?? null,
            body: issue.body ?? '',
            labels: (issue.labels ?? []).map((label) => label.name)
        }))
}

function fetchIssueBlockedBy(repo, issueNumber, verbose) {
    return fetchJson(['api', `repos/${repo}/issues/${issueNumber}/dependencies/blocked_by`], verbose).map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        milestoneNumber: issue.milestone?.number ?? null
    }))
}

function hydrateIssueDependencies(repo, issues, verbose) {
    return issues.map((issue) => ({
        ...issue,
        blockedBy: fetchIssueBlockedBy(repo, issue.number, verbose)
    }))
}

function applyMilestoneDescription(repo, milestoneNumber, description, verbose) {
    const tempFile = path.join(os.tmpdir(), `milestone-${milestoneNumber}-description.txt`)
    fs.writeFileSync(tempFile, description, 'utf8')

    const patchResult = runGhWithFallback(['api', '-X', 'PATCH', `repos/${repo}/milestones/${milestoneNumber}`, '-F', `description=@${tempFile}`], {
        verbose
    })

    if (!patchResult.ok) {
        throw new Error(patchResult.stderr || patchResult.stdout)
    }
}

export function computeUpdatedDescription({ repo, milestone, issues }) {
    return generateMilestoneDescription({ repo, milestone, issues })
}

function processMilestone({ repo, milestone, apply, print, strict, verbose }) {
    const hydratedIssues = hydrateIssueDependencies(repo, fetchMilestoneIssues(repo, milestone.number, verbose), verbose)
    const { updatedDescription, summary } = computeUpdatedDescription({ repo, milestone, issues: hydratedIssues })
    const changed = updatedDescription.trimEnd() !== (milestone.description ?? '').trimEnd()

    console.error(JSON.stringify({ ...summary, milestone: milestone.number, title: milestone.title, changed, willApply: apply }, null, 2))

    if (strict && (summary.dependencyConflicts.length > 0 || summary.dependencyViolations.length > 0 || summary.externalBlocked.length > 0)) {
        throw new Error(
            `Strict validation failed for milestone #${milestone.number}: conflicts=${summary.dependencyConflicts.length}, violations=${summary.dependencyViolations.length}, externalBlocked=${summary.externalBlocked.length}`
        )
    }

    if (print) {
        console.log(updatedDescription)
    }

    if (apply && changed) {
        applyMilestoneDescription(repo, milestone.number, updatedDescription, verbose)
        console.error(`Updated milestone #${milestone.number} (${milestone.title}).`)
    }

    return { milestone: milestone.number, title: milestone.title, changed }
}

function main() {
    const args = parseArgs(process.argv.slice(2))

    if (args.help) {
        console.log(usage())
        process.exit(0)
    }

    if (!args.repo) throw new Error('Missing --repo <owner/repo>')
    if (args.all && !['open', 'closed', 'all'].includes(args.state)) throw new Error('Invalid --state; use open, closed, or all')
    if (!args.all && (!args.milestone || Number.isNaN(args.milestone))) throw new Error('Missing/invalid --milestone <number>')

    const milestones = args.all ? fetchMilestones(args.repo, args.state, args.verbose) : [fetchMilestone(args.repo, args.milestone, args.verbose)]
    const results = []

    for (const milestone of milestones) {
        results.push(
            processMilestone({
                repo: args.repo,
                milestone,
                apply: args.apply,
                print: args.print && !args.all,
                strict: args.strict,
                verbose: args.verbose
            })
        )
    }

    if (args.all) {
        console.error(
            JSON.stringify(
                {
                    milestonesConsidered: results.length,
                    updatedCount: results.filter((result) => result.changed).length,
                    results
                },
                null,
                2
            )
        )
    }
}

function isEntrypoint() {
    if (!process.argv[1]) return false
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
