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
    const description = milestone.description ?? ''

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

    const superseded = issues.filter(isSuperseded)
    const effectiveIssues = issues.filter((i) => !isSuperseded(i))

    const inMilestone = new Set(effectiveIssues.map((i) => i.number))
    const inDescriptionOrder = parseOrderedIssueNumbers(description)
    const referencedInDescription = parseReferencedIssueNumbers(description)

    // True gaps are issues in the milestone that are not referenced anywhere in the description.
    // (Issues can be “accounted for” as coordinators or archived notes without being in an Order block.)
    const gaps = effectiveIssues.filter((i) => !referencedInDescription.has(i.number))

    // Unordered issues are in the milestone but not in an Order block.
    // These are candidates for placement (infra) or explicit listing (if truly needed).
    const unordered = effectiveIssues.filter((i) => !inDescriptionOrder.has(i.number))

    const missingFromMilestone = [...inDescriptionOrder].filter((n) => !inMilestone.has(n)).sort((a, b) => a - b)

    const infraUnordered = unordered.filter(isInfra)
    const epicGaps = gaps.filter(isEpic)
    const unplaced = gaps.filter((i) => !isInfra(i) && !isEpic(i))

    let lines = description.split(/\r?\n/)

    // Ensure Slice 0 exists and includes infra gap issues.
    lines = ensureSlice0(lines)
    lines = rewriteSlice0Order(lines, infraUnordered)

    // Coordinators: list epic gaps separately (do not force into slice order).
    if (epicGaps.length > 0) {
        lines = upsertSection(lines, 'Coordinators (epics)', epicGaps.sort((a, b) => a.number - b.number).map(formatGap))
    }

    // Unplaced gaps.
    if (unplaced.length > 0) {
        lines = upsertSection(lines, 'Unplaced gaps (needs decision)', unplaced.sort((a, b) => a.number - b.number).map(formatGap))
    }

    // Drift warning: ordered issues not currently in milestone.
    if (missingFromMilestone.length > 0) {
        lines = upsertSection(
            lines,
            'Ordering drift (in description but not in milestone)',
            missingFromMilestone.map((n) => `- #${n}`)
        )
    }

    const updatedDescription = lines
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd()

    const summary = {
        milestone: { number: milestone.number, title: milestone.title },
        issuesInMilestone: effectiveIssues.length,
        orderedInDescription: inDescriptionOrder.size,
        referencedInDescription: referencedInDescription.size,
        supersededInMilestone: superseded.map((s) => s.number),
        gaps: gaps.map((g) => g.number),
        infraUnordered: infraUnordered.map((g) => g.number),
        epicGaps: epicGaps.map((g) => g.number),
        unplacedGaps: unplaced.map((g) => g.number),
        missingFromMilestone,
        willApply: args.apply
    }

    console.error(JSON.stringify(summary, null, 2))

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

try {
    main()
} catch (err) {
    console.error(err?.stack || String(err))
    process.exit(1)
}
