#!/usr/bin/env node
/**
 * Reanalyze a GitHub milestone “delivery path” and keep its description in sync
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

const AUTO_BLOCK_ID = 'milestone-impact-report'
const AUTO_BLOCK_START = `<!-- AUTO-GENERATED: ${AUTO_BLOCK_ID}:start -->`
const AUTO_BLOCK_END = `<!-- AUTO-GENERATED: ${AUTO_BLOCK_ID}:end -->`

function parseArgs(argv) {
    const args = {
        repo: undefined,
        milestone: undefined,
        apply: false,
        print: false,
        verbose: false
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

Examples:
  # Preview changes only
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --milestone 14 --print

  # Apply to GitHub milestone description
  node scripts/reanalyze-milestone.mjs --repo piquet-h/the-shifting-atlas --milestone 14 --apply

Notes:
  - Uses GitHub CLI (gh). If milestone PATCH fails with 403 due to env token precedence,
    the script will retry with GITHUB_TOKEN/GH_TOKEN removed.
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

function parseOrderedIssueNumbers(description) {
    const ordered = new Set()
    const lines = description.split(/\r?\n/)
    let inOrderBlock = false

    for (const line of lines) {
        if (/^\s*Order:\s*$/.test(line)) {
            inOrderBlock = true
            continue
        }

        if (/^\s*(##|###)\s+/.test(line)) {
            inOrderBlock = false
        }

        if (inOrderBlock && /^\s*$/.test(line)) {
            inOrderBlock = false
        }

        if (!inOrderBlock) continue

        const m = line.match(/#(\d+)/)
        if (m) ordered.add(Number(m[1]))
    }

    return ordered
}

function parseReferencedIssueNumbers(description) {
    const referenced = new Set()
    for (const m of description.matchAll(/#(\d+)/g)) {
        referenced.add(Number(m[1]))
    }
    return referenced
}

function hasSliceStructure(description) {
    // The repo skill expects a slice-based delivery path template, but many milestones are a single-paragraph summary.
    // Only mutate slice/order sections when the template is present.
    return /^##\s+Slice\s+\d+\b/m.test(description)
}

function upsertAutoGeneratedBlock(description, blockMarkdown) {
    const startIdx = description.indexOf(AUTO_BLOCK_START)
    const endIdx = description.indexOf(AUTO_BLOCK_END)

    const normalizedBlock = [AUTO_BLOCK_START, blockMarkdown.trimEnd(), AUTO_BLOCK_END].join('\n')

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        const before = description.slice(0, startIdx).trimEnd()
        const after = description.slice(endIdx + AUTO_BLOCK_END.length).trimStart()
        const sep1 = before.length > 0 ? '\n\n' : ''
        const sep2 = after.length > 0 ? '\n\n' : ''
        return `${before}${sep1}${normalizedBlock}${sep2}${after}`.trimEnd()
    }

    const base = description.trimEnd()
    if (base.length === 0) return normalizedBlock
    return `${base}\n\n${normalizedBlock}`
}

function countByKey(values) {
    const counts = new Map()
    for (const v of values) {
        counts.set(v, (counts.get(v) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

function formatCountsInline(countEntries) {
    if (countEntries.length === 0) return '—'
    return countEntries.map(([k, n]) => `${k} ${n}`).join(', ')
}

function issueUrl(repo, number) {
    return `https://github.com/${repo}/issues/${number}`
}

function formatIssueLine(repo, issue) {
    return `- [#${issue.number}](${issueUrl(repo, issue.number)}) ${issue.title}`
}

function buildImpactReportMarkdown({ repo, milestone, issues, superseded }) {
    const effectiveIssues = issues.filter((i) => !isSuperseded(i))
    const open = effectiveIssues.filter((i) => i.state === 'open')
    const closed = effectiveIssues.filter((i) => i.state === 'closed')

    const typeLabels = effectiveIssues
        .map((i) => i.labels)
        .flat()
        .filter((l) => ['feature', 'enhancement', 'refactor', 'infra', 'docs', 'test', 'spike'].includes(l))

    const scopeLabels = effectiveIssues
        .map((i) => i.labels)
        .flat()
        .filter((l) => l.startsWith('scope:'))

    const milestoneUrl = `https://github.com/${repo}/milestone/${milestone.number}`

    const maxList = 25
    const openList = open
        .slice()
        .sort((a, b) => a.number - b.number)
        .slice(0, maxList)
        .map((i) => formatIssueLine(repo, i))
    const openMore = open.length > maxList ? open.length - maxList : 0

    const supersededList = superseded
        .slice()
        .sort((a, b) => a.number - b.number)
        .slice(0, maxList)
        .map((i) => formatIssueLine(repo, i))
    const supersededMore = superseded.length > maxList ? superseded.length - maxList : 0

    const lines = []
    lines.push('## Delivery impact report (auto)')
    lines.push('')
    lines.push(`Milestone: **${milestone.title}** (#[${milestone.number}](${milestoneUrl})) — state: **${milestone.state}**`)
    lines.push('')
    lines.push('Issue summary (excluding PRs):')
    lines.push(`- Total (effective): ${effectiveIssues.length}`)
    lines.push(`- Closed: ${closed.length}`)
    lines.push(`- Open: ${open.length}`)

    if (milestone.state === 'closed' && open.length > 0) {
        lines.push('')
        lines.push('⚠️ Milestone is closed but still has open issues. Consider moving these to a follow-up milestone.')
    }

    lines.push('')
    lines.push(`Milestone board: ${milestoneUrl}`)
    lines.push('')
    lines.push('Label breakdown (effective issues):')
    lines.push(`- Types: ${formatCountsInline(countByKey(typeLabels))}`)
    lines.push(`- Scopes: ${formatCountsInline(countByKey(scopeLabels))}`)

    lines.push('')
    lines.push('Carryover candidates (open):')
    if (openList.length === 0) {
        lines.push('- (none)')
    } else {
        lines.push(...openList)
        if (openMore > 0) lines.push(`- …and ${openMore} more`)
    }

    if (superseded.length > 0) {
        lines.push('')
        lines.push('Superseded / duplicates (closed):')
        lines.push(...supersededList)
        if (supersededMore > 0) lines.push(`- …and ${supersededMore} more`)
    }

    lines.push('')
    lines.push('_This section is auto-generated and will be overwritten on re-run. Put human context above this block._')

    return lines.join('\n')
}

export function computeUpdatedDescription({ repo, milestone, issues }) {
    const description = milestone.description ?? ''

    const superseded = issues.filter(isSuperseded)
    const effectiveIssues = issues.filter((i) => !isSuperseded(i))

    const inMilestone = new Set(effectiveIssues.map((i) => i.number))
    const inDescriptionOrder = parseOrderedIssueNumbers(description)
    const referencedInDescription = parseReferencedIssueNumbers(description)

    const gaps = effectiveIssues.filter((i) => !referencedInDescription.has(i.number))
    const unordered = effectiveIssues.filter((i) => !inDescriptionOrder.has(i.number))

    const missingFromMilestone = [...inDescriptionOrder].filter((n) => !inMilestone.has(n)).sort((a, b) => a - b)

    const infraUnordered = unordered.filter(isInfra)
    const epicGaps = gaps.filter(isEpic)
    const unplaced = gaps.filter((i) => !isInfra(i) && !isEpic(i))

    let lines = description.split(/\r?\n/)

    if (hasSliceStructure(description)) {
        // Only apply slice-template mutations when the template already exists.
        lines = ensureSlice0(lines)
        lines = rewriteSlice0Order(lines, infraUnordered)

        if (epicGaps.length > 0) {
            lines = upsertSection(lines, 'Coordinators (epics)', epicGaps.sort((a, b) => a.number - b.number).map(formatGap))
        }

        if (unplaced.length > 0) {
            lines = upsertSection(lines, 'Unplaced gaps (needs decision)', unplaced.sort((a, b) => a.number - b.number).map(formatGap))
        }

        if (missingFromMilestone.length > 0) {
            lines = upsertSection(
                lines,
                'Ordering drift (in description but not in milestone)',
                missingFromMilestone.map((n) => `- #${n}`)
            )
        }
    }

    const baseDescription = lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd()
    const impactBlock = buildImpactReportMarkdown({ repo, milestone, issues, superseded })
    const updatedDescription = upsertAutoGeneratedBlock(baseDescription, impactBlock)

    const summary = {
        milestone: { number: milestone.number, title: milestone.title, state: milestone.state },
        issuesInMilestone: effectiveIssues.length,
        orderedInDescription: inDescriptionOrder.size,
        referencedInDescription: referencedInDescription.size,
        supersededInMilestone: superseded.map((s) => s.number),
        gaps: gaps.map((g) => g.number),
        infraUnordered: infraUnordered.map((g) => g.number),
        epicGaps: epicGaps.map((g) => g.number),
        unplacedGaps: unplaced.map((g) => g.number),
        missingFromMilestone,
        usedSliceTemplate: hasSliceStructure(description)
    }

    return { updatedDescription, summary }
}

function findSectionRange(lines, headerPredicate) {
    const start = lines.findIndex(headerPredicate)
    if (start === -1) return null

    let end = lines.length
    for (let i = start + 1; i < lines.length; i++) {
        // stop at next top-level header
        if (/^##\s+/.test(lines[i])) {
            end = i
            break
        }
    }

    return { start, end }
}

function ensureSlice0(lines) {
    // If Slice 0 exists, do nothing.
    if (lines.some((l) => /^##\s+Slice\s+0\b/.test(l))) return lines

    const insertBeforeIdx = lines.findIndex((l) => /^##\s+Exit criteria\b/.test(l))

    const slice0Block = [
        '## Slice 0 — Prerequisites (infra)',
        '',
        'Order:',
        '',
        'Notes:',
        '- Local / low-cost environments may run with Azure OpenAI disabled and rely on safe fallbacks.',
        '- If the milestone requires real AOAI-backed generation (not fallback-only), infra must be complete.',
        ''
    ]

    const out = [...lines]
    const idx = insertBeforeIdx === -1 ? out.length : insertBeforeIdx
    out.splice(idx, 0, ...slice0Block)
    return out
}

function rewriteSlice0Order(lines, infraIssues) {
    const range = findSectionRange(lines, (l) => /^##\s+Slice\s+0\b/.test(l))
    if (!range) return lines

    const sliceLines = lines.slice(range.start, range.end)

    const orderIdx = sliceLines.findIndex((l) => /^Order:\s*$/.test(l))
    if (orderIdx === -1) return lines

    // Order list begins after `Order:`. End when we hit a blank line followed by something that isn't an order item.
    let listStart = orderIdx + 1
    while (listStart < sliceLines.length && /^\s*$/.test(sliceLines[listStart])) listStart++

    let listEnd = listStart
    while (listEnd < sliceLines.length) {
        const l = sliceLines[listEnd]
        const isItem = /^\s*(\d+\.|-|\*)\s*#\d+/.test(l)
        if (!isItem) break
        listEnd++
    }

    const existingNums = new Set()
    for (let i = listStart; i < listEnd; i++) {
        const m = sliceLines[i].match(/#(\d+)/)
        if (m) existingNums.add(Number(m[1]))
    }

    const merged = [...infraIssues].sort((a, b) => a.number - b.number).map((issue, idx) => `${idx + 1}. #${issue.number} ${issue.title}`)

    const updatedSlice = [...sliceLines]
    updatedSlice.splice(listStart, listEnd - listStart, ...merged)

    const out = [...lines]
    out.splice(range.start, range.end - range.start, ...updatedSlice)
    return out
}

function upsertSection(lines, header, bodyLines) {
    const headerRe = new RegExp(`^##\\s+${header.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*$`)
    const range = findSectionRange(lines, (l) => headerRe.test(l))

    const section = [`## ${header}`, '', ...bodyLines, '']

    if (!range) {
        return [...lines, '', ...section]
    }

    const out = [...lines]
    out.splice(range.start, range.end - range.start, ...section)
    return out
}

function isInfra(issue) {
    const labels = new Set(issue.labels)
    const title = issue.title.toLowerCase()
    return (
        labels.has('infra') ||
        title.startsWith('infra(') ||
        /\bprovision\b/.test(title) ||
        /\brbac\b/.test(title) ||
        /app settings/.test(title)
    )
}

function isEpic(issue) {
    return new Set(issue.labels).has('epic')
}

function isSuperseded(issue) {
    if (issue.state !== 'closed') return false
    const title = issue.title.toLowerCase()
    const body = (issue.body ?? '').toLowerCase()

    // Common repo patterns when issues were split or marked duplicate.
    return (
        title.includes('duplicate') ||
        body.includes('duplicate issue') ||
        body.includes('this issue has been split') ||
        body.includes('see correct split issues')
    )
}

function formatGap(issue) {
    const labels = issue.labels.length > 0 ? ` (labels: ${issue.labels.join(', ')})` : ''
    return `- #${issue.number} ${issue.title}${labels}`
}

function main() {
    const args = parseArgs(process.argv.slice(2))

    if (args.help) {
        console.log(usage())
        process.exit(0)
    }

    if (!args.repo) throw new Error('Missing --repo <owner/repo>')
    if (!args.milestone || Number.isNaN(args.milestone)) throw new Error('Missing/invalid --milestone <number>')

    const milestoneRes = runGhWithFallback(['api', `repos/${args.repo}/milestones/${args.milestone}`], { verbose: args.verbose })
    if (!milestoneRes.ok) {
        console.error(milestoneRes.stderr || milestoneRes.stdout)
        process.exit(1)
    }

    const milestone = JSON.parse(milestoneRes.stdout)

    const issuesRes = runGhWithFallback(
        ['api', '-X', 'GET', '--paginate', `repos/${args.repo}/issues`, '-f', `milestone=${args.milestone}`, '-f', 'state=all'],
        { verbose: args.verbose }
    )
    if (!issuesRes.ok) {
        console.error(issuesRes.stderr || issuesRes.stdout)
        process.exit(1)
    }

    const rawIssues = JSON.parse(issuesRes.stdout)
    const issues = rawIssues
        .filter((i) => !i.pull_request)
        .map((i) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            body: i.body,
            labels: (i.labels ?? []).map((l) => l.name)
        }))

    const { updatedDescription, summary } = computeUpdatedDescription({ repo: args.repo, milestone, issues })
    console.error(JSON.stringify({ ...summary, willApply: args.apply }, null, 2))

    if (args.print && !args.apply) {
        console.log(updatedDescription)
    }

    if (!args.apply) {
        return
    }

    const tmpFile = path.join(os.tmpdir(), `milestone-${args.milestone}-description.txt`)
    fs.writeFileSync(tmpFile, updatedDescription, 'utf8')

    const patchRes = runGhWithFallback(
        ['api', '-X', 'PATCH', `repos/${args.repo}/milestones/${args.milestone}`, '-F', `description=@${tmpFile}`],
        { verbose: args.verbose }
    )

    if (!patchRes.ok) {
        console.error(patchRes.stderr || patchRes.stdout)
        process.exit(1)
    }

    if (args.print) {
        console.log(updatedDescription)
    }

    console.error(`Updated milestone #${args.milestone} (${milestone.title}).`)
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
