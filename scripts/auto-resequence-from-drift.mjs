#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * auto-resequence-from-drift.mjs
 * Heuristically reorders existing issues in roadmap/implementation-order.json based on
 * documentation drift signals (output of analyze-doc-drift.mjs) plus lightweight
 * keyword matching against issue titles (and optionally bodies if GH_TOKEN provided).
 *
 * Strategy:
 * 1. Load implementation-order.json list.
 * 2. Load drift JSON.
 * 3. Tokenize drift finding lines; weight tokens by dimension:
 *    dependency=4, risk=3, leverage=2, value=2, time=3 (rough heuristic) then apply stop-word dampening.
 * 4. Score each issue: sum weights of tokens appearing in its title/body (case-insensitive word boundary match).
 * 5. Stable sort by (score desc, original order asc). Keep items with score=0 in relative order after scored ones.
 * 6. If no issue scored >0 OR max score < threshold (default 3) abort (no change).
 * 7. Write updated contiguous order values if changed.
 *
 * This is deliberately conservative; it does NOT insert new issues or guess missing work.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
    options: {
        drift: { type: 'string', required: true },
        orderFile: { type: 'string', default: 'roadmap/implementation-order.json' },
        threshold: { type: 'string' }, // numeric string
        'dry-run': { type: 'boolean' }
    }
})

function readJSON(path) {
    try {
        return JSON.parse(fs.readFileSync(path, 'utf8'))
    } catch (e) {
        throw new Error(`Failed reading ${path}: ${e.message}`)
    }
}

const DRIFT = readJSON(values.drift)
const ORDER_PATH = values.orderFile
const DATA = readJSON(ORDER_PATH)
const THRESHOLD = values.threshold ? Number(values.threshold) : 3

// Prepare weighted token list from findings
const DIM_WEIGHTS = { dependency: 4, risk: 3, leverage: 2, value: 2, time: 3 }
const STOP_TOKENS = new Set(['must', 'change', 'changes', 'integration', 'integrations'])
const rawTokens = []
for (const f of DRIFT.findings || []) {
    const baseTokens = f.line
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean)
    let weight = DIM_WEIGHTS[f.dim] || 1
    for (const t of baseTokens) {
        if (t.length < 3) continue
        const dampened = STOP_TOKENS.has(t) ? Math.min(1, weight) : weight
        rawTokens.push({ t, w: dampened })
    }
}

// Aggregate token weights
const tokenWeights = rawTokens.reduce((acc, { t, w }) => {
    acc[t] = (acc[t] || 0) + w
    return acc
}, {})
const tokenList = Object.entries(tokenWeights).map(([t, w]) => ({ t, w }))

// Optionally fetch issue bodies (best-effort)
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
let issueBodies = {}
if (GH_TOKEN && tokenList.length) {
    const issueNumbers = DATA.items.map((i) => i.issue)
    // Batch fetch using gh api if available
    const gh = spawnSync('gh', ['api', '--paginate', `repos/:owner/:repo/issues?state=open&per_page=100`], { encoding: 'utf8' })
    if (gh.status === 0) {
        try {
            const arr = JSON.parse(gh.stdout)
            for (const issue of arr) {
                if (issue && issue.number && issueNumbers.includes(issue.number)) {
                    issueBodies[issue.number] = (issue.title + '\n' + (issue.body || '')).toLowerCase()
                }
            }
        } catch {
            console.error('Failed to parse gh api output; continuing without bodies')
        }
    } else {
        console.error('gh api call failed; continuing without bodies')
    }
}

function scoreIssue(item) {
    const hay = issueBodies[item.issue] || item.title.toLowerCase()
    let score = 0
    for (const { t, w } of tokenList) {
        if (new RegExp(`\\b${t}\\b`, 'i').test(hay)) score += w
    }
    return score
}

const scored = DATA.items.map((it) => ({ ...it, _originalOrder: it.order, _score: scoreIssue(it) }))
const maxScore = Math.max(0, ...scored.map((s) => s._score))
if (maxScore < THRESHOLD || maxScore === 0) {
    console.error(`No resequence performed (maxScore=${maxScore} < threshold=${THRESHOLD})`)
    process.exit(0)
}

// Separate scored vs unscored
const withScore = scored.filter((s) => s._score > 0).sort((a, b) => b._score - a._score || a._originalOrder - b._originalOrder)
const withoutScore = scored.filter((s) => s._score === 0).sort((a, b) => a._originalOrder - b._originalOrder)
const newItems = [...withScore, ...withoutScore].map((it, idx) => ({ issue: it.issue, order: idx + 1, title: it.title }))

// Detect change
let changed = false
for (const old of DATA.items) {
    const ni = newItems.find((n) => n.issue === old.issue)
    if (!ni || ni.order !== old.order) {
        changed = true
        break
    }
}
if (!changed) {
    console.log('Ordering unchanged after heuristic resequence.')
    process.exit(0)
}

// Build delta list
const deltas = []
for (const old of scored) {
    const ni = newItems.find((n) => n.issue === old.issue)
    if (ni && ni.order !== old.order) deltas.push({ issue: old.issue, title: old.title, from: old.order, to: ni.order, score: old._score })
}
deltas.sort((a, b) => a.to - b.to)

const updated = { ...DATA, generated: new Date().toISOString(), items: newItems }

if (values['dry-run']) {
    console.log('Dry run: proposed resequence (no file written).')
    console.log(JSON.stringify({ maxScore, threshold: THRESHOLD, changed: true, deltas, tokens: tokenList.slice(0, 25) }, null, 2))
    // Also emit a markdown summary for convenience
    const lines = deltas.map((d) => `- #${d.issue} ${d.title} (${d.from} → ${d.to}) [score ${d.score}]`).join('\n')
    fs.writeFileSync('resequence-delta.md', `### Proposed Resequence\n\n${lines}\n\nMax score: ${maxScore} (threshold ${THRESHOLD})\n`)
    fs.writeFileSync('resequence-delta.json', JSON.stringify({ deltas, maxScore, threshold: THRESHOLD }, null, 2))
    process.exit(0)
}

// Persist changes
fs.writeFileSync(ORDER_PATH, JSON.stringify(updated, null, 4) + '\n')
// Emit delta artifacts for workflow consumption
const deltaLines = deltas.map((d) => `- #${d.issue} ${d.title} (${d.from} → ${d.to}) [score ${d.score}]`).join('\n')
fs.writeFileSync('resequence-delta.md', `### Auto Resequence Summary\n\n${deltaLines}\n\nMax score: ${maxScore} (threshold ${THRESHOLD})\n`)
fs.writeFileSync(
    'resequence-delta.json',
    JSON.stringify({ deltas, maxScore, threshold: THRESHOLD, tokens: tokenList.slice(0, 25) }, null, 2)
)

console.log('Resequenced implementation order based on doc drift signals.')
console.log(JSON.stringify({ maxScore, threshold: THRESHOLD, changed: true, deltas: deltas.slice(0, 15) }, null, 2))
