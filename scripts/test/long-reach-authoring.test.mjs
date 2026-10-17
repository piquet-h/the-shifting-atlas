import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { promisify } from 'node:util'
import { buildAuthoringQueue, renderOverlay, validateOverlay } from '../long-reach-authoring.mjs'

const execAsync = promisify(execFile)
const SCRIPT_PATH = resolve(new URL('..', import.meta.url).pathname, 'long-reach-authoring.mjs')

const atlas = {
    macroGraph: {
        nodes: [
            { id: 'area-blocked', name: 'Blocked Area', nodeClass: 'area' },
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
            ref: 'corridor-west',
            label: 'West Entry',
            kind: 'corridor',
            coverage: 'planned',
            priority: 3,
            geometry: { type: 'line', points: [[0.2, 0.5], [0.35, 0.5]] }
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

        const invalid = structuredClone(overlay)
        invalid.segments[0].geometry.anchor[0] = 1.1
        assert.throws(() => validateOverlay(invalid, atlas), /normalized coordinates/)
    })

    test('rejects duplicate segment references', () => {
        const invalid = structuredClone(overlay)
        invalid.segments.push(structuredClone(invalid.segments[0]))
        assert.throws(() => validateOverlay(invalid, atlas), /duplicate segment ref/)
    })

    test('rejects overlays that omit an atlas segment', () => {
        const invalid = structuredClone(overlay)
        invalid.segments.pop()
        assert.throws(() => validateOverlay(invalid, atlas), /missing atlas node refs/)
    })

    test('renders linked source imagery with authored, next, and blocked status cues', () => {
        const svg = renderOverlay(overlay, atlas, '../../the-long-reach.jpg')

        assert.match(svg, /<image[^>]+href="\.\.\/\.\.\/the-long-reach\.jpg"/)
        assert.match(svg, /data-readiness="blocked"/)
        assert.match(svg, /data-status="next-to-author"/)
        assert.match(svg, /data-status="authored"/)
        assert.match(svg, /Blocked Area/)
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
        const before = structuredClone(atlas)
        const report = buildAuthoringQueue(overlay, atlas, events)

        assert.equal(report.queue[0].ref, 'corridor-west')
        assert.equal(report.queue[0].runtimeBoundaryPressure.total, 1)
        assert.equal(report.queue[0].runtimeReadiness, 'blocked')
        assert.equal(report.queue[1].ref, 'area-blocked')
        assert.equal(report.queue.some((entry) => entry.ref === 'area-ready'), false)
        assert.deepEqual(atlas, before)
    })

    test('ignores unrelated events and accepts an empty signal set', () => {
        const report = buildAuthoringQueue(overlay, atlas, [
            { name: 'World.Player.Moved', customDimensions: { destinationAreaRef: 'area-blocked' } }
        ])

        assert.equal(report.queue.every((entry) => entry.runtimeBoundaryPressure.total === 0), true)
    })
})
