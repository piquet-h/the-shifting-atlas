#!/usr/bin/env node
/**
 * AI-assisted milestone delivery order updater.
 *
 * Goal (minimal):
 * - When an issue closes, ask an LLM whether any OPEN milestone delivery orders should change.
 * - If impact exists, update milestone descriptions deterministically (no free-form rewrite).
 *
 * This script is designed to run in GitHub Actions.
 */

import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Node 22 provides a global `fetch`, but ESLint may not be configured with that global.
// Bind it locally so lint + runtime both work without extra dependencies.
const { fetch } = globalThis

function parseArgs(argv) {
    const args = {
        repo: undefined,
        issue: undefined,
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
        if (a === '--issue' || a === '--issueNumber') {
            args.issue = Number(argv[++i])
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
  node scripts/update-open-milestones-on-issue-closed.mjs --repo <owner/repo> --issue <number> [--apply|--dry-run]

Env:
  GITHUB_TOKEN   required (GitHub API)

    # GitHub Models (recommended / "GitHub native")
    GITHUB_MODELS_MODEL     required (e.g., gpt-4o-mini)
    GITHUB_MODELS_BASE_URL  optional, default: https://models.inference.ai.azure.com

Notes:
  - The script only updates OPEN milestones.
    - Milestone descriptions remain the single concise source of truth; we only rewrite existing Order: blocks.
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
    return { owner, name, base: `https://api.github.com/repos/${owner}/${name}` }
}

function stripPullRequests(items) {
    return items.filter((i) => !i.pull_request)
}

function compactIssue(i) {
    return {
        number: i.number,
        title: i.title,
        state: i.state,
        labels: (i.labels ?? []).map((l) => l.name),
        body: i.body ?? ''
    }
}

async function tryReadTextFile(filePath) {
    try {
        return await readFile(filePath, 'utf8')
    } catch {
        return null
    }
}

async function loadRepoDocsContext() {
    // Keep this small; the model only needs stable repo guidance, not a full doc dump.
    const roadmap = await tryReadTextFile('docs/roadmap.md')
    const tenets = await tryReadTextFile('docs/tenets.md')

    return {
        roadmapExcerpt: truncate(roadmap ?? '', 1200),
        tenetsExcerpt: truncate(tenets ?? '', 1200)
    }
}

function truncate(text, maxChars) {
    if (!text) return ''
    if (text.length <= maxChars) return text
    return text.slice(0, maxChars)
}

function orderedIssueNumberSet(sliceOrders) {
    const set = new Set()
    for (const s of sliceOrders ?? []) {
        for (const n of s.order ?? []) set.add(n)
    }
    return set
}

export function hasSliceTemplate(description) {
    return (
        /^##\s+Delivery slices\b/m.test(description) ||
        /^###\s+Slice\s+\d+\b/m.test(description) ||
        /^##\s+Slice\s+\d+\b/m.test(description)
    )
}

export function extractSliceOrders(description) {
    // Lightweight parser: for each "### Slice ..." section, capture issue numbers in its Order block.
    const lines = description.split(/\r?\n/)
    const slices = []

    let current = null
    let inOrder = false

    for (const line of lines) {
        const sliceHeader = line.match(/^###\s+(Slice\s+\d+\s+—\s+.+)$/)
        if (sliceHeader) {
            if (current) slices.push(current)
            current = { header: sliceHeader[1], order: [] }
            inOrder = false
            continue
        }

        if (!current) continue

        if (/^Order:\s*$/.test(line)) {
            inOrder = true
            continue
        }

        if (inOrder && (/^###\s+/.test(line) || /^##\s+/.test(line))) {
            inOrder = false
        }

        if (!inOrder) continue

        const m = line.match(/#(\d+)/)
        if (m) current.order.push(Number(m[1]))
    }

    if (current) slices.push(current)
    return slices
}

function getGitHubModelsModel() {
    // Allow a legacy fallback if the repo already has AI_MODEL configured.
    return process.env.GITHUB_MODELS_MODEL ?? process.env.AI_MODEL ?? requireEnv('GITHUB_MODELS_MODEL')
}

function getGitHubModelsBaseUrl() {
    return process.env.GITHUB_MODELS_BASE_URL ?? 'https://models.inference.ai.azure.com'
}

function getGitHubModelsToken() {
    // Default to the workflow GITHUB_TOKEN; allow override for local runs.
    return process.env.GITHUB_MODELS_TOKEN ?? requireEnv('GITHUB_TOKEN')
}

async function callGitHubModels({ system, user }) {
    const token = getGitHubModelsToken()
    const model = getGitHubModelsModel()
    const baseUrl = getGitHubModelsBaseUrl()

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            temperature: 0.2
        })
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`AI call failed ${res.status} ${res.statusText}: ${text}`)
    }

    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') {
        throw new Error('AI response missing message content')
    }

    return content
}

function parseAiJson(content) {
    // Accept strict JSON only.
    let parsed
    try {
        parsed = JSON.parse(content)
    } catch {
        throw new Error(`AI did not return valid JSON. First 400 chars: ${content.slice(0, 400)}`)
    }

    if (typeof parsed !== 'object' || parsed === null) throw new Error('AI JSON must be an object')
    if (typeof parsed.impact !== 'boolean') throw new Error('AI JSON must include boolean: impact')

    if (parsed.impact) {
        if (!Array.isArray(parsed.sliceOrders)) throw new Error('AI JSON must include sliceOrders[] when impact=true')
    }

    return parsed
}

export function buildMilestonePromptPayload({ closedIssue, closingPullRequest, milestone, repoContext }) {
    const sliceOrders = milestone.sliceOrders ?? []
    const orderedSet = orderedIssueNumberSet(sliceOrders)

    const maxIssuesForPrompt = 60

    const openIssues = (milestone.issues ?? [])
        .filter((i) => i.state === 'open')
        .slice()
        .sort((a, b) => a.number - b.number)

    const issuesForPrompt = (orderedSet.size > 0 ? openIssues.filter((i) => orderedSet.has(i.number)) : openIssues)
        .slice(0, maxIssuesForPrompt)
        .map((i) => ({
            number: i.number,
            title: truncate(i.title ?? '', 140),
            state: i.state,
            // Keep only high-signal labels to reduce token load.
            labels: (i.labels ?? []).filter(
                (l) => l.startsWith('scope:') || ['feature', 'enhancement', 'refactor', 'infra', 'docs', 'test', 'spike'].includes(l)
            )
        }))
        .sort((a, b) => a.number - b.number)

    return {
        closedIssue: {
            number: closedIssue.number,
            title: truncate(closedIssue.title ?? '', 180),
            body: truncate(closedIssue.body ?? '', 800),
            state: closedIssue.state,
            labels: (closedIssue.labels ?? []).filter(
                (l) => l.startsWith('scope:') || ['feature', 'enhancement', 'refactor', 'infra', 'docs', 'test', 'spike'].includes(l)
            )
        },
        closingPullRequest: closingPullRequest
            ? {
                number: closingPullRequest.number,
                title: truncate(closingPullRequest.title ?? '', 180),
                body: truncate(closingPullRequest.body ?? '', 1200),
                files: (closingPullRequest.files ?? []).slice(0, 25)
            }
            : null,
        milestone: {
            number: milestone.number,
            title: milestone.title,
            descriptionExcerpt: truncate(milestone.descriptionExcerpt ?? '', 900),
            sliceOrders,
            issues: issuesForPrompt.map((i) => ({
                ...i,
                body: truncate(openIssues.find((x) => x.number === i.number)?.body ?? '', 300)
            }))
        },
        repoContext: repoContext
            ? {
                roadmapExcerpt: truncate(repoContext.roadmapExcerpt ?? '', 1200),
                tenetsExcerpt: truncate(repoContext.tenetsExcerpt ?? '', 1200)
            }
            : { roadmapExcerpt: '', tenetsExcerpt: '' }
    }
}

export function shouldCloseMilestone(issues) {
    const all = issues ?? []
    if (all.length === 0) return false

    const openCount = all.filter((i) => i.state === 'open').length
    const closedCount = all.filter((i) => i.state === 'closed').length

    return openCount === 0 && closedCount > 0
}

function makeSystemPrompt() {
    return [
        'You are a delivery-planning assistant for a software repo.',
        'Task: given a recently closed issue and context for ONE open milestone, decide if that milestone delivery order should be updated.',
        'Use all provided context: milestone description excerpt, per-slice orders, issue titles/labels/bodies, closing PR summary, and repo docs excerpts (roadmap/tenets).',
        'Constraints:',
        '- You must output STRICT JSON only. No markdown, no commentary.',
        '- If no changes are needed, output: {"impact":false}.',
        '- If changes are needed, output: {"impact":true,"rationale":"short","sliceOrders":[...]}',
        '- Provide per-slice order as issue numbers only, and ONLY include issues that belong to the milestone.',
        'JSON schema (impact=true):',
        '{',
        '  "impact": true,',
        '  "rationale": "short",',
        '  "sliceOrders": [',
        '    {"header":"Slice 1 — ...","order":[736,737,738]},',
        '    {"header":"Slice 2 — ...","order":[585,582]}',
        '  ]',
        '}',
        'Rules:',
        '- Preserve intent: removing the closed issue from remaining order is fine; reordering requires a reason (dependency/unblock/workflow).',
        '- Prefer minimal edits: only change milestones that actually benefit.',
        '- If you are uncertain, return impact=false.',
        ''
    ].join('\n')
}

function makeUserPrompt(payload) {
    return JSON.stringify(payload)
}

async function findClosingPullRequest({ base, closedIssueNumber }) {
    // Best-effort: use timeline events to find a cross-referenced PR.
    // This endpoint is stable but requires a custom preview for timeline in some GitHub versions; we fall back safely.
    const url = `${base}/issues/${closedIssueNumber}/timeline?per_page=100`
    const headers = {
        ...ghHeaders(),
        Accept: 'application/vnd.github+json, application/vnd.github.mockingbird-preview+json'
    }

    const res = await fetch(url, { headers })
    if (!res.ok) return null

    const events = await res.json()
    const crossRefs = events
        .filter((e) => e.event === 'cross-referenced')
        .filter((e) => e?.source?.issue?.pull_request)
        .reverse()

    if (crossRefs.length === 0) return null

    const prNumber = crossRefs[0]?.source?.issue?.number
    if (!prNumber) return null

    const pr = await ghGetJson(`${base}/pulls/${prNumber}`)
    const files = await ghGetJson(`${base}/pulls/${prNumber}/files?per_page=100`)

    return {
        number: pr.number,
        title: pr.title,
        body: pr.body ?? '',
        merged_at: pr.merged_at,
        html_url: pr.html_url,
        files: (files ?? []).slice(0, 50).map((f) => ({ filename: f.filename, status: f.status }))
    }
}

function indexIssuesByNumber(issues) {
    const map = new Map()
    for (const i of issues) map.set(i.number, i)
    return map
}

export function rebuildSliceOrderMarkdown({ orderNumbers, issueByNumber }) {
    const lines = []
    lines.push('Order:')
    for (let idx = 0; idx < orderNumbers.length; idx++) {
        const n = orderNumbers[idx]
        const issue = issueByNumber.get(n)
        const title = issue?.title ?? '(title missing)'
        lines.push(`${idx + 1}. #${n} ${title}`)
    }
    return lines
}

export function replaceSliceOrders({ description, sliceOrders, issueByNumber }) {
    // Minimal deterministic rewrite: for each slice header, replace its Order list items.
    let out = description

    for (const slice of sliceOrders) {
        const header = slice.header
        const order = slice.order
        if (!Array.isArray(order)) continue

        // Find the slice header line index.
        const lines = out.split(/\r?\n/)
        const headerIdx = lines.findIndex((l) => l.trimEnd() === `### ${header}`)
        if (headerIdx === -1) continue

        // Slice body is until next ### or ##.
        let sliceEnd = lines.length
        for (let i = headerIdx + 1; i < lines.length; i++) {
            if (/^###\s+/.test(lines[i]) || /^##\s+/.test(lines[i])) {
                sliceEnd = i
                break
            }
        }

        const sliceLines = lines.slice(headerIdx, sliceEnd)
        const orderHeaderIdx = sliceLines.findIndex((l) => /^Order:\s*$/.test(l))
        if (orderHeaderIdx === -1) continue

        // Consume existing numbered items after Order: (allow intervening blank lines).
        let listStart = orderHeaderIdx + 1
        while (listStart < sliceLines.length && /^\s*$/.test(sliceLines[listStart])) listStart++

        let listEnd = listStart
        while (listEnd < sliceLines.length) {
            const l = sliceLines[listEnd]
            if (/^\s*$/.test(l)) {
                listEnd++
                continue
            }
            if (!/^\s*\d+\.\s*#\d+/.test(l)) break
            listEnd++
        }

        const rebuilt = rebuildSliceOrderMarkdown({ orderNumbers: order, issueByNumber })
        const newSliceLines = [...sliceLines]
        newSliceLines.splice(orderHeaderIdx, listEnd - orderHeaderIdx, ...rebuilt)

        const newLines = [...lines]
        newLines.splice(headerIdx, sliceEnd - headerIdx, ...newSliceLines)
        out = newLines.join('\n')
    }

    return out
}

async function main() {
    const args = parseArgs(process.argv.slice(2))
    if (args.help) {
        console.log(usage())
        process.exit(0)
    }

    if (!args.repo) throw new Error('Missing --repo <owner/repo>')
    if (!args.issue || Number.isNaN(args.issue)) throw new Error('Missing/invalid --issue <number>')
    if (!args.apply && !args.dryRun) throw new Error('Specify either --apply or --dry-run')

    const { base } = repoApiBase(args.repo)

    const closedIssueRaw = await ghGetJson(`${base}/issues/${args.issue}`)
    const closedIssue = compactIssue(closedIssueRaw)

    const closingPullRequest = await findClosingPullRequest({ base, closedIssueNumber: closedIssue.number })

    const milestonesRaw = await ghGetJson(`${base}/milestones?state=open&per_page=100`)
    const openMilestones = (milestonesRaw ?? []).map((m) => ({ number: m.number, title: m.title, description: m.description ?? '' }))

    const repoContext = await loadRepoDocsContext()

    const openMilestonesWithIssues = []
    for (const m of openMilestones) {
        const issuesRaw = await ghGetJson(`${base}/issues?milestone=${m.number}&state=all&per_page=100`)
        const issues = stripPullRequests(issuesRaw).map(compactIssue)

        const sliceOrders = hasSliceTemplate(m.description) ? extractSliceOrders(m.description) : []

        openMilestonesWithIssues.push({
            number: m.number,
            title: m.title,
            description: m.description,
            sliceOrders,
            issues
        })
    }

    const results = []

    // Evaluate one milestone at a time to keep model prompts small (avoid token-limit errors).
    for (const m of openMilestonesWithIssues) {
        // If this milestone has no open issues left, close it.
        if (shouldCloseMilestone(m.issues)) {
            results.push({ milestone: m.number, considered: false, action: 'close-milestone' })

            if (args.dryRun) {
                console.log(`\n--- milestone #${m.number}: ${m.title} ---\n`)
                console.log('(dry-run) Would close milestone: no open issues remain.')
            }

            if (args.apply) {
                await ghPatchJson(`${base}/milestones/${m.number}`, { state: 'closed' })
            }

            continue
        }

        if (!hasSliceTemplate(m.description)) {
            results.push({ milestone: m.number, considered: false, reason: 'no-slice-template' })
            continue
        }

        const payload = buildMilestonePromptPayload({
            closedIssue,
            closingPullRequest,
            milestone: {
                number: m.number,
                title: m.title,
                descriptionExcerpt: m.description,
                sliceOrders: m.sliceOrders,
                issues: m.issues
            },
            repoContext
        })

        const aiText = await callGitHubModels({
            system: makeSystemPrompt(),
            user: makeUserPrompt(payload)
        })

        const aiResult = parseAiJson(aiText)

        results.push({ milestone: m.number, considered: true, impact: aiResult.impact })

        if (!aiResult.impact) continue

        const issueByNumber = indexIssuesByNumber(m.issues)
        const updatedDescription = replaceSliceOrders({
            description: m.description,
            sliceOrders: aiResult.sliceOrders,
            issueByNumber
        })

        if (updatedDescription === m.description) continue

        if (args.dryRun) {
            console.log(`\n--- milestone #${m.number}: ${m.title} ---\n`)
            console.log(updatedDescription)
            continue
        }

        if (args.apply) {
            await ghPatchJson(`${base}/milestones/${m.number}`, { description: updatedDescription })
        }
    }

    console.error(
        JSON.stringify(
            {
                closedIssue: closedIssue.number,
                hasClosingPullRequest: Boolean(closingPullRequest),
                openMilestonesConsidered: openMilestones.length,
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
