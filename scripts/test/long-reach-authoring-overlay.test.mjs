import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const Ajv = require('ajv')
const schema = JSON.parse(
    readFileSync(new URL('../../docs/architecture/long-reach-authoring-overlay.schema.json', import.meta.url), 'utf8')
)
const validate = new Ajv({ allErrors: true }).compile(schema)

function sidecar(entry = {}) {
    return {
        schemaVersion: 1,
        image: 'the-long-reach.jpg',
        atlas: 'backend/src/data/theLongReachMacroAtlas.json',
        entries: [
            {
                id: 'lr-overlay-westwall',
                label: 'Westwall approach',
                kind: 'corridor',
                bounds: { left: 0.1, top: 0.2, right: 0.3, bottom: 0.4 },
                authoringState: 'blocked',
                coverage: 'partial',
                authoringReadiness: 'blocked',
                areaRefs: ['lr-area-fiordmarch-west'],
                corridorRefs: ['lr-corridor-westwall-shelf', 'lr-corridor-northgate-valley'],
                segmentRefs: ['lr-corridor-westwall-shelf'],
                notes: 'Entry skeleton exists; destination is not open for handoff.',
                ...entry
            }
        ]
    }
}

function check(data, expected) {
    assert.equal(validate(data), expected, JSON.stringify(validate.errors))
}

test('accepts a partially authored, operationally blocked zone spanning multiple corridors', () => {
    check(sidecar(), true)
})

test('accepts an inspiration region with no resolved atlas area', () => {
    const data = sidecar({ kind: 'region', authoringState: 'inspiration-only', coverage: 'none' })
    for (const field of ['authoringReadiness', 'areaRefs', 'corridorRefs', 'segmentRefs']) delete data.entries[0][field]
    check(data, true)
})

test('accepts transition-ready, authored, and queued designations', () => {
    check(
        sidecar({ authoringState: 'transition-ready', authoringReadiness: 'partial', entrySegmentRef: 'lr-corridor-westwall-shelf' }),
        true
    )
    check(sidecar({ authoringState: 'authored', coverage: 'complete', authoringReadiness: 'ready' }), true)
    check(sidecar({ authoringState: 'authored', coverage: 'complete', authoringReadiness: 'blocked' }), true)
    check(sidecar({ authoringState: 'next-to-author', authoringReadiness: 'deferred', priority: 1 }), true)
})

test('rejects malformed fields, bounds, and unsupported versions or vocabulary', () => {
    for (const change of [
        { authoringReadiness: 'transition-ready' },
        { authoringState: 'ready' },
        { coverage: 'almost' },
        { notes: ' ' },
        { priority: -1 },
        { areaRefs: ['abcdef01-2345-4678-9abc-def012345678'] },
        { areaRefs: ['lr-area-fiordmarch-west', 'lr-area-fiordmarch-west'] },
        { bounds: { left: -0.1, top: 0, right: 1, bottom: 1 } },
        { entryAnchorId: 'not-a-guid' },
        { typo: true }
    ]) {
        check(sidecar(change), false)
    }
    check({ ...sidecar(), schemaVersion: 2 }, false)
})

test('rejects transition-ready entries without an authored entry segment or a resolved area', () => {
    check(sidecar({ authoringState: 'transition-ready', authoringReadiness: 'partial' }), false)
    check(
        sidecar({ authoringState: 'transition-ready', authoringReadiness: 'ready', entrySegmentRef: 'lr-corridor-westwall-shelf' }),
        false
    )
    check(
        sidecar({
            authoringState: 'transition-ready',
            authoringReadiness: 'partial',
            coverage: 'none',
            entrySegmentRef: 'lr-corridor-westwall-shelf'
        }),
        false
    )
    check(
        sidecar({
            authoringState: 'transition-ready',
            authoringReadiness: 'partial',
            entrySegmentRef: 'lr-corridor-westwall-shelf',
            areaRefs: []
        }),
        false
    )
})

test('rejects contradictory blocked, queued, authored, and inspiration-only entries', () => {
    check(sidecar({ authoringReadiness: 'ready' }), false)
    check(sidecar({ authoringState: 'next-to-author', authoringReadiness: 'partial', priority: 1 }), false)
    check(sidecar({ authoringState: 'next-to-author' }), false)
    check(sidecar({ authoringState: 'authored', coverage: 'partial' }), false)
    check(sidecar({ authoringState: 'inspiration-only', coverage: 'partial' }), false)
})

test('the documented example conforms to the schema', () => {
    const document = readFileSync(new URL('../../docs/architecture/macro-atlas-and-seed-redesign.md', import.meta.url), 'utf8')
    const section = document.split('## Long Reach authoring overlay sidecar')[1]
    assert.ok(section, 'overlay contract section exists')
    const example = section.match(/```json\n([\s\S]*?)\n```/)
    assert.ok(example, 'overlay example exists')
    check(JSON.parse(example[1]), true)
})
