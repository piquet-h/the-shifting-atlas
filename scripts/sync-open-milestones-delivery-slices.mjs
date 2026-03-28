#!/usr/bin/env node
/**
 * Sync open milestone descriptions deterministically from milestone membership
 * and formal GitHub issue dependencies.
 */

import { pathToFileURL } from 'node:url'

import { ensureDescriptionHasDeliverySlices } from './ensure-milestone-has-delivery-slices.mjs'

// Node 22 provides a global `fetch`, but ESLint may not be configured with that global.
const { fetch } = globalThis

function parseArgs(argv) {
    const args = {
        repo: undefined,
        apply: false,
        dryRun: false,
        verbose: false
    }

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--repo') {
            args.repo = argv[++i]
            continue
        }
        if (a === '--apply') {
            args.apply = true
            continue
        }
        if (a === '--dry-run' || a === '--dryRun') {
            args.dryRun = true
            continue
        }
        if (a === '--verbose') {
            args.verbose = true
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
  node scripts/sync-open-milestones-delivery-slices.mjs --repo <owner/repo> (--dry-run|--apply) [--verbose]

Env:
  GITHUB_TOKEN required
`
}

function isEntrypoint() {
    if (!process.argv[1]) return false
    return import.meta.url === pathToFileURL(process.argv[1]).href
}

function requireEnv(name) {
    const v = process.env[name]
    if (!v) throw new Error(`Missing required env var: ${name}`)
    return v
}

function ghHeaders() {
    return {
        Authorization: `Bearer ${requireEnv('GITHUB_TOKEN')}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    }
}

async function ghGetJson(url) {
    const res = await fetch(url, { headers: ghHeaders() })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(`GitHub GET failed ${res.status} ${res.statusText}: ${text}`)
    }
    return await res.json()
}

async function ghPatchJson(url, body) {
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`GitHub PATCH failed ${res.status} ${res.statusText}: ${text}`)
    }

    return await res.json()
}

function repoApiBase(repo) {
    const [owner, name] = repo.split('/')
    if (!owner || !name) throw new Error(`Invalid --repo value: ${repo}`)
    return { base: `https://api.github.com/repos/${owner}/${name}` }
}

async function listOpenMilestones({ base }) {
    // 100 is plenty for this repo; if it ever grows, paginate.
    const milestones = await ghGetJson(`${base}/milestones?state=open&per_page=100`)
    return (milestones ?? []).map((m) => ({
        number: m.number,
        title: m.title,
        description: m.description ?? ''
    }))
}

async function listMilestoneIssues({ base, milestoneNumber }) {
    const all = []
    let page = 1

    while (true) {
        const url = `${base}/issues?milestone=${milestoneNumber}&state=all&per_page=100&page=${page}`
        const batch = await ghGetJson(url)

        const issuesOnly = (batch ?? [])
            .filter((i) => !i.pull_request)
            .map((i) => ({
                number: i.number,
                title: i.title,
                state: i.state,
                state_reason: i.state_reason ?? null,
                body: i.body ?? '',
                labels: (i.labels ?? []).map((label) => label.name)
            }))

        all.push(...issuesOnly)
        if (!batch || batch.length < 100) break
        page++
    }

    return all
}

async function fetchIssueBlockedBy({ base, issueNumber }) {
    const deps = await ghGetJson(`${base}/issues/${issueNumber}/dependencies/blocked_by`)
    return deps.map((issue) => ({
        number: issue.number,
        title: issue.title,
        state: issue.state,
        milestoneNumber: issue.milestone?.number ?? null
    }))
}

async function hydrateIssueDependencies({ base, issues }) {
    const hydrated = []
    for (const issue of issues) {
        hydrated.push({
            ...issue,
            blockedBy: await fetchIssueBlockedBy({ base, issueNumber: issue.number })
        })
    }
    return hydrated
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        console.log(usage())
        process.exit(0)
    }

    if (!args.repo) throw new Error('Missing --repo <owner/repo>')
    if (!args.apply && !args.dryRun) throw new Error('Specify either --apply or --dry-run')

    const { base } = repoApiBase(args.repo)
    const openMilestones = await listOpenMilestones({ base })

    const results = []

    for (const m of openMilestones) {
        const issues = await hydrateIssueDependencies({ base, issues: await listMilestoneIssues({ base, milestoneNumber: m.number }) })

        const updated = ensureDescriptionHasDeliverySlices({
            repo: args.repo,
            milestoneNumber: m.number,
            description: m.description,
            milestoneTitle: m.title,
            issues
        })

        const changed = updated.trimEnd() !== (m.description ?? '').trimEnd()

        results.push({ milestone: m.number, title: m.title, changed })

        if (args.verbose || args.dryRun) {
            // Keep output compact for Actions logs.
            console.error(
                JSON.stringify(
                    {
                        milestone: m.number,
                        title: m.title,
                        openIssues: issues.filter((i) => i.state === 'open').length,
                        changed
                    },
                    null,
                    2
                )
            )
        }

        if (args.apply && changed) {
            await ghPatchJson(`${base}/milestones/${m.number}`, { description: updated })
        }
    }

    console.error(
        JSON.stringify(
            {
                openMilestonesConsidered: openMilestones.length,
                updatedCount: results.filter((r) => r.changed).length,
                results
            },
            null,
            2
        )
    )
}

if (isEntrypoint()) {
    main().catch((err) => {
        console.error(err?.stack || String(err))
        process.exit(1)
    })
}
