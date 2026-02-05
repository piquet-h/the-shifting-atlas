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

test('ensureDescriptionHasDeliverySlices is idempotent', () => {
    const first = ensureDescriptionHasDeliverySlices({
        description: 'Focus\n\n## Delivery slices\n\n### Slice 1 — X\n\nOrder:\n- (add issues, then reorder)',
        milestoneTitle: 'Ignored',
        issues: [{ number: 1, title: 'A', state: 'open' }]
    })

    const second = ensureDescriptionHasDeliverySlices({
        description: first,
        milestoneTitle: 'Ignored',
        issues: [{ number: 2, title: 'B', state: 'open' }]
    })

    assert.equal(second, first)
})
