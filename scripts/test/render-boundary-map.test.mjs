/**
 * Tests for render-boundary-map.mjs
 *
 * Covers (M4d #893 audit/map cutover):
 * - Mermaid output surfaces actual pending prose (not the legacy "Unexplored Open Plain" placeholder)
 * - Forbidden exits render with reason + motif on a dedicated pseudo-node
 * - Macro atlas tags (`macro:area:` / `macro:route:` / `macro:water:`) appear in boundary labels
 * - JSON report summary includes forbiddenLocations
 */

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { promisify } from 'node:util'

const execAsync = promisify(execFile)

const SCRIPT_PATH = resolve(new URL('..', import.meta.url).pathname, 'render-boundary-map.mjs')

const TMP_DIR = resolve(new URL('..', import.meta.url).pathname, '..', 'tmp', 'render-boundary-map-test')

async function setup() {
    await rm(TMP_DIR, { recursive: true, force: true })
    await mkdir(TMP_DIR, { recursive: true })
}

async function writeFixture(name, locations) {
    const path = resolve(TMP_DIR, name)
    await writeFile(path, JSON.stringify(locations), 'utf8')
    return path
}

describe('render-boundary-map.mjs CLI', () => {
    test('--help shows usage', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH, '--help'])
        assert.match(stdout, /Boundary Map Audit Renderer/)
        assert.match(stdout, /--scope=boundary/)
        assert.match(stdout, /--json=path/)
    })

    test('Given pending exit prose, Mermaid surfaces it instead of generic placeholder', async () => {
        await setup()
        const fixture = await writeFixture('pending-prose.json', [
            {
                id: 'hub-1',
                name: 'Hub',
                tags: ['hub', 'frontier:boundary', 'macro:area:lr-area-test'],
                exits: [{ direction: 'south', to: 'inner-1' }],
                exitAvailability: {
                    pending: {
                        north: 'A trade road climbs toward distant peaks'
                    }
                }
            },
            {
                id: 'inner-1',
                name: 'Inner',
                tags: ['interior'],
                exits: [{ direction: 'north', to: 'hub-1' }]
            }
        ])

        const reportPath = resolve(TMP_DIR, 'pending-prose.report.json')
        const { stdout } = await execAsync('node', [SCRIPT_PATH, `--data=${fixture}`, `--json=${reportPath}`])

        assert.match(stdout, /A trade road climbs toward distant peaks/, 'pending prose surfaces verbatim')
        assert.doesNotMatch(stdout, /Unexplored Open Plain/, 'legacy generic placeholder is gone')
        assert.match(stdout, /macro:area:lr-area-test/, 'macro context appears on boundary node')

        const report = JSON.parse(await readFile(reportPath, 'utf8'))
        assert.equal(report.summary.boundaryLocations, 1)
        assert.equal(report.summary.pendingLocations, 1)
        assert.equal(report.summary.forbiddenLocations, 0)
    })

    test('Given a forbidden exit, Mermaid renders a forbidden pseudo-node with reason and motif', async () => {
        await setup()
        const fixture = await writeFixture('forbidden.json', [
            {
                id: 'hub-1',
                name: 'Hub',
                tags: ['hub', 'frontier:boundary'],
                exits: [{ direction: 'south', to: 'inner-1' }],
                exitAvailability: {
                    forbidden: {
                        north: {
                            reason: 'Sheer cliffs block passage north',
                            motif: 'cliff'
                        }
                    }
                }
            },
            {
                id: 'inner-1',
                name: 'Inner',
                tags: ['interior'],
                exits: [{ direction: 'north', to: 'hub-1' }]
            }
        ])

        const reportPath = resolve(TMP_DIR, 'forbidden.report.json')
        const { stdout } = await execAsync('node', [SCRIPT_PATH, `--data=${fixture}`, `--json=${reportPath}`])

        assert.match(stdout, /Sheer cliffs block passage north/, 'forbidden reason surfaces')
        assert.match(stdout, /\[cliff\]/, 'forbidden motif annotates the node label')
        assert.match(stdout, /north \(forbidden\)/, 'forbidden edge is labelled')
        assert.match(stdout, /class f\d+ forbidden;/, 'forbidden classDef is applied')

        const report = JSON.parse(await readFile(reportPath, 'utf8'))
        assert.equal(report.summary.forbiddenLocations, 1)
    })

    test('Given no macro tags, location label has no macro context line', async () => {
        await setup()
        const fixture = await writeFixture('no-macro.json', [
            {
                id: 'hub-1',
                name: 'Plain Hub',
                tags: ['hub', 'frontier:boundary'],
                exits: [],
                exitAvailability: { pending: { north: 'open path' } }
            }
        ])

        const { stdout } = await execAsync('node', [SCRIPT_PATH, `--data=${fixture}`])
        assert.match(stdout, /Plain Hub/)
        assert.doesNotMatch(stdout, /Plain Hub<br\/>macro:/, 'no macro context line when no macro tags')
    })
})
