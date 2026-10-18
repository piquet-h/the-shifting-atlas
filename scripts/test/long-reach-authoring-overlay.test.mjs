import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { renderOverlay } from '../long-reach-authoring.mjs'

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

const atlas = {
    macroGraph: {
        nodes: [
            { id: 'lr-area-fiordmarch-west', nodeClass: 'area' },
            { id: 'lr-corridor-westwall-shelf', nodeClass: 'corridor' },
            { id: 'lr-corridor-northgate-valley', nodeClass: 'corridor' }
        ],
        edges: []
    }
}

test('renders all five editorial states with a legend and no runtime permission claim', () => {
    const states = ['authored', 'transition-ready', 'next-to-author', 'blocked', 'inspiration-only']
    const data = sidecar()
    data.entries = states.map((state, index) => {
        const entry = sidecar({
            id: `lr-overlay-state-${index}`,
            label: `${state} <scope>`,
            authoringState: state,
            coverage: state === 'authored' ? 'complete' : 'partial',
            authoringReadiness: state === 'transition-ready' ? 'partial' : 'blocked',
            priority: index
        }).entries[0]
        if (state === 'transition-ready') entry.entrySegmentRef = 'lr-corridor-westwall-shelf'
        if (state === 'inspiration-only') {
            entry.coverage = 'none'
            delete entry.authoringReadiness
        }
        return entry
    })
    const before = globalThis.structuredClone({ data, atlas })
    const svg = renderOverlay(data, atlas, '../../the-long-reach.jpg')
    const colors = new Set()
    for (const state of states) {
        assert.match(svg, new RegExp(`data-status="${state}"`))
        assert.ok(svg.includes(`${state} &lt;scope&gt;`))
        assert.ok(svg.includes(`>${state}</text>`))
        const group = svg.match(new RegExp(`<g [^>]*data-status="${state}"[^>]*>[\\s\\S]*?</g>`))[0]
        colors.add(group.match(/fill="(#[0-9a-f]+)"/)[1])
    }
    assert.equal(colors.size, states.length)
    assert.match(svg, /Approximate footprints/)
    assert.match(svg, /partial.*not.*permission/i)
    assert.match(svg, /coverage complete;.*blocked/)
    assert.deepEqual({ data, atlas }, before)
    assert.equal(renderOverlay(data, atlas, '../../the-long-reach.jpg'), svg)
    assert.ok(Buffer.byteLength(svg) < 20000)
})

test('layers coarse regions below corridors and keeps labels above all footprints', () => {
    const data = sidecar()
    data.entries.push({
        ...globalThis.structuredClone(data.entries[0]),
        id: 'lr-overlay-area',
        kind: 'region',
        label: 'Area behind route'
    })
    const svg = renderOverlay(data, atlas, '../../the-long-reach.jpg')
    assert.ok(svg.indexOf('data-ref="lr-overlay-area"') < svg.indexOf('data-ref="lr-overlay-westwall"'))
    assert.ok(svg.lastIndexOf('<polygon') < svg.indexOf('aria-label="Segment labels"'))
    assert.ok(svg.indexOf('aria-label="Segment labels"') < svg.indexOf('>Area behind route</text>'))
    assert.match(svg, /fill-opacity="\.25"/)
})

test('renders an empty or unresolved inspiration-only inventory without inventing readiness', () => {
    const empty = { ...sidecar(), entries: [] }
    assert.match(renderOverlay(empty, atlas, 'map.jpg'), /Legend/)
    const data = sidecar({ kind: 'region', authoringState: 'inspiration-only', coverage: 'none' })
    for (const field of ['authoringReadiness', 'areaRefs', 'corridorRefs', 'segmentRefs']) delete data.entries[0][field]
    const svg = renderOverlay(data, atlas, 'map.jpg')
    assert.match(svg, /data-status="inspiration-only" data-readiness="unspecified"/)
})

test('renderer rejects invalid schema, duplicate identities, reversed bounds, and unknown atlas references', () => {
    const cases = [
        [sidecar({ authoringState: 'ready' }), /schema/i],
        [sidecar({ bounds: { left: 0.5, top: 0.2, right: 0.1, bottom: 0.4 } }), /bounds/i],
        [sidecar({ areaRefs: ['lr-area-unknown'] }), /unknown atlas/i],
        [sidecar({ areaRefs: ['lr-corridor-westwall-shelf'] }), /nodeClass/i]
    ]
    const duplicate = sidecar()
    duplicate.entries.push(globalThis.structuredClone(duplicate.entries[0]))
    cases.push([duplicate, /duplicate/i])
    for (const [data, expected] of cases) assert.throws(() => renderOverlay(data, atlas, 'map.jpg'), expected)
})

test('CLI renders a schema sidecar to a custom output with a relative image link', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'long-reach-overlay-'))
    const root = new URL('../../', import.meta.url)
    try {
        const input = join(directory, 'sidecar.json')
        const output = join(directory, 'overlay.svg')
        await writeFile(input, JSON.stringify(sidecar()))
        execFileSync(
            process.execPath,
            [fileURLToPath(new URL('../long-reach-authoring.mjs', import.meta.url)), 'render', `--overlay=${input}`, `--output=${output}`],
            { cwd: root }
        )
        const svg = await readFile(output, 'utf8')
        assert.match(svg, /data-status="blocked"/)
        assert.match(svg, /<image href="(?:\.\.\/)+.*the-long-reach\.jpg"/)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('checked-in SVG is lightweight and reproducible from the existing coverage inventory', () => {
    const load = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
    const inventory = load('docs/architecture/the-long-reach-authoring-overlay.json')
    const currentAtlas = load('backend/src/data/theLongReachMacroAtlas.json')
    const svg = renderOverlay(inventory, currentAtlas, '../../the-long-reach.jpg')
    assert.equal(readFileSync(new URL('../../docs/architecture/the-long-reach-authoring-overlay.svg', import.meta.url), 'utf8'), svg)
    assert.ok(Buffer.byteLength(svg) < 25000)
})

test('places Mosswell at Milford Sound at small-town map scale', () => {
    const load = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'))
    const inventory = load('docs/architecture/the-long-reach-authoring-overlay.json')
    const currentAtlas = load('backend/src/data/theLongReachMacroAtlas.json')
    const village = inventory.segments.find((segment) => segment.label === 'Mosswell village')
    const harborRoad = inventory.segments.find((segment) => segment.label === 'Mosswell Harbor Road')

    assert.deepEqual(village.geometry.anchor, [0.16, 0.55])
    assert.equal(village.geometry.radius, 0.001)
    assert.ok(harborRoad.geometry.points.some((point) => JSON.stringify(point) === JSON.stringify(village.geometry.anchor)))

    const svg = renderOverlay(inventory, currentAtlas, '../../the-long-reach.jpg')
    assert.match(
        svg,
        /data-ref="lr-area-mosswell-fiordhead"[^>]*>[\s\S]*?<circle cx="1126\.4" cy="4664\.0" r="7\.0"[^>]*stroke-width="1\.8"/
    )
})

test('legacy extra fields cannot override atlas readiness or inject SVG attributes', () => {
    const inventory = JSON.parse(
        readFileSync(new URL('../../docs/architecture/the-long-reach-authoring-overlay.json', import.meta.url), 'utf8')
    )
    const currentAtlas = JSON.parse(readFileSync(new URL('../../backend/src/data/theLongReachMacroAtlas.json', import.meta.url), 'utf8'))
    const expected = renderOverlay(inventory, currentAtlas, 'map.jpg')
    inventory.segments[0].authoringState = '"><script>alert(1)</script>'
    inventory.segments[0].authoringReadiness = 'ready'
    inventory.segments[0].notes = '</title><script>alert(1)</script>'
    assert.equal(renderOverlay(inventory, currentAtlas, 'map.jpg'), expected)
})
