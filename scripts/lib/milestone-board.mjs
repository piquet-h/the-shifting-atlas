#!/usr/bin/env node
/* eslint-env node */

import { createHash } from 'node:crypto'

import { extractDepsFromBody, parseOrderedIssueNumbers, topologicalLayers } from './milestone-delivery-description.mjs'

export const STATE_LABELS = Object.freeze({
    new: { name: 'state:new', color: 'd4c5f9', description: 'Unrefined atomic issue awaiting readiness gate' },
    ready: { name: 'state:ready', color: '0e8a16', description: 'Refined atomic issue with executable verifier, ready to build' },
    inProgress: { name: 'state:in-progress', color: '1d76db', description: 'Active implementation or open pull request' },
    testing: { name: 'state:testing', color: 'fbca04', description: 'Deployed to production; awaiting post-deploy verification' },
    needsDiscussion: { name: 'needs-discussion', color: 'd93f0b', description: 'Paused pending product/scope clarification' },
    needsOperator: { name: 'needs-operator', color: 'b60205', description: 'Awaiting operator visual sign-off or intervention' }
})

const CLAIM_MARKER_REGEX = /<!--\s*shifting-atlas-claim:(\{[^\r\n]*?\})\s*-->/
const VERIFIER_FENCE_REGEX = /##\s+Verifier\s+```json\s*([\s\S]*?)```/i
const GUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

function getLabelNames(issue) {
    return (issue?.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean)
}

function parseMilestoneSortKey(title) {
    const match = String(title ?? '').match(/\bM(\d+)([a-z])?\b/i)
    if (!match) {
        return { hasPrefix: false, major: Number.MAX_SAFE_INTEGER, minor: '' }
    }
    return {
        hasPrefix: true,
        major: Number(match[1]),
        minor: (match[2] ?? '').toLowerCase()
    }
}

export function rankOpenMilestones(milestones) {
    return [...(milestones ?? [])]
        .filter((m) => (m?.open_issues ?? 1) > 0)
        .sort((a, b) => {
            const ka = parseMilestoneSortKey(a.title)
            const kb = parseMilestoneSortKey(b.title)
            if (ka.major !== kb.major) return ka.major - kb.major
            if (ka.minor !== kb.minor) return ka.minor < kb.minor ? -1 : 1
            return (a.number ?? 0) - (b.number ?? 0)
        })
}

export function classifyIssueState(issue) {
    const labels = getLabelNames(issue)
    if (labels.includes(STATE_LABELS.testing.name)) return 'testing'
    if (labels.includes(STATE_LABELS.inProgress.name)) return 'inProgress'
    if (labels.includes(STATE_LABELS.ready.name)) return 'ready'
    return 'new'
}

export function computeMilestoneSnapshot({ milestone, issues, wipLimits = { inProgress: 3, ready: 5 } }) {
    const allIssues = issues ?? []
    const openNumberSet = new Set(
        allIssues.filter((i) => !i?.pull_request && String(i?.state ?? 'open').toLowerCase() === 'open').map((i) => i.number)
    )

    const executable = allIssues.filter((issue) => {
        if (!issue || issue.pull_request) return false
        if (String(issue.state ?? 'open').toLowerCase() !== 'open') return false
        const labels = getLabelNames(issue)
        if (labels.includes('epic')) return false
        return true
    })

    const depGraph = new Map()
    for (const issue of executable) {
        const deps = new Set([...(issue.blockedBy ?? []), ...extractDepsFromBody(issue.body ?? '')])
        // Keep only open blockers (closed blockers are satisfied)
        const openDeps = new Set([...deps].filter((depNum) => depNum !== issue.number && openNumberSet.has(depNum)))
        depGraph.set(issue.number, openDeps)
    }

    const explicitOrder = parseOrderedIssueNumbers(milestone?.description ?? '')
    const explicitRank = new Map(explicitOrder.map((num, idx) => [num, idx]))
    const { layers } = topologicalLayers(
        executable.map((i) => i.number),
        depGraph
    )
    const layerRank = new Map()
    layers.forEach((layerNodes, layerIdx) => {
        for (const num of layerNodes) layerRank.set(num, layerIdx)
    })

    const sortedExecutable = [...executable].sort((a, b) => {
        const ra = explicitRank.has(a.number) ? explicitRank.get(a.number) : Number.MAX_SAFE_INTEGER
        const rb = explicitRank.has(b.number) ? explicitRank.get(b.number) : Number.MAX_SAFE_INTEGER
        if (ra !== rb) return ra - rb
        const la = layerRank.get(a.number) ?? Number.MAX_SAFE_INTEGER
        const lb = layerRank.get(b.number) ?? Number.MAX_SAFE_INTEGER
        if (la !== lb) return la - lb
        return a.number - b.number
    })

    const columns = {
        testing: [],
        inProgress: [],
        ready: [],
        new: []
    }

    for (const issue of sortedExecutable) {
        const state = classifyIssueState(issue)
        columns[state].push(issue)
    }

    const isEligibleForAutoPickup = (issue) => {
        const labels = getLabelNames(issue)
        if (labels.includes(STATE_LABELS.needsDiscussion.name) || labels.includes(STATE_LABELS.needsOperator.name)) {
            return false
        }
        const openBlockers = depGraph.get(issue.number) ?? new Set()
        return openBlockers.size === 0
    }

    const inProgressFree = Math.max(0, (wipLimits.inProgress ?? 3) - columns.inProgress.length)
    const readyFree = Math.max(0, (wipLimits.ready ?? 5) - columns.ready.length)

    const pullToBuild = columns.ready.filter(isEligibleForAutoPickup).slice(0, inProgressFree)
    const pullToRefine = columns.new.filter(isEligibleForAutoPickup).slice(0, readyFree)

    return {
        milestone: {
            number: milestone?.number,
            title: milestone?.title
        },
        columns,
        capacity: {
            inProgressCount: columns.inProgress.length,
            inProgressLimit: wipLimits.inProgress ?? 3,
            inProgressFree,
            readyCount: columns.ready.length,
            readyLimit: wipLimits.ready ?? 5,
            readyFree
        },
        openBlockersByIssue: Object.fromEntries([...depGraph.entries()].map(([num, set]) => [num, [...set].sort((a, b) => a - b)])),
        toProve: columns.testing,
        pullToBuild,
        pullToRefine
    }
}

export function parseVerifierBlock(body) {
    const match = String(body ?? '').match(VERIFIER_FENCE_REGEX)
    if (!match) return null
    try {
        return JSON.parse(match[1].trim())
    } catch {
        return null
    }
}

function buildDefaultVerifierForIssue(issue) {
    const labels = getLabelNames(issue)
    const isDocsOrTestOnly =
        labels.includes('docs') || labels.includes('test') || (labels.includes('scope:devx') && !labels.includes('feature'))
    if (isDocsOrTestOnly) {
        return {
            kind: 'ci-green',
            description: 'Main branch CI validation passes cleanly after merge'
        }
    }

    const isUiFacing =
        labels.includes('scope:frontend') ||
        labels.includes('scope:ui') ||
        /\bfrontend\/|\bReact\b|\bStatic Web App\b/i.test(String(issue?.body ?? ''))
    if (isUiFacing) {
        return {
            kind: 'http-200-and-operator-ui',
            requiresOperatorSignoff: true,
            description: 'Static Web App responds HTTP 200 and operator confirms UI behavior'
        }
    }

    return {
        kind: 'app-insights-zero-regressions',
        endpoint: '/api/player',
        lookback: '1h',
        description: 'Backend endpoint healthy and Application Insights reports zero new unhandled exceptions'
    }
}

export function evaluateReadinessAndBuildVerifier(issue) {
    const body = String(issue?.body ?? '').trim()
    const checkboxes = [...body.matchAll(/^\s*-\s*\[[ xX]\]\s+/gm)]

    if (checkboxes.length > 10) {
        return {
            ready: false,
            reason: 'exceeds-10-acceptance-criteria',
            note: `Issue #${issue?.number} defines ${checkboxes.length} acceptance checkboxes (>10 limit). Split into smaller atomic issues before building.`
        }
    }

    if (checkboxes.length === 0 && body.length < 40) {
        return {
            ready: false,
            reason: 'missing-acceptance-criteria',
            note: `Issue #${issue?.number} lacks testable acceptance criteria (\`- [ ]\`). Add explicit criteria before moving to \`state:ready\`.`
        }
    }

    let updatedBody = body
    const existingVerifier = parseVerifierBlock(body)
    const verifier = existingVerifier ?? buildDefaultVerifierForIssue(issue)
    if (!existingVerifier) {
        updatedBody = `${body}\n\n## Verifier\n\`\`\`json\n${JSON.stringify(verifier, null, 2)}\n\`\`\`\n`
    }

    const currentLabels = getLabelNames(issue).filter((name) => !name.startsWith('state:'))
    currentLabels.push(STATE_LABELS.ready.name)

    return {
        ready: true,
        verifier,
        updatedBody,
        nextLabels: currentLabels
    }
}

export function buildClaimComment({ runId, runAttempt = 1, worker = 1, owner = 'milestone-sweep' }) {
    const metadata = JSON.stringify({
        runId: Number(runId),
        attempt: Number(runAttempt),
        worker: Number(worker),
        owner,
        claimedAt: new Date().toISOString()
    })
    return [
        `<!-- shifting-atlas-claim:${metadata} -->`,
        `Claimed for automated delivery by **${owner}** (run \`${runId}\`, attempt \`${runAttempt}\`, worker \`${worker}\`).`
    ].join('\n')
}

export function parseLatestClaim(comments) {
    let latest = null
    for (const comment of comments ?? []) {
        const match = String(comment?.body ?? '').match(CLAIM_MARKER_REGEX)
        if (!match) continue
        try {
            latest = JSON.parse(match[1])
        } catch {
            // Ignore malformed markers
        }
    }
    return latest
}

export function planStoppedRunClaimRelease({ issue, comments, completedRunId, completedAttempt, hasOpenPr }) {
    const labels = getLabelNames(issue)
    if (!labels.includes(STATE_LABELS.inProgress.name)) {
        return { release: false, reason: 'not-in-progress' }
    }
    if (hasOpenPr) {
        return { release: false, reason: 'open-pr-exists' }
    }

    const latestClaim = parseLatestClaim(comments)
    if (!latestClaim) {
        return { release: false, reason: 'no-automation-claim' }
    }
    if (Number(latestClaim.runId) !== Number(completedRunId) || Number(latestClaim.attempt) !== Number(completedAttempt)) {
        return { release: false, reason: 'owned-by-different-run' }
    }

    const nextLabels = labels.filter((name) => !name.startsWith('state:'))
    nextLabels.push(STATE_LABELS.ready.name)

    return {
        release: true,
        nextLabels,
        releaseComment: `Released stopped execution claim from run \`${completedRunId}\` (attempt \`${completedAttempt}\`) with no open pull request; returned to \`${STATE_LABELS.ready.name}\`.`
    }
}

export function evaluateVerifierOutcome({ issue, healthOk = true, exceptionCount = 0, ciGreen = true }) {
    const labels = getLabelNames(issue)
    const verifier = parseVerifierBlock(issue?.body) ?? buildDefaultVerifierForIssue(issue)

    if (!healthOk || exceptionCount > 0 || !ciGreen) {
        const nextLabels = labels.filter((name) => !name.startsWith('state:'))
        nextLabels.push(STATE_LABELS.inProgress.name)
        return {
            disposition: 'return-in-progress',
            nextLabels,
            reason: `Post-deploy verification failed (healthOk=${healthOk}, exceptions=${exceptionCount}, ciGreen=${ciGreen}).`
        }
    }

    if (verifier.requiresOperatorSignoff || verifier.kind === 'http-200-and-operator-ui') {
        const nextLabels = [...new Set([...labels, STATE_LABELS.needsOperator.name])]
        return {
            disposition: 'await-operator',
            nextLabels,
            reason: 'Endpoint reachable; holding in state:testing for operator UI sign-off.'
        }
    }

    const nextLabels = labels.filter((name) => !name.startsWith('state:'))
    return {
        disposition: 'close-proven',
        nextLabels,
        reason: `Verified (${verifier.kind}): live endpoint healthy and zero post-deploy regressions.`
    }
}

export function fingerprintTelemetryCluster({ type = 'exception', name = '', problemId = '', outerMessage = '' }) {
    const normalizedMessage = String(outerMessage)
        .replace(GUID_REGEX, '<guid>')
        .replace(/\b\d{4,}\b/g, '<num>')
        .trim()
        .slice(0, 200)
    const raw = [type, String(name).trim(), String(problemId).trim(), normalizedMessage].join('|')
    return createHash('sha256').update(raw).digest('hex').slice(0, 16)
}
