import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, test } from 'node:test'
import { promisify } from 'node:util'
import { buildAuthoringQueue, renderOverlay, validateOverlay } from '../long-reach-authoring.mjs'

const execAsync = promisify(execFile)
const SCRIPT_PATH = resolve(new URL('..', import.meta.url).pathname, 'long-reach-authoring.mjs')

const atlas = {
    macroGraph: {
        nodes: [
            { id: 'area-blocked', name: 'Blocked Area', nodeClass: 'area' },
            { id: 'area-partial', name: 'Partial Area', nodeClass: 'area' },
            { id: 'area-ready', name: 'Ready Area', nodeClass: 'area', authoringReadiness: 'ready' },
            { id: 'corridor-west', name: 'West Entry', nodeClass: 'corridor' }
        ],
        edges: [
            {
                from: 'area-ready',
                to: 'area-blocked',
                relation: 'macro-transition',
                transition: {
                    destinationAreaRef: 'area-blocked',
                    destinationReadiness: 'blocked',
                    entrySegmentRef: 'corridor-west'
                }
            },
            {
                from: 'area-ready',
                to: 'area-partial',
                relation: 'macro-transition',
                transition: {
                    destinationAreaRef: 'area-partial',
                    destinationReadiness: 'partial'
                }
            }
        ]
    }
}

const overlay = {
    schemaVersion: 1,
    map: { source: 'the-long-reach.jpg', width: 7040, height: 8480 },
    segments: [
        {
            ref: 'area-blocked',
            label: 'Blocked Area',
            kind: 'area',
            coverage: 'planned',
            priority: 2,
            geometry: { type: 'marker', anchor: [0.4, 0.5] }
        },
        {
            ref: 'area-ready',
            label: 'Ready Area',
            kind: 'area',
            coverage: 'authored',
            geometry: { type: 'marker', anchor: [0.6, 0.5] }
        },
        {
            ref: 'area-partial',
            label: 'Partial Area',
            kind: 'area',
            coverage: 'in-progress',
            priority: 9,
            geometry: { type: 'marker', anchor: [0.7, 0.5] }
        },
        {
            ref: 'corridor-west',
            label: 'West Entry',
            kind: 'corridor',
            coverage: 'planned',
            priority: 3,
            geometry: {
                type: 'line',
                points: [
                    [0.2, 0.5],
                    [0.35, 0.5]
                ]
            }
        }
    ]
}

const sidecar = {
    schemaVersion: 1,
    image: 'the-long-reach.jpg',
    atlas: 'backend/src/data/theLongReachMacroAtlas.json',
    entries: [
        {
            id: 'lr-overlay-blocked-destination',
            label: 'Blocked Destination',
            kind: 'region',
            bounds: { left: 0.1, top: 0.1, right: 0.2, bottom: 0.2 },
            authoringState: 'next-to-author',
            coverage: 'partial',
            authoringReadiness: 'blocked',
            areaRefs: ['area-blocked'],
            entrySegmentRef: 'corridor-west',
            entryAnchorId: '12345678-1234-4234-8234-123456789abc',
            priority: 9,
            notes: 'Blocked destination needs authoring.'
        },
        {
            id: 'lr-overlay-static-destination',
            label: 'Static Destination',
            kind: 'region',
            bounds: { left: 0.3, top: 0.1, right: 0.4, bottom: 0.2 },
            authoringState: 'next-to-author',
            coverage: 'none',
            authoringReadiness: 'deferred',
            areaRefs: ['area-partial'],
            priority: 1,
            notes: 'Deferred destination needs authoring.'
        },
        {
            id: 'lr-overlay-paused-destination',
            label: 'Paused Destination',
            kind: 'region',
            bounds: { left: 0.5, top: 0.1, right: 0.6, bottom: 0.2 },
            authoringState: 'blocked',
            coverage: 'partial',
            authoringReadiness: 'blocked',
            areaRefs: ['area-ready'],
            priority: 0,
            notes: 'Intentionally paused.'
        }
    ]
}

describe('Long Reach authoring overlay', () => {
    test('global --help shows the render and queue commands', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH, '--help'])

        assert.match(stdout, /render \[--overlay=path\]/)
        assert.match(stdout, /queue \[--overlay=path\]/)
    })

    test('validates atlas references and normalized geometry', () => {
        assert.equal(validateOverlay(overlay, atlas), true)

        const invalid = globalThis.structuredClone(overlay)
        invalid.segments[0].geometry.anchor[0] = 1.1
        assert.throws(() => validateOverlay(invalid, atlas), /normalized coordinates/)
    })

    test('rejects duplicate segment references', () => {
        const invalid = globalThis.structuredClone(overlay)
        invalid.segments.push(globalThis.structuredClone(invalid.segments[0]))
        assert.throws(() => validateOverlay(invalid, atlas), /duplicate segment ref/)
    })

    test('rejects overlays that omit an atlas segment', () => {
        const invalid = globalThis.structuredClone(overlay)
        invalid.segments.pop()
        assert.throws(() => validateOverlay(invalid, atlas), /missing atlas node refs/)
    })

    test('outlines partial and non-ready runtime transitions as blocked handoffs', () => {
        const svg = renderOverlay(overlay, atlas, '../../the-long-reach.jpg')

        assert.match(svg, /<image[^>]+href="\.\.\/\.\.\/the-long-reach\.jpg"/)
        assert.match(svg, /class="area runtime-blocked" data-ref="area-blocked"[^>]*data-readiness="blocked"/)
        assert.match(svg, /class="area runtime-blocked" data-ref="area-partial"[^>]*data-readiness="partial"/)
        assert.match(svg, /data-status="next-to-author"/)
        assert.match(svg, /data-status="authored"/)
        assert.match(svg, /Blocked Area/)
        assert.match(svg, /runtime handoff currently blocked/)
    })

    test('ranks blocked-boundary pressure ahead of static priority without mutating the atlas', () => {
        const events = [
            {
                name: 'World.Frontier.BoundaryReached',
                customDimensions: {
                    destinationAreaRef: 'area-blocked',
                    destinationReadiness: 'blocked',
                    entrySegmentRef: 'corridor-west'
                }
            },
            {
                name: 'World.Frontier.BoundaryReached',
                customDimensions: { destinationAreaRef: 'area-ready', destinationReadiness: 'ready' }
            }
        ]
        const before = globalThis.structuredClone(atlas)
        const report = buildAuthoringQueue(overlay, atlas, events)

        assert.equal(report.queue[0].ref, 'corridor-west')
        assert.equal(report.queue[0].runtimeBoundaryPressure.total, 1)
        assert.equal(report.queue[0].runtimeReadiness, 'blocked')
        assert.equal(report.queue[1].ref, 'area-blocked')
        assert.equal(
            report.queue.some((entry) => entry.ref === 'area-ready'),
            false
        )
        assert.deepEqual(atlas, before)
    })

    test('ignores unrelated events and accepts an empty signal set', () => {
        const report = buildAuthoringQueue(overlay, atlas, [
            { name: 'World.Player.Moved', customDimensions: { destinationAreaRef: 'area-blocked' } }
        ])

        assert.equal(
            report.queue.every((entry) => entry.runtimeBoundaryPressure.total === 0),
            true
        )
    })

    test('uses sidecar next-to-author state and static priority when runtime signals are absent', () => {
        const report = buildAuthoringQueue(sidecar, atlas)

        assert.deepEqual(
            report.queue.map(({ ref, authoringState }) => [ref, authoringState]),
            [
                ['lr-overlay-static-destination', 'next-to-author'],
                ['lr-overlay-blocked-destination', 'next-to-author']
            ]
        )
        assert.deepEqual(report.queue[1].areaRefs, ['area-blocked'])
        assert.equal(report.queue[1].entrySegmentRef, 'corridor-west')
        assert.equal(report.queue[1].entryAnchorId, '12345678-1234-4234-8234-123456789abc')
        assert.equal(report.queue[1].authoringReadiness, 'blocked')
    })

    test('aggregates reached and approaching pressure for a sidecar destination', () => {
        const report = buildAuthoringQueue(sidecar, atlas, [
            {
                name: 'World.Frontier.BoundaryReached',
                customDimensions: {
                    destinationAreaRef: 'area-blocked',
                    destinationReadiness: 'blocked',
                    entrySegmentRef: 'corridor-west'
                }
            },
            {
                name: 'World.Frontier.BoundaryApproach',
                properties: { destinationAreaRef: 'area-blocked', destinationReadiness: 'deferred' }
            },
            {
                name: 'World.Frontier.BoundaryReached',
                customDimensions: { destinationAreaRef: 'area-blocked', destinationReadiness: 'ready' }
            }
        ])

        assert.equal(report.queue[0].ref, 'lr-overlay-blocked-destination')
        assert.deepEqual(report.queue[0].runtimeBoundaryPressure, {
            total: 2,
            byReadiness: { blocked: 1, deferred: 1 }
        })
    })

    test('renders references and entry anchors as links in the markdown report', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'long-reach-queue-'))
        try {
            const sidecarPath = resolve(directory, 'sidecar.json')
            const atlasPath = resolve(directory, 'atlas.json')
            await writeFile(sidecarPath, JSON.stringify(sidecar))
            await writeFile(atlasPath, JSON.stringify(atlas))
            const { stdout } = await execAsync('node', [SCRIPT_PATH, 'queue', `--overlay=${sidecarPath}`, `--atlas=${atlasPath}`])

            assert.match(stdout, /\[area-blocked\]\(https:\/\/github\.com\/piquet-h\/the-shifting-atlas\/search\?q=area-blocked\)/)
            assert.match(
                stdout,
                /\[12345678-1234-4234-8234-123456789abc\]\(https:\/\/github\.com\/piquet-h\/the-shifting-atlas\/search\?q=12345678-1234-4234-8234-123456789abc\)/
            )
        } finally {
            await rm(directory, { recursive: true, force: true })
        }
    })
})
