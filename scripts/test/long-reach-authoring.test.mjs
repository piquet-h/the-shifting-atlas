import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { buildAuthoringQueue, renderOverlay, validateOverlay } from '../long-reach-authoring.mjs'

const execAsync = promisify(execFile)
const SCRIPT_PATH = fileURLToPath(new URL('../long-reach-authoring.mjs', import.meta.url))

const seedLocations = [
    { id: 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21', name: 'Mosswell River Jetty' },
    { id: 'd0b2a7ea-9f4c-41d5-9b2d-7b4a0e6f1c3a', name: 'North Gate' },
    { id: 'ec88e970-9d2b-4a34-9804-6b2afd5adb9e', name: 'South Farms' }
]

const atlas = {
    macroGraph: {
        nodes: [
            { id: 'area-ready', name: 'Ready Area', nodeClass: 'area', authoringReadiness: 'ready' },
            { id: 'area-east', name: 'East Foothills', nodeClass: 'area', authoringReadiness: 'partial', entrySegmentRef: 'area-basin' },
            { id: 'area-basin', name: 'Inland Basin', nodeClass: 'area' },
            { id: 'area-blocked', name: 'Blocked Coast', nodeClass: 'area', authoringReadiness: 'blocked' },
            { id: 'corridor-west', name: 'West Shelf', nodeClass: 'corridor' },
            { id: 'barrier-cliffs', name: 'Sheer Cliffs', nodeClass: 'barrier' }
        ],
        edges: [
            {
                from: 'area-ready',
                to: 'area-east',
                relation: 'macro-transition',
                transition: {
                    direction: 'east',
                    threshold: 'Foothills rise east',
                    destinationAreaRef: 'area-east',
                    destinationReadiness: 'partial',
                    entrySegmentRef: 'area-basin'
                }
            },
            {
                from: 'area-ready',
                to: 'area-blocked',
                relation: 'macro-transition',
                barrierRefs: ['barrier-cliffs'],
                transition: {
                    direction: 'west',
                    threshold: 'Cliffs block west',
                    destinationAreaRef: 'area-blocked',
                    destinationReadiness: 'blocked',
                    entrySegmentRef: 'corridor-west'
                }
            }
        ]
    }
}

const overlay = {
    schemaVersion: 1,
    image: 'the-long-reach.jpg',
    atlas: 'backend/src/data/theLongReachMacroAtlas.json',
    entries: [
        {
            id: 'lr-overlay-ready',
            label: 'Mosswell Village',
            kind: 'region',
            geometry: { type: 'marker', anchor: [0.19, 0.562], radius: 0.0012 },
            authoringState: 'authored',
            coverage: 'complete',
            authoringReadiness: 'ready',
            areaRefs: ['area-ready'],
            entryAnchorId: 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21',
            notes: 'Seeded village anchor.'
        },
        {
            id: 'lr-overlay-east',
            label: 'East Foothills',
            kind: 'region',
            geometry: {
                type: 'polygon',
                points: [
                    [0.23, 0.54],
                    [0.31, 0.52],
                    [0.31, 0.6],
                    [0.23, 0.6]
                ]
            },
            authoringState: 'next-to-author',
            coverage: 'none',
            authoringReadiness: 'partial',
            areaRefs: ['area-east'],
            entrySegmentRef: 'area-basin',
            entryAnchorId: 'ec88e970-9d2b-4a34-9804-6b2afd5adb9e',
            priority: 1,
            notes: 'Next eastern frontier handoff.'
        },
        {
            id: 'lr-overlay-west',
            label: 'Blocked West Coast',
            kind: 'corridor',
            geometry: {
                type: 'line',
                points: [
                    [0.188, 0.564],
                    [0.15, 0.59]
                ]
            },
            authoringState: 'blocked',
            coverage: 'none',
            authoringReadiness: 'blocked',
            areaRefs: ['area-blocked'],
            corridorRefs: ['corridor-west'],
            barrierRefs: ['barrier-cliffs'],
            entrySegmentRef: 'corridor-west',
            priority: 5,
            notes: 'Closed coastal shelf behind cliff barrier.'
        },
        {
            id: 'lr-overlay-cliffs',
            label: 'Sheer Cliffs',
            kind: 'barrier',
            geometry: {
                type: 'line',
                points: [
                    [0.195, 0.54],
                    [0.18, 0.6]
                ]
            },
            authoringState: 'blocked',
            coverage: 'none',
            authoringReadiness: 'blocked',
            barrierRefs: ['barrier-cliffs'],
            notes: 'Hard cliff barrier.'
        }
    ]
}

describe('Long Reach authoring overlay and expansion queue', () => {
    test('global --help shows unified schema v1 render and queue commands', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH, '--help'])

        assert.match(stdout, /render \[--overlay=path\]/)
        assert.match(stdout, /queue \[--overlay=path\]/)
        assert.doesNotMatch(stdout, /legacy segments inventory/i)
    })

    test('validates unified schema v1 entries, atlas refs, and seed entry anchors, rejecting legacy segments', () => {
        assert.equal(validateOverlay(overlay, atlas, seedLocations), true)

        assert.throws(
            () =>
                validateOverlay(
                    {
                        schemaVersion: 1,
                        map: { source: 'the-long-reach.jpg', width: 7040, height: 8480 },
                        segments: []
                    },
                    atlas
                ),
            /schema/i
        )

        const badAnchor = globalThis.structuredClone(overlay)
        badAnchor.entries[0].entryAnchorId = '00000000-0000-4000-8000-000000000099'
        assert.throws(() => validateOverlay(badAnchor, atlas, seedLocations), /unknown.*entryAnchorId/i)
    })

    test('rejects duplicate entry ids and out-of-range coordinates', () => {
        const dup = globalThis.structuredClone(overlay)
        dup.entries.push(globalThis.structuredClone(dup.entries[0]))
        assert.throws(() => validateOverlay(dup, atlas), /duplicate/i)

        const outOfBounds = globalThis.structuredClone(overlay)
        outOfBounds.entries[0].geometry.anchor[0] = 1.2
        assert.throws(() => validateOverlay(outOfBounds, atlas), /schema/i)
    })

    test('renders two-panel SVG with full island overview, Milford Sound inset, river trace, and blocked outlines', () => {
        const svg = renderOverlay(overlay, atlas, '../../the-long-reach.jpg')

        assert.match(svg, /viewBox="0 0 11200 8480"/)
        assert.match(svg, /aria-label="Full Long Reach overview"/)
        assert.match(svg, /aria-label="Milford Sound inset callout"/)
        assert.match(svg, /aria-label="Milford Sound and Mosswell inset"/)
        assert.match(svg, /data-feature="mosswell-river-trace"/)
        assert.match(svg, /data-ref="lr-overlay-east"[^>]*data-status="next-to-author"[^>]*data-readiness="partial"/)
        assert.match(svg, /class="region runtime-blocked" data-ref="lr-overlay-east"/)
        assert.match(svg, /data-ref="lr-overlay-ready"[^>]*data-status="authored"/)
    })

    test('rolls up BoundaryApproach and BoundaryReached onto the same transition and promotes pressured blocked entries', () => {
        const events = [
            {
                name: 'World.Frontier.BoundaryApproach',
                customDimensions: {
                    sourceAreaRef: 'area-ready',
                    approachDir: 'east',
                    destinationAreaRef: 'area-east',
                    destinationReadiness: 'partial'
                }
            },
            {
                name: 'World.Frontier.BoundaryReached',
                customDimensions: {
                    sourceAreaRef: 'area-ready',
                    dir: 'east',
                    destinationAreaRef: 'area-east',
                    destinationReadiness: 'partial',
                    entrySegmentRef: 'area-basin'
                }
            },
            {
                name: 'World.Frontier.BoundaryReached',
                customDimensions: {
                    sourceAreaRef: 'area-ready',
                    dir: 'west',
                    destinationAreaRef: 'area-blocked',
                    destinationReadiness: 'blocked',
                    entrySegmentRef: 'corridor-west'
                }
            },
            {
                name: 'World.Frontier.BoundaryReached',
                customDimensions: {
                    sourceAreaRef: 'area-ready',
                    dir: 'west',
                    destinationAreaRef: 'area-blocked',
                    destinationReadiness: 'blocked',
                    entrySegmentRef: 'corridor-west'
                }
            },
            {
                name: 'World.Frontier.BoundaryReached',
                customDimensions: {
                    destinationAreaRef: 'area-ready',
                    destinationReadiness: 'ready'
                }
            }
        ]
        const before = globalThis.structuredClone(atlas)
        const report = buildAuthoringQueue(overlay, atlas, events, seedLocations)

        // West was 'blocked' (not 'next-to-author'), but 2 BoundaryReached hits promote it into the queue!
        // East got 1 Approach + 1 Reached rolled up together (total = 2, reached = 1, approach = 1).
        // West has 2 Reached vs East 1 Reached + 1 Approach, or both total=2 ranked by reached count then priority.
        const east = report.queue.find((item) => item.id === 'lr-overlay-east')
        const west = report.queue.find((item) => item.id === 'lr-overlay-west')
        assert.ok(east, 'east queued')
        assert.ok(west, 'pressured blocked west entry promoted into queue')
        assert.equal(east.runtimeBoundaryPressure.total, 2)
        assert.equal(east.runtimeBoundaryPressure.reached, 1)
        assert.equal(east.runtimeBoundaryPressure.approach, 1)
        assert.equal(east.entryAnchorName, 'South Farms')
        assert.deepEqual(east.outboundDirections, ['east'])
        assert.equal(west.runtimeBoundaryPressure.total, 2)
        assert.equal(west.runtimeBoundaryPressure.reached, 2)
        assert.equal(report.queue[0].id, 'lr-overlay-west')
        assert.equal(
            report.queue.some((entry) => entry.id === 'lr-overlay-ready'),
            false
        )
        assert.equal(
            report.queue.some((entry) => entry.id === 'lr-overlay-cliffs'),
            false
        )
        assert.deepEqual(atlas, before)
    })

    test('degrades cleanly with empty or unrelated signals to only next-to-author candidates in priority order', () => {
        const report = buildAuthoringQueue(
            overlay,
            atlas,
            [{ name: 'World.Player.Moved', customDimensions: { destinationAreaRef: 'area-blocked' } }],
            seedLocations
        )

        assert.deepEqual(
            report.queue.map((entry) => entry.id),
            ['lr-overlay-east']
        )
        assert.equal(report.queue[0].runtimeBoundaryPressure.total, 0)
    })
})
