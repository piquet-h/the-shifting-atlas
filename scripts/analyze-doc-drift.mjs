#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * analyze-doc-drift.mjs
 * Heuristic detector for documentation changes that may warrant
 * implementation order reprioritisation.
 *
 * Usage: node scripts/analyze-doc-drift.mjs --base <baseRef> --head <headRef>
 * Emits JSON to stdout:
 * {
 *   scoreTotal: number,
 *   dimensions: { dependency, risk, value, leverage, time },
 *   recommendedAction: 'none'|'append'|'resequence',
 *   findings: [{ dim, line }]
 * }
 */
import { spawnSync } from 'node:child_process'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
    options: {
        base: { type: 'string' },
        head: { type: 'string' }
    }
})

// Keyword buckets driving dimension scores.
const SIGNALS = {
    dependency: [
        /must\s+precede/i,
        /requires?\s+(?:issue|#|phase)/i,
        /prerequisite/i,
        /blocking\s+dependency/i,
        /idempotency\s+token/i,
        /state\s+machine/i
    ],
    risk: [/risk/i, /breaking\s+change/i, /backward[-\s]?incompatible/i, /security\s+(?:concern|issue|hole)/i, /unstable/i, /deprecated/i],
    value: [/user[-\s]?impact/i, /business\s+value/i, /customer\s+(?:need|impact)/i, /ROI/i, /efficiency/i, /improvement/i],
    leverage: [/enables?\s+(?:multiple|other|future)/i, /foundation(?:al)?/i, /platform/i, /shared\s+component/i, /reusable/i],
    time: [/time[-\s]?sensitive/i, /deadline/i, /urgent/i, /blocker/i, /delayed/i, /schedule/i]
}

// Weighting constants for scoring matches.
const FIRST_MATCH_WEIGHT = 2
const SUBSEQUENT_MATCH_WEIGHT = 1

function safeRef(ref) {
    if (!ref) return undefined
    return /^[\w\-./]+$/.test(ref) ? ref : undefined
}

function resolveRefs() {
    let base = safeRef(values.base)
    let head = safeRef(values.head)
    if (!head) head = 'HEAD'
    if (!base) {
        // Attempt previous commit; if fails, fallback to head (empty diff)
        const prev = spawnSync('git', ['rev-parse', 'HEAD~1'], { encoding: 'utf8' })
        if (prev.status === 0) base = prev.stdout.trim()
        else base = head
    }
    return { base, head }
}

function gitDiff(base, head) {
    const args = [
        'diff',
        '--unified=0',
        `${base}...${head}`,
        '--',
        '*.md',
        'shared/src/telemetryEvents.ts',
        '.github/copilot-instructions.md'
    ]
    const result = spawnSync('git', args, { encoding: 'utf8' })
    if (result.error) {
        console.error('git diff failed', result.error)
        return ''
    }
    return result.stdout || ''
}

function analyze() {
    const { base, head } = resolveRefs()
    const diff = gitDiff(base, head)
    const dimensions = {
        dependency: 0,
        risk: 0,
        value: 0,
        leverage: 0,
        time: 0
    }
    const findings = []

    const addedLines = diff.split(/\n/).filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    for (const line of addedLines) {
        // Check each dimension bucket.
        for (const [dim, patterns] of Object.entries(SIGNALS)) {
            const matches = patterns.filter((p) => p.test(line))
            if (matches.length) {
                // Increment score with weighting (first hit vs subsequent lines for that dimension)
                const prior = dimensions[dim]
                const increment = prior === 0 ? FIRST_MATCH_WEIGHT : SUBSEQUENT_MATCH_WEIGHT
                dimensions[dim] = prior + increment
                if (findings.length < 50) {
                    findings.push({ dim, line: line.slice(1).trim().slice(0, 200) })
                }
            }
        }
    }

    const scoreTotal = Object.values(dimensions).reduce((a, b) => a + b, 0)
    let recommendedAction = 'none'
    const maxDim = Math.max(...Object.values(dimensions))
    if (maxDim >= 4 || scoreTotal >= 7) recommendedAction = 'resequence'
    else if (scoreTotal >= 3) recommendedAction = 'append'

    return { scoreTotal, dimensions, recommendedAction, findings }
}

try {
    const result = analyze()
    process.stdout.write(JSON.stringify(result, null, 2))
} catch (err) {
    console.error('Analyzer failed:', err)
    process.exit(1)
}
