#!/usr/bin/env node
/**
 * Ensures a milestone description contains a Delivery slices section.
 *
 * Why: GitHub has no native milestone templates.
 * This script provides a deterministic template so other automation (like
 * update-open-milestones-on-issue-closed) can rewrite per-slice Order blocks.
 */

import { pathToFileURL } from 'node:url'

// Node 22 provides a global `fetch`, but ESLint may not be configured with that global.
const { fetch } = globalThis

export function hasDeliverySlices(description) {
    return /^##\s+Delivery slices\b/m.test(description)
}

export function buildDeliverySlicesTemplate({ milestoneTitle, issues }) {
    const openIssues = (issues ?? [])
        .filter((i) => i.state === 'open')
        .slice()
        .sort((a, b) => a.number - b.number)

    const lines = []
    lines.push('## Delivery slices')
    lines.push('')
    lines.push(`### Slice 1 — ${milestoneTitle}`)
    lines.push('')
    lines.push('Order:')

    if (openIssues.length === 0) {
        lines.push('- (add issues, then reorder)')
    } else {
        for (let idx = 0; idx < openIssues.length; idx++) {
            const i = openIssues[idx]
            lines.push(`${idx + 1}. #${i.number} ${i.title}`)
        }
    }

    return lines.join('\n')
}

export function ensureDescriptionHasDeliverySlices({ description, milestoneTitle, issues }) {
    const base = (description ?? '').trimEnd()
    if (hasDeliverySlices(base)) return base

    const template = buildDeliverySlicesTemplate({ milestoneTitle, issues })

    if (!base) return template
    return `${base}\n\n${template}`
}

function parseArgs(argv) {
    const args = {
        repo: undefined,
        milestone: undefined,
        apply: false,
        dryRun: false
    }

    for (let i = 0; i < argv.length; i++) {
        const a = argv[i]
        if (a === '--repo') {
            args.repo = argv[++i]
            continue
        }
        if (a === '--milestone') {
            args.milestone = Number(argv[++i])
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
  node scripts/ensure-milestone-has-delivery-slices.mjs --repo <owner/repo> --milestone <number> (--dry-run|--apply)

Env:
  GITHUB_TOKEN required
`
}

function requireEnv(name) {
    const v = process.env[name]
    if (!v) throw new Error(`Missing required env var: ${name}`)
    return v
}

function isEntrypoint() {
    return import.meta.url === pathToFileURL(process.argv[1]).href
}

function repoApiBase(repo) {
    const [owner, name] = repo.split('/')
    if (!owner || !name) throw new Error(`Invalid --repo value: ${repo}`)
    return { base: `https://api.github.com/repos/${owner}/${name}` }
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
    if (!res.ok) throw new Error(`GitHub GET failed ${res.status}: ${await res.text()}`)
    return await res.json()
}

async function ghPatchJson(url, body) {
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    if (!res.ok) throw new Error(`GitHub PATCH failed ${res.status}: ${await res.text()}`)
    return await res.json()
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

    if (!args.repo) throw new Error('Missing --repo')
    if (!args.milestone || Number.isNaN(args.milestone)) throw new Error('Missing/invalid --milestone')
    if (!args.apply && !args.dryRun) throw new Error('Specify --dry-run or --apply')

    const { base } = repoApiBase(args.repo)

    const milestone = await ghGetJson(`${base}/milestones/${args.milestone}`)
    const issues = await listMilestoneIssues({ base, milestoneNumber: args.milestone })

    const updatedDescription = ensureDescriptionHasDeliverySlices({
        description: milestone.description ?? '',
        milestoneTitle: milestone.title,
        issues
    })

    if (args.dryRun) {
        console.log(updatedDescription)
        return
    }

    if (args.apply) {
        await ghPatchJson(`${base}/milestones/${args.milestone}`, { description: updatedDescription })
    }
}

if (isEntrypoint()) {
    main().catch((err) => {
        console.error(err?.stack || String(err))
        process.exit(1)
    })
}
