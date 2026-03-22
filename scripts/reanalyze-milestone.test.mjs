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

test('computeUpdatedDescription: recognizes delivery-slices template without injecting Slice 0 when no infra gaps exist', () => {
    const repo = 'piquet-h/the-shifting-atlas'
    const milestone = {
        number: 22,
        title: 'M4d Macro Geography & Frontier Coherence',
        state: 'open',
        description: [
            'Intro line.',
            '',
            '## Delivery slices',
            '',
            '### Slice 1 — Runtime',
            '',
            'Order:',
            '1. #895 Runtime epic'
        ].join('\n')
    }

    const issues = [makeIssue({ number: 895, title: 'Runtime epic', state: 'open', labels: ['scope:world', 'epic'] })]

    const { updatedDescription, summary } = computeUpdatedDescription({ repo, milestone, issues })

    assert.equal(summary.usedSliceTemplate, true)
    assert.equal(updatedDescription.includes('### Slice 0 — Prerequisites (infra)'), false)
    assert.ok(updatedDescription.includes('### Slice 1 — Runtime'))
})

test('computeUpdatedDescription: treats state_reason=not_planned as superseded', () => {
    const repo = 'piquet-h/the-shifting-atlas'
    const milestone = {
        number: 17,
        title: 'M5b Layering',
        state: 'open',
        description: [
            'Layer validation, ambient context, description composition',
            '',
            '## Delivery slices',
            '',
            '### Slice 1 — M5b Layering',
            '',
            'Order:',
            '1. #442 Core Layer Validation Rules'
        ].join('\n')
    }

    const issues = [
        makeIssue({ number: 442, title: 'Core Layer Validation Rules', state: 'open', labels: ['feature', 'scope:world'] }),
        { number: 157, title: 'Core Layer Validation Rules', state: 'closed', state_reason: 'not_planned', labels: ['feature', 'scope:world'], body: 'Closing as duplicate of #442' },
        { number: 158, title: 'Similarity & Duplicate Layer Detection', state: 'closed', state_reason: 'not_planned', labels: ['feature', 'scope:world'], body: 'Duplicate issue' }
    ]

    const { summary } = computeUpdatedDescription({ repo, milestone, issues })

    assert.deepEqual(summary.supersededInMilestone.sort(), [157, 158])
    assert.equal(summary.issuesInMilestone, 1) // only #442 is effective
})

test('computeUpdatedDescription: closed completed issues do not appear as gaps', () => {
    const repo = 'piquet-h/the-shifting-atlas'
    const milestone = {
        number: 15,
        title: 'M4c Agent Sandbox (Write-lite)',
        state: 'open',
        description: [
            'Focus: agent sandbox',
            '',
            '## Delivery slices',
            '',
            '### Slice 1 — M4c Agent Sandbox (Write-lite)',
            '',
            'Order:',
            '1. #781 feature(ai): ResolvePlayerCommand endpoint'
        ].join('\n')
    }

    const issues = [
        makeIssue({ number: 781, title: 'feature(ai): ResolvePlayerCommand endpoint', state: 'open', labels: ['feature', 'scope:ai'] }),
        // Closed completed issue — should NOT appear as a gap
        { number: 703, title: 'feat(ai): Minimal agent runtime', state: 'closed', state_reason: 'completed', labels: ['feature', 'scope:ai'], body: '' },
        { number: 788, title: 'feature(core): Define ActionIntent contract', state: 'closed', state_reason: 'completed', labels: ['feature', 'scope:core'], body: '' }
    ]

    const { summary } = computeUpdatedDescription({ repo, milestone, issues })

    // Completed issues are effective (not superseded) but should not be gaps
    assert.equal(summary.issuesInMilestone, 3)
    assert.deepEqual(summary.gaps, [])
    assert.deepEqual(summary.unplacedGaps, [])
})
