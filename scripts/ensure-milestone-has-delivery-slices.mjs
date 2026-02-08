#!/usr/bin/env node
/**
 * Ensures a milestone description contains a Delivery slices section.
 *
 * Why: GitHub has no native milestone templates.
 * This script provides a deterministic template so other automation (like
 * issue-driven syncing) can rewrite per-slice Order blocks.
 */

import { pathToFileURL } from 'node:url'

// Node 22 provides a global `fetch`, but ESLint may not be configured with that global.
const { fetch } = globalThis

const PLACEHOLDER_LINE = '- (add issues, then reorder)'
const INBOX_SLICE_HEADER = 'Slice 0 — Inbox (auto-synced)'

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

function toOpenIssues(issues) {
    return (issues ?? [])
        .filter((i) => i.state === 'open')
        .slice()
        .sort((a, b) => a.number - b.number)
}

function indexIssuesByNumber(issues) {
    const map = new Map()
    for (const i of issues ?? []) map.set(i.number, i)
    return map
}

function findSectionBounds(lines, headerRegex) {
    const start = lines.findIndex((l) => headerRegex.test(l))
    if (start === -1) return null

    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i])) {
            end = i
            break
        }
    }

    return { start, end }
}

function parseDeliverySlices(lines) {
    const bounds = findSectionBounds(lines, /^##\s+Delivery slices\b/)
    if (!bounds) return { bounds: null, slices: [] }

    const slices = []

    for (let i = bounds.start + 1; i < bounds.end; i++) {
        const m = lines[i].match(/^###\s+(Slice\s+\d+\s+—\s+.+)$/)
        if (!m) continue

        const header = m[1]
        const headerIdx = i

        let sliceEnd = bounds.end
        for (let j = headerIdx + 1; j < bounds.end; j++) {
            if (/^###\s+/.test(lines[j]) || /^##\s+/.test(lines[j])) {
                sliceEnd = j
                break
            }
        }

        // Find Order: line within slice.
        let orderIdx = -1
        for (let j = headerIdx + 1; j < sliceEnd; j++) {
            if (/^Order:\s*$/.test(lines[j])) {
                orderIdx = j
                break
            }
        }

        let listStart = -1
        let listEnd = -1
        const orderNumbers = []

        if (orderIdx !== -1) {
            listStart = orderIdx + 1
            while (listStart < sliceEnd && /^\s*$/.test(lines[listStart])) listStart++

            listEnd = listStart
            while (listEnd < sliceEnd) {
                const l = lines[listEnd]
                if (/^\s*$/.test(l)) {
                    listEnd++
                    continue
                }

                const num = l.match(/^\s*\d+\.\s*#(\d+)\b/)
                if (num) {
                    orderNumbers.push(Number(num[1]))
                    listEnd++
                    continue
                }

                if (/^\s*-\s*\(add issues, then reorder\)\s*$/.test(l)) {
                    listEnd++
                    continue
                }

                break
            }
        }

        slices.push({ header, headerIdx, sliceEnd, orderIdx, listStart, listEnd, orderNumbers })
        i = sliceEnd - 1
    }

    return { bounds, slices }
}

function buildOrderBlock({ orderNumbers, issueByNumber }) {
    const lines = ['Order:']
    if (!orderNumbers || orderNumbers.length === 0) {
        lines.push(PLACEHOLDER_LINE)
        return lines
    }

    for (let idx = 0; idx < orderNumbers.length; idx++) {
        const n = orderNumbers[idx]
        const title = issueByNumber.get(n)?.title ?? '(title missing)'
        lines.push(`${idx + 1}. #${n} ${title}`)
    }

    return lines
}

function ensureInboxSlice({ lines, deliveryBounds }) {
    const { slices } = parseDeliverySlices(lines)
    const existing = slices.find((s) => s.header === INBOX_SLICE_HEADER)
    if (existing) return lines

    // Insert the inbox slice right before the end of the Delivery slices section.
    const insertion = [
        '',
        `### ${INBOX_SLICE_HEADER}`,
        '',
        'Order:',
        PLACEHOLDER_LINE
    ]

    const out = [...lines]
    out.splice(deliveryBounds.end, 0, ...insertion)
    return out
}

function syncDeliverySlices({ description, milestoneTitle, issues }) {
    const base = (description ?? '').trimEnd()

    // If the template is missing, add a fresh one (includes all open issues).
    if (!hasDeliverySlices(base)) {
        const template = buildDeliverySlicesTemplate({ milestoneTitle, issues })
        if (!base) return template
        return `${base}\n\n${template}`
    }

    const openIssues = toOpenIssues(issues)
    const openNumbers = new Set(openIssues.map((i) => i.number))
    const issueByNumber = indexIssuesByNumber(issues)

    let lines = base.split(/\r?\n/)
    let parsed = parseDeliverySlices(lines)

    // If we have the header but no slices, append a default slice template.
    if (parsed.bounds && parsed.slices.length === 0) {
        const template = buildDeliverySlicesTemplate({ milestoneTitle, issues })
        // Avoid duplicating the header: keep everything before Delivery slices, then replace section.
        const before = lines.slice(0, parsed.bounds.start)
        const after = lines.slice(parsed.bounds.end)
        return [...before, ...template.split(/\r?\n/), ...after].join('\n').trimEnd()
    }

    // Determine where missing issues should go.
    const needsInbox = parsed.slices.length > 1
    if (needsInbox && parsed.bounds) {
        lines = ensureInboxSlice({ lines, deliveryBounds: parsed.bounds })
        parsed = parseDeliverySlices(lines)
    }

    const seen = new Set()
    const desiredByHeader = new Map()

    for (const s of parsed.slices) {
        const desired = []
        for (const n of s.orderNumbers ?? []) {
            if (!openNumbers.has(n)) continue
            if (seen.has(n)) continue
            desired.push(n)
            seen.add(n)
        }
        desiredByHeader.set(s.header, desired)
    }

    const missing = openIssues.map((i) => i.number).filter((n) => !seen.has(n))
    if (missing.length > 0) {
        if (parsed.slices.length === 1) {
            const only = parsed.slices[0]
            desiredByHeader.get(only.header).push(...missing)
        } else {
            const inbox = parsed.slices.find((s) => s.header === INBOX_SLICE_HEADER) ?? parsed.slices[parsed.slices.length - 1]
            desiredByHeader.get(inbox.header).push(...missing)
        }
    }

    // Rewrite slice order blocks.
    for (const s of [...parsed.slices].reverse()) {
        const desired = desiredByHeader.get(s.header) ?? []
        const block = buildOrderBlock({ orderNumbers: desired, issueByNumber })

        if (s.orderIdx === -1) {
            // Insert at end of slice.
            lines.splice(s.sliceEnd, 0, '', ...block)
            continue
        }

        const start = s.orderIdx
        const end = s.listEnd !== -1 ? s.listEnd : s.orderIdx + 1

        // Replace everything from Order: through the list items.
        lines.splice(start, end - start, ...block)
    }

    return lines.join('\n').trimEnd()
}

export function ensureDescriptionHasDeliverySlices({ description, milestoneTitle, issues }) {
    return syncDeliverySlices({ description, milestoneTitle, issues })
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
