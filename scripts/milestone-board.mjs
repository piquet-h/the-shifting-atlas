#!/usr/bin/env node
/* eslint-env node */

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

import {
    STATE_LABELS,
    buildClaimComment,
    computeMilestoneSnapshot,
    evaluateReadinessAndBuildVerifier,
    planStoppedRunClaimRelease,
    rankOpenMilestones
} from './lib/milestone-board.mjs'

function resolveToken() {
    if (process.env.GH_TOKEN) return process.env.GH_TOKEN
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
    try {
        return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
    } catch {
        return ''
    }
}

async function ghApi(repo, path, { method = 'GET', token, body } = {}) {
    const headers = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'the-shifting-atlas-milestone-board'
    }
    if (token) headers.Authorization = `Bearer ${token}`
    if (body) headers['Content-Type'] = 'application/json'

    const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {})
    })
    if (res.status === 404) return null
    if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`GitHub API ${method} ${path} failed (${res.status}): ${text}`)
    }
    if (res.status === 204) return {}
    return res.json()
}

async function ghPaginate(repo, pathWithQuery, token) {
    const items = []
    for (let page = 1; page <= 10; page++) {
        const sep = pathWithQuery.includes('?') ? '&' : '?'
        const batch = await ghApi(repo, `${pathWithQuery}${sep}per_page=100&page=${page}`, { token })
        if (!Array.isArray(batch) || batch.length === 0) break
        items.push(...batch)
        if (batch.length < 100) break
    }
    return items
}

function parseArgs(argv) {
    const [command = 'snapshot', ...rest] = argv
    const opts = {
        command,
        repo: process.env.GITHUB_REPOSITORY || 'piquet-h/the-shifting-atlas',
        apply: false,
        max: undefined,
        milestone: undefined,
        worker: 1,
        runId: undefined,
        attempt: 1
    }
    for (let i = 0; i < rest.length; i++) {
        const arg = rest[i]
        if (arg === '--apply') opts.apply = true
        else if (arg === '--repo' && rest[i + 1]) opts.repo = rest[++i]
        else if (arg === '--max' && rest[i + 1]) opts.max = Number(rest[++i])
        else if (arg === '--milestone' && rest[i + 1]) opts.milestone = Number(rest[++i])
        else if (arg === '--worker' && rest[i + 1]) opts.worker = Number(rest[++i])
        else if (arg === '--run-id' && rest[i + 1]) opts.runId = Number(rest[++i])
        else if (arg === '--attempt' && rest[i + 1]) opts.attempt = Number(rest[++i])
    }
    return opts
}

async function ensureLabels(repo, token, apply) {
    for (const spec of Object.values(STATE_LABELS)) {
        const existing = await ghApi(repo, `/labels/${encodeURIComponent(spec.name)}`, { token })
        if (existing) {
            console.log(`[milestone-board] Label exists: ${spec.name}`)
            continue
        }
        if (!apply) {
            console.log(`[milestone-board] (dry-run) Would create label ${spec.name} (#${spec.color})`)
            continue
        }
        await ghApi(repo, '/labels', {
            method: 'POST',
            token,
            body: spec
        })
        console.log(`[milestone-board] Created label: ${spec.name}`)
    }
}

async function loadTargetMilestoneSnapshot(repo, token, milestoneNumberOverride) {
    const openMilestones = await ghPaginate(repo, '/milestones?state=open', token)
    const ranked = rankOpenMilestones(openMilestones)
    const target = milestoneNumberOverride ? openMilestones.find((m) => Number(m.number) === Number(milestoneNumberOverride)) : ranked[0]

    if (!target) {
        return { ranked, snapshot: null }
    }

    const milestoneIssues = await ghPaginate(repo, `/issues?milestone=${target.number}&state=all`, token)

    // Hydrate formal GitHub blocked_by dependencies for open executable issues
    await Promise.all(
        milestoneIssues
            .filter((i) => !i.pull_request && i.state === 'open')
            .map(async (issue) => {
                const blockers = await ghApi(repo, `/issues/${issue.number}/dependencies/blocked_by`, { token }).catch(() => null)
                if (Array.isArray(blockers)) {
                    issue.blockedBy = blockers.map((b) => b.number).filter(Boolean)
                }
            })
    )

    const snapshot = computeMilestoneSnapshot({
        milestone: target,
        issues: milestoneIssues
    })
    return { ranked, snapshot }
}

function renderSnapshotMarkdown(ranked, snapshot) {
    if (!snapshot) {
        return '### Milestone Delivery Board\n\n_No open milestones with active issues found._\n'
    }

    const lines = [
        `### Milestone Delivery Board — ${snapshot.milestone.title} (#${snapshot.milestone.number})`,
        '',
        `- **Milestone queue**: ${ranked.map((m) => `\`${m.title}\` (${m.open_issues} open)`).join(' → ')}`,
        `- **WIP capacity**: In Progress \`${snapshot.capacity.inProgressCount}/${snapshot.capacity.inProgressLimit}\` (${snapshot.capacity.inProgressFree} free) • Ready \`${snapshot.capacity.readyCount}/${snapshot.capacity.readyLimit}\` (${snapshot.capacity.readyFree} free)`,
        '',
        '| Column | Count | Top Issues (Slice Order) |',
        '| :--- | :---: | :--- |'
    ]

    for (const [label, list] of [
        ['Testing (`state:testing`)', snapshot.columns.testing],
        ['In Progress (`state:in-progress`)', snapshot.columns.inProgress],
        ['Ready (`state:ready`)', snapshot.columns.ready],
        ['New (`state:new` / unlabeled)', snapshot.columns.new]
    ]) {
        const preview =
            list.length === 0
                ? '_(empty)_'
                : list
                      .slice(0, 5)
                      .map((i) => `#${i.number} ${i.title}`)
                      .join('<br>')
        lines.push(`| ${label} | ${list.length} | ${preview} |`)
    }

    lines.push(
        '',
        `- **Eligible to Build next**: ${snapshot.pullToBuild.length > 0 ? snapshot.pullToBuild.map((i) => `#${i.number}`).join(', ') : '_(none)_'}`,
        `- **Eligible to Refine next**: ${snapshot.pullToRefine.length > 0 ? snapshot.pullToRefine.map((i) => `#${i.number}`).join(', ') : '_(none)_'}`,
        ''
    )
    return lines.join('\n')
}

async function runRefine(opts, token) {
    const { snapshot } = await loadTargetMilestoneSnapshot(opts.repo, token, opts.milestone)
    if (!snapshot) {
        console.log('[milestone-board] No target milestone available for refinement.')
        return
    }
    const maxItems = opts.max ?? 2
    const candidates = snapshot.pullToRefine.slice(0, maxItems)
    console.log(`[milestone-board] Refining ${candidates.length} candidate(s) in ${snapshot.milestone.title} (apply=${opts.apply})...`)

    for (const issue of candidates) {
        const outcome = evaluateReadinessAndBuildVerifier(issue)
        if (!outcome.ready) {
            const holdLabels = [...new Set([...(issue.labels ?? []).map((l) => l.name), STATE_LABELS.needsDiscussion.name])]
            console.log(`[milestone-board] Holding #${issue.number} (${outcome.reason})`)
            if (opts.apply) {
                await ghApi(opts.repo, `/issues/${issue.number}`, {
                    method: 'PATCH',
                    token,
                    body: { labels: holdLabels }
                })
                await ghApi(opts.repo, `/issues/${issue.number}/comments`, {
                    method: 'POST',
                    token,
                    body: { body: outcome.note }
                })
            }
            continue
        }

        console.log(`[milestone-board] Promoting #${issue.number} -> ${STATE_LABELS.ready.name} (${outcome.verifier.kind})`)
        if (opts.apply) {
            await ghApi(opts.repo, `/issues/${issue.number}`, {
                method: 'PATCH',
                token,
                body: {
                    body: outcome.updatedBody,
                    labels: outcome.nextLabels
                }
            })
        }
    }
}

async function runDispatchReady(opts, token) {
    const { snapshot } = await loadTargetMilestoneSnapshot(opts.repo, token, opts.milestone)
    if (!snapshot) {
        console.log('[milestone-board] No target milestone available for dispatch.')
        return
    }

    const maxItems = opts.max ?? 1
    const candidates = snapshot.pullToBuild
    if (candidates.length === 0) {
        console.log('[milestone-board] No unblocked state:ready items within WIP limits.')
        return
    }

    // Offset selection by worker index so parallel workers target distinct slice candidates first
    const startIdx = Math.max(0, (opts.worker - 1) * maxItems)
    const slice = candidates.slice(startIdx, startIdx + maxItems)
    const runId = opts.runId || Number(process.env.GITHUB_RUN_ID || 0)
    const attempt = opts.attempt || Number(process.env.GITHUB_RUN_ATTEMPT || 1)

    for (const issue of slice) {
        // Re-fetch fresh issue state before claiming to avoid worker races
        const fresh = await ghApi(opts.repo, `/issues/${issue.number}`, { token })
        const freshLabels = (fresh?.labels ?? []).map((l) => l.name)
        if (!freshLabels.includes(STATE_LABELS.ready.name)) {
            console.log(`[milestone-board] Skipping #${issue.number}: already claimed by peer worker.`)
            continue
        }

        const nextLabels = freshLabels.filter((n) => !n.startsWith('state:'))
        nextLabels.push(STATE_LABELS.inProgress.name)
        const claimBody = buildClaimComment({
            runId,
            runAttempt: attempt,
            worker: opts.worker,
            owner: 'milestone-sweep'
        })

        console.log(`[milestone-board] Claiming #${issue.number} -> ${STATE_LABELS.inProgress.name} (apply=${opts.apply})`)
        if (!opts.apply) continue

        await ghApi(opts.repo, `/issues/${issue.number}`, {
            method: 'PATCH',
            token,
            body: { labels: nextLabels }
        })
        await ghApi(opts.repo, `/issues/${issue.number}/comments`, {
            method: 'POST',
            token,
            body: { body: claimBody }
        })

        const copilotToken = process.env.COPILOT_AGENT_TOKEN || ''
        if (copilotToken) {
            await ghApi(opts.repo, `/issues/${issue.number}/assignees`, {
                method: 'POST',
                token: copilotToken,
                body: {
                    assignees: ['copilot-swe-agent[bot]'],
                    agent_assignment: {
                        target_repo: opts.repo,
                        base_branch: 'main',
                        custom_instructions:
                            `Deliver #${issue.number} as a single atomic npm-workspace PR. ` +
                            `Follow TDD-first, add label "automerge" when ready, and write "Refs #${issue.number}" (never "Fixes #${issue.number}") in the PR body so post-deploy verification controls closure.`
                    }
                }
            }).catch((err) => {
                console.warn(`[milestone-board] Optional Copilot agent assignment skipped for #${issue.number}: ${err.message}`)
            })
        }
    }
}

async function runReleaseClaims(opts, token) {
    if (!opts.runId) {
        throw new Error('release-claims requires --run-id <id>')
    }
    const inProgressIssues = await ghPaginate(
        opts.repo,
        `/issues?state=open&labels=${encodeURIComponent(STATE_LABELS.inProgress.name)}`,
        token
    )
    const openPrs = await ghPaginate(opts.repo, '/pulls?state=open', token)

    for (const issue of inProgressIssues) {
        if (issue.pull_request) continue
        const refRegex = new RegExp(`#${issue.number}\\b`)
        const hasOpenPr = openPrs.some((pr) => refRegex.test(`${pr.title ?? ''}\n${pr.body ?? ''}`))
        const comments = await ghPaginate(opts.repo, `/issues/${issue.number}/comments`, token)
        const plan = planStoppedRunClaimRelease({
            issue,
            comments,
            completedRunId: opts.runId,
            completedAttempt: opts.attempt,
            hasOpenPr
        })
        if (!plan.release) continue

        console.log(`[milestone-board] Releasing stopped claim on #${issue.number} (apply=${opts.apply})`)
        if (!opts.apply) continue

        await ghApi(opts.repo, `/issues/${issue.number}`, {
            method: 'PATCH',
            token,
            body: { labels: plan.nextLabels }
        })
        await ghApi(opts.repo, `/issues/${issue.number}/comments`, {
            method: 'POST',
            token,
            body: { body: plan.releaseComment }
        })
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2))
    const token = resolveToken()

    if (opts.command === 'ensure-labels') {
        await ensureLabels(opts.repo, token, opts.apply)
        return
    }
    if (opts.command === 'snapshot') {
        const { ranked, snapshot } = await loadTargetMilestoneSnapshot(opts.repo, token, opts.milestone)
        const md = renderSnapshotMarkdown(ranked, snapshot)
        process.stdout.write(md)
        if (process.env.GITHUB_STEP_SUMMARY) {
            appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`)
        }
        return
    }
    if (opts.command === 'refine') {
        if (opts.apply) await ensureLabels(opts.repo, token, true)
        await runRefine(opts, token)
        return
    }
    if (opts.command === 'dispatch-ready') {
        if (opts.apply) await ensureLabels(opts.repo, token, true)
        await runDispatchReady(opts, token)
        return
    }
    if (opts.command === 'release-claims') {
        await runReleaseClaims(opts, token)
        return
    }

    throw new Error(`Unknown subcommand "${opts.command}". Expected: snapshot | ensure-labels | refine | dispatch-ready | release-claims`)
}

main().catch((error) => {
    console.error(`[milestone-board] ERROR: ${error.message}`)
    process.exit(1)
})
