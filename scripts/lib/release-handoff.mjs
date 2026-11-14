#!/usr/bin/env node
/* eslint-env node */

const STATE_LABEL_PREFIX = 'state:'
export const TESTING_STATE_LABEL = 'state:testing'

/**
 * Extracts referenced GitHub issue numbers from commit messages while ignoring
 * GitHub's "Merge pull request #NNN" headline so PR numbers are never confused
 * with issue numbers.
 */
export function extractReferencedIssueNumbers(commitMessages) {
    const found = new Set()

    for (const rawMessage of commitMessages ?? []) {
        const sanitized = String(rawMessage ?? '').replace(/^Merge pull request #\d+[^\r\n]*/gim, '')
        for (const match of sanitized.matchAll(/(?:^|[\s([,:])#(\d+)\b/g)) {
            const num = Number(match[1])
            if (Number.isSafeInteger(num) && num > 0) {
                found.add(num)
            }
        }
    }

    return [...found].sort((a, b) => a - b)
}

export function buildDeployReceiptMarker(unit, commitSha) {
    return `<!-- shifting-atlas-deploy-receipt:${unit}:${String(commitSha).slice(0, 16)} -->`
}

export function buildTestingTransitionPlan({ issue, unit, commitSha, runUrl }) {
    if (!issue || issue.pull_request) {
        return { eligible: false, reason: 'pull-request-or-missing' }
    }
    if (String(issue.state).toLowerCase() !== 'open') {
        return { eligible: false, reason: 'issue-not-open' }
    }

    const currentLabels = (issue.labels ?? []).map((l) => (typeof l === 'string' ? l : l?.name)).filter(Boolean)
    if (currentLabels.includes('epic')) {
        return { eligible: false, reason: 'coordinator-epic' }
    }

    const nextLabels = currentLabels.filter((name) => !name.startsWith(STATE_LABEL_PREFIX))
    nextLabels.push(TESTING_STATE_LABEL)

    const shortSha = String(commitSha).slice(0, 8)
    const commentMarker = buildDeployReceiptMarker(unit, commitSha)
    const runLink = runUrl ? ` ([workflow run](${runUrl}))` : ''
    const commentBody = [
        commentMarker,
        `Deployed **${unit}** at commit \`${shortSha}\`${runLink}.`,
        `Transitioned issue state to \`${TESTING_STATE_LABEL}\` pending post-deploy verification.`
    ].join('\n')

    return {
        eligible: true,
        issueNumber: issue.number,
        nextLabels,
        commentMarker,
        commentBody
    }
}
