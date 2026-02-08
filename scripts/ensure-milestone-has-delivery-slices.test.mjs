import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildDeliverySlicesTemplate,
    ensureDescriptionHasDeliverySlices,
    hasDeliverySlices
} from './ensure-milestone-has-delivery-slices.mjs'

test('hasDeliverySlices detects existing section', () => {
    assert.equal(hasDeliverySlices('## Delivery slices\n\n### Slice 1 — Foo'), true)
    assert.equal(hasDeliverySlices('Nope'), false)
})

test('buildDeliverySlicesTemplate includes open issues in numeric order', () => {
    const md = buildDeliverySlicesTemplate({
        milestoneTitle: 'M5 Quality & Depth',
        issues: [
            { number: 10, title: 'Closed', state: 'closed' },
            { number: 2, title: 'B', state: 'open' },
            { number: 1, title: 'A', state: 'open' }
        ]
    })

    assert.ok(md.includes('## Delivery slices'))
    assert.ok(md.includes('### Slice 1 — M5 Quality & Depth'))
    assert.ok(md.includes('1. #1 A'))
    assert.ok(md.includes('2. #2 B'))
    assert.equal(md.includes('#10'), false)
})

test('ensureDescriptionHasDeliverySlices appends template if missing', () => {
    const out = ensureDescriptionHasDeliverySlices({
        description: 'Focus line.',
        milestoneTitle: 'M6 Systems',
        issues: []
    })

    assert.ok(out.startsWith('Focus line.'))
    assert.ok(out.includes('## Delivery slices'))
})

test('ensureDescriptionHasDeliverySlices is idempotent (with same issues)', () => {
    const issues = [
        { number: 1, title: 'A', state: 'open' },
        { number: 2, title: 'B', state: 'open' }
    ]

    const first = ensureDescriptionHasDeliverySlices({
        description: 'Focus\n\n## Delivery slices\n\n### Slice 1 — X\n\nOrder:\n1. #1 A',
        milestoneTitle: 'Ignored',
        issues
    })

    const second = ensureDescriptionHasDeliverySlices({
        description: first,
        milestoneTitle: 'Ignored',
        issues
    })

    assert.equal(second, first)
})

test('ensureDescriptionHasDeliverySlices: adds missing open issues to the order', () => {
    const out = ensureDescriptionHasDeliverySlices({
        description: [
            '## Delivery slices',
            '',
            '### Slice 1 — X',
            '',
            'Order:',
            '1. #1 A'
        ].join('\n'),
        milestoneTitle: 'Ignored',
        issues: [
            { number: 1, title: 'A', state: 'open' },
            { number: 2, title: 'B', state: 'open' }
        ]
    })

    assert.ok(out.includes('1. #1 A'))
    assert.ok(out.includes('2. #2 B'))
})

test('ensureDescriptionHasDeliverySlices: removes closed issues from the order', () => {
    const out = ensureDescriptionHasDeliverySlices({
        description: [
            '## Delivery slices',
            '',
            '### Slice 1 — X',
            '',
            'Order:',
            '1. #1 A',
            '2. #2 B'
        ].join('\n'),
        milestoneTitle: 'Ignored',
        issues: [
            { number: 1, title: 'A', state: 'open' },
            { number: 2, title: 'B', state: 'closed' }
        ]
    })

    assert.ok(out.includes('1. #1 A'))
    assert.equal(out.includes('#2'), false)
})

test('ensureDescriptionHasDeliverySlices: refreshes titles for open issues', () => {
    const out = ensureDescriptionHasDeliverySlices({
        description: [
            '## Delivery slices',
            '',
            '### Slice 1 — X',
            '',
            'Order:',
            '1. #1 Old title'
        ].join('\n'),
        milestoneTitle: 'Ignored',
        issues: [{ number: 1, title: 'New title', state: 'open' }]
    })

    assert.ok(out.includes('1. #1 New title'))
    assert.equal(out.includes('Old title'), false)
})
