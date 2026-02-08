#!/usr/bin/env node
/**
 * Sync open milestone delivery-slices descriptions.
 *
 * Triggered by issue events (milestoned/demilestoned/edited/closed/reopened) to prevent drift:
 * - Adds missing open issues into an Order list
 * - Removes closed issues from Order lists
 * - Refreshes titles in Order lists
 *
 * Deterministic: no AI, no reordering beyond preserving existing order and appending missing issues.
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
                state: i.state
            }))

        all.push(...issuesOnly)
        if (!batch || batch.length < 100) break
        page++
    }

    return all
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
        const issues = await listMilestoneIssues({ base, milestoneNumber: m.number })

        const updated = ensureDescriptionHasDeliverySlices({
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
