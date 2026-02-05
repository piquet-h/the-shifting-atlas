import assert from 'node:assert/strict'
import test from 'node:test'

import * as updater from './update-open-milestones-on-issue-closed.mjs'

const { replaceSliceOrders } = updater

test('replaceSliceOrders: rewrites Order list for a matching slice header', () => {
    const description = [
        '## Delivery slices',
        '',
        '### Slice 1 — Opening Wow (hero prose on first look)',
        '',
        'Order:',
        '1. #736 Old A',
        '2. #737 Old B',
        '',
        '### Slice 2 — World expansion (batch generation, optional)',
        '',
        'Order:',
        '1. #585 Old C'
    ].join('\n')

    const issueByNumber = new Map([
        [736, { number: 736, title: 'Define hero layer convention + idempotency' }],
        [737, { number: 737, title: 'Composer: hero replaces base, deterministic selection' }],
        [585, { number: 585, title: 'Terrain guidance config + tests' }]
    ])

    const updated = replaceSliceOrders({
        description,
        sliceOrders: [
            {
                header: 'Slice 1 — Opening Wow (hero prose on first look)',
                order: [737, 736]
            }
        ],
        issueByNumber
    })

    assert.ok(updated.includes('Order:'))
    assert.ok(updated.includes('1. #737 Composer: hero replaces base, deterministic selection'))
    assert.ok(updated.includes('2. #736 Define hero layer convention + idempotency'))

    // Ensure Slice 2 unchanged.
    assert.ok(updated.includes('1. #585 Old C'))
})

test('no auto-generated block helpers are exported (single concise milestone description)', () => {
    // The updater should NOT maintain extra auto-generated blocks in milestone descriptions.
    // We want the milestone delivery order to remain a single concise source of truth.
    assert.equal(typeof updater.upsertAutoBlock, 'undefined')
})

test('buildMilestonePromptPayload: only includes issues referenced by sliceOrders', () => {
    assert.equal(typeof updater.buildMilestonePromptPayload, 'function')

    const payload = updater.buildMilestonePromptPayload({
        closedIssue: { number: 999, title: 'Closed issue', state: 'closed', labels: ['scope:world'] },
        closingPullRequest: { number: 123, title: 'PR', body: 'x'.repeat(5000), files: [] },
        milestone: {
            number: 14,
            title: 'M4b World Generation',
            descriptionExcerpt: '...',
            sliceOrders: [
                { header: 'Slice 1 — Foo', order: [1, 3] },
                { header: 'Slice 2 — Bar', order: [2] }
            ],
            issues: [
                { number: 1, title: 'One', state: 'open', labels: [] },
                { number: 2, title: 'Two', state: 'open', labels: [] },
                { number: 3, title: 'Three', state: 'open', labels: [] },
                { number: 4, title: 'Not in order', state: 'open', labels: [] }
            ]
        }
    })

    const includedNumbers = new Set(payload.milestone.issues.map((i) => i.number))
    assert.deepEqual(
        [...includedNumbers].sort((a, b) => a - b),
        [1, 2, 3]
    )
    assert.equal(
        payload.milestone.issues.some((i) => i.number === 4),
        false
    )

    // Closed issue and PR should be truncated for prompt safety.
    assert.equal(payload.closedIssue.number, 999)
    assert.ok(payload.closingPullRequest.body.length <= 1200)
})

test('buildMilestonePromptPayload: includes issue bodies and repo docs excerpts (truncated)', () => {
    const payload = updater.buildMilestonePromptPayload({
        closedIssue: {
            number: 500,
            title: 'Closed issue',
            body: 'C'.repeat(5000),
            state: 'closed',
            labels: ['scope:world']
        },
        closingPullRequest: null,
        milestone: {
            number: 14,
            title: 'M4b World Generation',
            descriptionExcerpt: '...',
            sliceOrders: [{ header: 'Slice 1 — Foo', order: [1] }],
            issues: [{ number: 1, title: 'One', body: 'B'.repeat(5000), state: 'open', labels: [] }]
        },
        repoContext: {
            roadmapExcerpt: 'R'.repeat(5000),
            tenetsExcerpt: 'T'.repeat(5000)
        }
    })

    assert.ok(payload.closedIssue.body.length <= 800)
    assert.ok(payload.milestone.issues[0].body.length <= 300)
    assert.ok(payload.repoContext.roadmapExcerpt.length <= 1200)
    assert.ok(payload.repoContext.tenetsExcerpt.length <= 1200)
})

test('shouldCloseMilestone: closes when no open issues remain (but had issues)', () => {
    assert.equal(typeof updater.shouldCloseMilestone, 'function')
    assert.equal(updater.shouldCloseMilestone([]), false)
    assert.equal(
        updater.shouldCloseMilestone([
            { number: 1, state: 'closed' },
            { number: 2, state: 'closed' }
        ]),
        true
    )
    assert.equal(
        updater.shouldCloseMilestone([
            { number: 1, state: 'open' },
            { number: 2, state: 'closed' }
        ]),
        false
    )
})

test('buildMilestonePromptPayload: falls back to open issues when no order numbers exist yet', () => {
    const payload = updater.buildMilestonePromptPayload({
        closedIssue: { number: 1000, title: 'Closed issue', state: 'closed', labels: [] },
        closingPullRequest: null,
        milestone: {
            number: 15,
            title: 'Empty order milestone',
            descriptionExcerpt: '',
            sliceOrders: [{ header: 'Slice 1 — Foo', order: [] }],
            issues: [
                { number: 1, title: 'One', state: 'open', labels: [] },
                { number: 2, title: 'Two', state: 'open', labels: [] },
                { number: 3, title: 'Three', state: 'open', labels: [] },
                { number: 4, title: 'Closed', state: 'closed', labels: [] }
            ]
        }
    })

    const includedNumbers = payload.milestone.issues.map((i) => i.number)
    assert.deepEqual(includedNumbers, [1, 2, 3])
})
