import assert from 'node:assert/strict'
import test from 'node:test'

import { computeUpdatedDescription } from './reanalyze-milestone.mjs'
import {
    extractDepsFromBody,
    buildDependencyGraph,
    topologicalLayers,
    parseOrderedIssueNumbers,
    parseCoordinatorIssueNumbers
} from './lib/milestone-delivery-description.mjs'

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

// ── New tests ────────────────────────────────────────────────────────────────────────────────

test('parseOrderedIssueNumbers: tolerates blank lines between Order: and first item', () => {
    const description = [
        '### Slice 1 — Foundation',
        '',
        'Order:',
        '',
        '1. #123 First issue',
        '2. #456 Second issue'
    ].join('\n')

    const ordered = parseOrderedIssueNumbers(description)

    assert.ok(ordered.has(123))
    assert.ok(ordered.has(456))
})

test('parseOrderedIssueNumbers: multiple blank lines before first item', () => {
    const description = 'Order:\n\n\n1. #999 Issue'
    const ordered = parseOrderedIssueNumbers(description)
    assert.ok(ordered.has(999))
})

test('parseOrderedIssueNumbers: stops at next ### header after items', () => {
    const description = [
        'Order:',
        '1. #10 Feature',
        '',
        '### Slice 2 — Next',
        '',
        'Order:',
        '1. #20 Feature'
    ].join('\n')

    const ordered = parseOrderedIssueNumbers(description)
    assert.ok(ordered.has(10))
    assert.ok(ordered.has(20))
})

test('parseCoordinatorIssueNumbers: parses coordinator block', () => {
    const description = [
        '### Slice 1 — Foundation',
        '',
        'Coordinator:',
        '- #895 Epic issue',
        '- #896 Another epic',
        '',
        'Order:',
        '1. #100 Feature'
    ].join('\n')

    const coordinators = parseCoordinatorIssueNumbers(description)

    assert.ok(coordinators.has(895))
    assert.ok(coordinators.has(896))
    assert.equal(coordinators.has(100), false)
})

test('computeUpdatedDescription: epic in Coordinator section is not listed as epicGap', () => {
    const repo = 'piquet-h/the-shifting-atlas'
    const milestone = {
        number: 50,
        title: 'Test Milestone',
        state: 'open',
        description: [
            '## Delivery slices',
            '',
            '### Slice 1 — Foundation',
            '',
            'Coordinator:',
            '- #100 Epic issue',
            '',
            'Order:',
            '1. #200 Feature issue'
        ].join('\n')
    }

    const issues = [
        makeIssue({ number: 100, title: 'Epic issue', state: 'open', labels: ['epic', 'scope:core'] }),
        makeIssue({ number: 200, title: 'Feature issue', state: 'open', labels: ['feature', 'scope:core'] })
    ]

    const { summary } = computeUpdatedDescription({ repo, milestone, issues })

    assert.deepEqual(summary.epicGaps, [])
    assert.deepEqual(summary.gaps, [])
    assert.deepEqual(summary.unplacedGaps, [])
})

test('topologicalLayers: dependent issues placed in later layers', () => {
    const depGraph = new Map([
        [100, new Set()],
        [200, new Set([100])],
        [300, new Set([100])]
    ])

    const layers = topologicalLayers([100, 200, 300], depGraph)

    assert.equal(layers.length, 2)
    assert.ok(layers[0].includes(100))
    assert.ok(layers[1].includes(200))
    assert.ok(layers[1].includes(300))
})

test('topologicalLayers: issues with no deps all land in layer 0', () => {
    const depGraph = new Map([
        [1, new Set()],
        [2, new Set()],
        [3, new Set()]
    ])

    const layers = topologicalLayers([1, 2, 3], depGraph)

    assert.equal(layers.length, 1)
    assert.deepEqual(layers[0], [1, 2, 3])
})

test('topologicalLayers: three-level chain produces three layers', () => {
    const depGraph = new Map([
        [10, new Set()],
        [20, new Set([10])],
        [30, new Set([20])]
    ])

    const layers = topologicalLayers([10, 20, 30], depGraph)

    assert.equal(layers.length, 3)
    assert.deepEqual(layers[0], [10])
    assert.deepEqual(layers[1], [20])
    assert.deepEqual(layers[2], [30])
})

test('extractDepsFromBody: parses Blocked by, Depends on, Requires', () => {
    const body = [
        'This issue is Blocked by #100 and depends on #200.',
        'Also requires #300.',
        'Not a dep: #400 is mentioned in passing.'
    ].join('\n')

    const deps = extractDepsFromBody(body)
    assert.ok(deps.has(100))
    assert.ok(deps.has(200))
    assert.ok(deps.has(300))
    assert.equal(deps.has(400), false)
})

test('buildDependencyGraph: sub-issues depend on parent', () => {
    const issues = [
        makeIssue({ number: 10, title: 'Parent epic', labels: ['epic'] }),
        makeIssue({ number: 11, title: 'Sub-task A' }),
        makeIssue({ number: 12, title: 'Sub-task B' })
    ]
    const subIssuesByNumber = new Map([
        [10, [{ number: 11, title: 'Sub-task A' }, { number: 12, title: 'Sub-task B' }]]
    ])

    const graph = buildDependencyGraph(issues, subIssuesByNumber)

    assert.ok(graph.get(11).has(10), 'sub-issue 11 should depend on parent 10')
    assert.ok(graph.get(12).has(10), 'sub-issue 12 should depend on parent 10')
    assert.equal(graph.get(10).size, 0, 'parent has no deps')
})

test('computeUpdatedDescription: idempotent with slice structure and ordered issues', () => {
    const repo = 'piquet-h/the-shifting-atlas'
    const description = [
        'Context line.',
        '',
        '## Delivery slices',
        '',
        '### Slice 1 — Foundation',
        '',
        'Order:',
        '1. #10 Feature A',
        '2. #11 Feature B'
    ].join('\n')

    const milestone = { number: 60, title: 'M6', state: 'open', description }
    const issues = [
        makeIssue({ number: 10, title: 'Feature A', state: 'open', labels: ['feature'] }),
        makeIssue({ number: 11, title: 'Feature B', state: 'open', labels: ['feature'] })
    ]

    const first = computeUpdatedDescription({ repo, milestone, issues })
    const second = computeUpdatedDescription({ repo, milestone: { ...milestone, description: first.updatedDescription }, issues })

    assert.equal(second.updatedDescription, first.updatedDescription)
})
