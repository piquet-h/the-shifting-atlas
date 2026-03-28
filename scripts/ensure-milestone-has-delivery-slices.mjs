#!/usr/bin/env node

import { pathToFileURL } from 'node:url'

import { buildDeliverySlicesTemplate, generateMilestoneDescription, hasDeliverySlices } from './lib/milestone-delivery-description.mjs'

const { fetch } = globalThis

export { buildDeliverySlicesTemplate, hasDeliverySlices }

export function ensureDescriptionHasDeliverySlices({ repo, milestoneNumber, description, milestoneTitle, issues }) {
    return generateMilestoneDescription({
        repo,
        milestone: {
            number: milestoneNumber ?? 0,
            title: milestoneTitle,
            state: 'open',
            description: description ?? ''
        },
        issues
    }).updatedDescription
}

function parseArgs(argv) {
    const args = {
        repo: undefined,
        milestone: undefined,
        apply: false,
        dryRun: false
    }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]
        if (arg === '--repo') {
            args.repo = argv[++i]
            continue
        }
        if (arg === '--milestone') {
            args.milestone = Number(argv[++i])
            continue
        }
        if (arg === '--apply') {
            args.apply = true
            continue
        }
        if (arg === '--dry-run' || arg === '--dryRun') {
            args.dryRun = true
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
  node scripts/ensure-milestone-has-delivery-slices.mjs --repo <owner/repo> --milestone <number> (--dry-run|--apply)

Env:
  GITHUB_TOKEN required
`
}

function requireEnv(name) {
    const value = process.env[name]
    if (!value) throw new Error(`Missing required env var: ${name}`)
    return value
}

function isEntrypoint() {
    if (!process.argv[1]) return false
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
    const response = await fetch(url, { headers: ghHeaders() })
    if (!response.ok) throw new Error(`GitHub GET failed ${response.status}: ${await response.text()}`)
    return await response.json()
}

async function ghPatchJson(url, body) {
    const response = await fetch(url, {
        method: 'PATCH',
        headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    if (!response.ok) throw new Error(`GitHub PATCH failed ${response.status}: ${await response.text()}`)
    return await response.json()
}

async function listMilestoneIssues({ base, milestoneNumber }) {
    const all = []
    let page = 1

    while (true) {
        const batch = await ghGetJson(`${base}/issues?milestone=${milestoneNumber}&state=all&per_page=100&page=${page}`)
        const issuesOnly = (batch ?? [])
            .filter((issue) => !issue.pull_request)
            .map((issue) => ({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                state_reason: issue.state_reason ?? null,
                body: issue.body ?? '',
                labels: (issue.labels ?? []).map((label) => label.name)
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

    if (!args.repo) throw new Error('Missing --repo')
    if (!args.milestone || Number.isNaN(args.milestone)) throw new Error('Missing/invalid --milestone')
    if (!args.apply && !args.dryRun) throw new Error('Specify --dry-run or --apply')

    const { base } = repoApiBase(args.repo)
    const milestone = await ghGetJson(`${base}/milestones/${args.milestone}`)
    const hydratedIssues = await hydrateIssueDependencies({ base, issues: await listMilestoneIssues({ base, milestoneNumber: args.milestone }) })

    const updatedDescription = ensureDescriptionHasDeliverySlices({
        repo: args.repo,
        milestoneNumber: args.milestone,
        description: milestone.description ?? '',
        milestoneTitle: milestone.title,
        issues: hydratedIssues
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
