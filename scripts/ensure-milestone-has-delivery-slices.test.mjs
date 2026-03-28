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
        repo: 'piquet-h/the-shifting-atlas',
        milestoneNumber: 16,
        milestoneTitle: 'M5 Quality & Depth',
        issues: [
            { number: 10, title: 'Closed', state: 'closed' },
            { number: 2, title: 'B', state: 'open' },
            { number: 1, title: 'A', state: 'open' }
        ]
    })

    assert.ok(md.startsWith('M5 Quality & Depth delivery plan is machine-generated'))
    assert.ok(md.includes('## Delivery slices'))
    assert.ok(md.includes('### Slice 1 — Dependency layer 1'))
    assert.ok(md.includes('1. [#1]'))
    assert.ok(md.includes('2. [#2]'))
    assert.ok(md.includes('## Closed groundwork'))
    assert.ok(md.includes('Closed'))
})

test('ensureDescriptionHasDeliverySlices appends template if missing', () => {
    const out = ensureDescriptionHasDeliverySlices({
        repo: 'piquet-h/the-shifting-atlas',
        milestoneNumber: 18,
        description: 'Focus line that should be replaced.',
        milestoneTitle: 'M6 Systems',
        issues: []
    })

    assert.ok(out.startsWith('M6 Systems delivery plan is machine-generated'))
    assert.ok(out.includes('## Delivery slices'))
    assert.ok(out.includes('- (add issues, then reorder)'))
})

test('ensureDescriptionHasDeliverySlices is idempotent (with same issues)', () => {
    const issues = [
        { number: 1, title: 'A', state: 'open' },
        { number: 2, title: 'B', state: 'open' }
    ]

    const first = ensureDescriptionHasDeliverySlices({
        repo: 'piquet-h/the-shifting-atlas',
        milestoneNumber: 18,
        description: 'Legacy text',
        milestoneTitle: 'Ignored',
        issues
    })

    const second = ensureDescriptionHasDeliverySlices({
        repo: 'piquet-h/the-shifting-atlas',
        milestoneNumber: 18,
        description: first,
        milestoneTitle: 'Ignored',
        issues
    })

    assert.equal(second, first)
})

test('ensureDescriptionHasDeliverySlices: adds missing open issues to the order', () => {
    const out = ensureDescriptionHasDeliverySlices({
        repo: 'piquet-h/the-shifting-atlas',
        milestoneNumber: 18,
        description: '',
        milestoneTitle: 'Ignored',
        issues: [
            { number: 1, title: 'A', state: 'open' },
            { number: 2, title: 'B', state: 'open' }
        ]
    })

    assert.ok(out.includes('1. [#1]'))
    assert.ok(out.includes('2. [#2]'))
})

test('ensureDescriptionHasDeliverySlices: removes closed issues from the order', () => {
    const out = ensureDescriptionHasDeliverySlices({
        repo: 'piquet-h/the-shifting-atlas',
        milestoneNumber: 18,
        description: '',
        milestoneTitle: 'Ignored',
        issues: [
            { number: 1, title: 'A', state: 'open' },
            { number: 2, title: 'B', state: 'closed' }
        ]
    })

    assert.ok(out.includes('1. [#1]'))
    assert.ok(out.includes('## Closed groundwork'))
    assert.ok(out.includes('B'))
})

test('ensureDescriptionHasDeliverySlices: refreshes titles for open issues', () => {
    const out = ensureDescriptionHasDeliverySlices({
        repo: 'piquet-h/the-shifting-atlas',
        milestoneNumber: 18,
        description: '',
        milestoneTitle: 'Ignored',
        issues: [{ number: 1, title: 'New title', state: 'open' }]
    })

    assert.ok(out.includes('1. [#1]'))
    assert.ok(out.includes('New title'))
    assert.equal(out.includes('Old title'), false)
})
