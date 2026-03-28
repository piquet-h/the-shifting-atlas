import assert from 'node:assert/strict'
import test from 'node:test'

import {
    parseCoordinatorIssueNumbers,
    parseOrderedIssueNumbers,
    topologicalLayers
} from './lib/milestone-delivery-description.mjs'
import { computeUpdatedDescription } from './reanalyze-milestone.mjs'

function makeIssue({ number, title, state = 'open', labels = [], body = '', blockedBy = [], state_reason = null }) {
    return { number, title, state, labels, body, blockedBy, state_reason }
}

test('parseOrderedIssueNumbers: tolerates blank lines between Order: and first item', () => {
    const description = [
        '### Slice 1 — Dependency layer 1',
        '',
        'Order:',
        '',
        '1. #123 First issue',
        '2. #456 Second issue'
    ].join('\n')

    const ordered = parseOrderedIssueNumbers(description)

    assert.deepEqual(ordered, [123, 456])
})

test('parseCoordinatorIssueNumbers: parses coordinator block independently of Order block', () => {
    const description = [
        '### Slice 1 — Dependency layer 1',
        '',
        'Coordinator:',
        '- #895 Epic issue',
        '- #896 Another epic',
        '',
        'Order:',
        '1. #100 Feature'
    ].join('\n')

    const coordinators = parseCoordinatorIssueNumbers(description)

    assert.deepEqual(coordinators, [895, 896])
})

test('topologicalLayers: groups nodes by dependency depth', () => {
    const depGraph = new Map([
        [10, new Set()],
        [20, new Set([10])],
        [30, new Set([10])],
        [40, new Set([20, 30])]
    ])

    const { layers, remaining } = topologicalLayers([10, 20, 30, 40], depGraph)

    assert.deepEqual(layers, [[10], [20, 30], [40]])
    assert.deepEqual(remaining, [])
})

test('computeUpdatedDescription: builds deterministic dependency-first slices', () => {
    const repo = 'piquet-h/the-shifting-atlas'
    const milestone = {
        number: 22,
        title: 'M4d Macro Geography & Frontier Coherence',
        state: 'open',
        description: 'Old generated text that should be replaced.'
    }

    const issues = [
        makeIssue({ number: 894, title: 'Closed groundwork epic', state: 'closed', labels: ['epic', 'scope:world'], state_reason: 'completed' }),
        makeIssue({ number: 896, title: 'Contract coordinator epic', labels: ['epic', 'scope:world'], blockedBy: [{ number: 894, state: 'closed', title: 'Closed groundwork epic' }] }),
        makeIssue({ number: 892, title: 'Structured frontier metadata', labels: ['enhancement', 'scope:world'], blockedBy: [{ number: 894, state: 'closed', title: 'Closed groundwork epic' }] }),
        makeIssue({ number: 911, title: 'Atlas transition metadata', labels: ['enhancement', 'scope:world'] }),
        makeIssue({ number: 895, title: 'Runtime coordinator epic', labels: ['epic', 'scope:world'], blockedBy: [{ number: 896, state: 'open', title: 'Contract coordinator epic' }, { number: 892, state: 'open', title: 'Structured frontier metadata' }] }),
        makeIssue({ number: 897, title: 'Prefetch shaping', labels: ['enhancement', 'scope:world'] }),
        makeIssue({ number: 906, title: 'Resolve transition thresholds', labels: ['enhancement', 'scope:world'], blockedBy: [{ number: 911, state: 'open', title: 'Atlas transition metadata' }] }),
        makeIssue({ number: 904, title: 'Apply transition-aware boundaries', labels: ['enhancement', 'scope:world'], blockedBy: [{ number: 897, state: 'open', title: 'Prefetch shaping' }, { number: 906, state: 'open', title: 'Resolve transition thresholds' }] }),
        makeIssue({ number: 903, title: 'Tests for ready transitions', labels: ['test', 'scope:world'], blockedBy: [{ number: 904, state: 'open', title: 'Apply transition-aware boundaries' }] }),
        makeIssue({ number: 898, title: 'Document precedence rules', labels: ['docs', 'scope:world'], blockedBy: [{ number: 911, state: 'open', title: 'Atlas transition metadata' }] }),
        makeIssue({ number: 893, title: 'Cleanup coordinator epic', labels: ['epic', 'scope:world'], blockedBy: [{ number: 895, state: 'open', title: 'Runtime coordinator epic' }] }),
        makeIssue({ number: 963, title: 'Superseded option', state: 'closed', labels: ['enhancement', 'scope:world'], state_reason: 'not_planned' })
    ]

    const { updatedDescription, summary } = computeUpdatedDescription({ repo, milestone, issues })

    assert.ok(updatedDescription.startsWith('M4d Macro Geography & Frontier Coherence delivery plan is machine-generated'))
    assert.ok(updatedDescription.includes('## Closed groundwork'))
    assert.ok(updatedDescription.includes('#894'))
    assert.ok(updatedDescription.includes('### Slice 1 — Dependency layer 1'))
    assert.ok(updatedDescription.includes('Coordinator:'))
    assert.ok(updatedDescription.includes('#896'))
    assert.ok(updatedDescription.includes('#911'))
    assert.ok(updatedDescription.includes('#892'))
    assert.ok(updatedDescription.includes('### Slice 2 — Dependency layer 2'))
    assert.ok(updatedDescription.includes('#895'))
    assert.ok(updatedDescription.includes('#897'))
    assert.ok(updatedDescription.includes('#898'))
    assert.ok(updatedDescription.includes('#906'))
    assert.ok(updatedDescription.includes('### Slice 3 — Dependency layer 3'))
    assert.ok(updatedDescription.includes('#904'))
    assert.ok(updatedDescription.includes('### Slice 4 — Dependency layer 4'))
    assert.ok(updatedDescription.includes('#903'))
    assert.deepEqual(summary.supersededInMilestone, [963])
    assert.deepEqual(summary.dependencyViolations, [])
    assert.deepEqual(summary.externalBlocked, [])
    assert.equal(summary.usedSliceTemplate, true)
})

test('computeUpdatedDescription: reports external blockers and dependency conflicts', () => {
    const repo = 'piquet-h/the-shifting-atlas'
    const milestone = {
        number: 99,
        title: 'Dependency Test',
        state: 'open',
        description: ''
    }

    const issues = [
        makeIssue({ number: 10, title: 'External blocker issue', labels: ['feature'], blockedBy: [{ number: 1000, state: 'open', title: 'Outside milestone blocker' }] }),
        makeIssue({ number: 20, title: 'Cycle A', labels: ['feature'], blockedBy: [{ number: 30, state: 'open', title: 'Cycle B' }] }),
        makeIssue({ number: 30, title: 'Cycle B', labels: ['feature'], blockedBy: [{ number: 20, state: 'open', title: 'Cycle A' }] })
    ]

    const { updatedDescription, summary } = computeUpdatedDescription({ repo, milestone, issues })

    assert.ok(updatedDescription.includes('## Blocked outside this milestone'))
    assert.ok(updatedDescription.includes('#10'))
    assert.ok(updatedDescription.includes('## Dependency conflicts (needs decision)'))
    assert.ok(updatedDescription.includes('#20'))
    assert.ok(updatedDescription.includes('#30'))
    assert.deepEqual(summary.externalBlocked, [10])
    assert.deepEqual(summary.dependencyConflicts, [20, 30])
})

test('computeUpdatedDescription: is idempotent with deterministic regeneration', () => {
    const repo = 'piquet-h/the-shifting-atlas'
    const milestone = {
        number: 10,
        title: 'M5 Quality & Depth',
        state: 'open',
        description: 'Some previous text'
    }

    const issues = [makeIssue({ number: 10, title: 'Feature A', labels: ['feature'] }), makeIssue({ number: 11, title: 'Docs B', labels: ['docs'] })]

    const first = computeUpdatedDescription({ repo, milestone, issues })
    const second = computeUpdatedDescription({ repo, milestone: { ...milestone, description: first.updatedDescription }, issues })

    assert.equal(second.updatedDescription, first.updatedDescription)
})
