import assert from 'node:assert/strict'
import test from 'node:test'

import { computeUpdatedDescription } from './reanalyze-milestone.mjs'

function makeIssue({ number, title, state = 'open', labels = [], body = '' }) {
    return { number, title, state, labels, body }
}

test('computeUpdatedDescription: no slice template preserves human summary and adds auto impact block', () => {
    const repo = 'piquet-h/the-shifting-atlas'
    const milestone = {
        number: 13,
        title: 'M3c Temporal PI-0',
        state: 'closed',
        description: 'Temporal foundations: clocks, durations, reconcile policies.'
    }

    const issues = [
        makeIssue({ number: 1, title: 'Closed thing', state: 'closed', labels: ['feature', 'scope:systems'] }),
        makeIssue({ number: 2, title: 'Still open', state: 'open', labels: ['enhancement', 'scope:systems'] })
    ]

    const { updatedDescription, summary } = computeUpdatedDescription({ repo, milestone, issues })

    assert.ok(updatedDescription.startsWith(milestone.description))
    assert.ok(updatedDescription.includes('<!-- AUTO-GENERATED: milestone-impact-report:start -->'))
    assert.ok(updatedDescription.includes('## Delivery impact report (auto)'))

    // No slice mutations unless the template exists.
    assert.equal(summary.usedSliceTemplate, false)
    assert.equal(updatedDescription.includes('## Slice 0'), false)
})

test('computeUpdatedDescription: is idempotent for the auto-generated block', () => {
    const repo = 'piquet-h/the-shifting-atlas'

    const firstMilestone = {
        number: 10,
        title: 'M5 Quality & Depth',
        state: 'open',
        description: 'Content enrichment via layering + comprehensive observability.'
    }

    const issues = [
        makeIssue({ number: 10, title: 'Docs follow-up', state: 'open', labels: ['docs', 'scope:observability'] }),
        makeIssue({ number: 11, title: 'Duplicate of #12', state: 'closed', labels: ['enhancement'], body: 'Duplicate issue' })
    ]

    const first = computeUpdatedDescription({ repo, milestone: firstMilestone, issues })

    const secondMilestone = {
        ...firstMilestone,
        description: first.updatedDescription
    }

    const second = computeUpdatedDescription({ repo, milestone: secondMilestone, issues })

    assert.equal(second.updatedDescription, first.updatedDescription)
})
