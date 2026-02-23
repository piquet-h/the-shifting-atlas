/**
 * Tests for analyze-implicit-exits.mjs
 *
 * Covers:
 * - Pattern detection for pending and forbidden directions
 * - Skipping directions that already have explicit coverage
 * - Confidence scoring and priority (forbidden > pending, high > medium > low)
 * - Handling locations without description
 * - CLI interface (--help, --data, --output)
 */

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { promisify } from 'node:util'

const execAsync = promisify(execFile)

const SCRIPT_PATH = resolve(new URL('..', import.meta.url).pathname, 'analyze-implicit-exits.mjs')
const PROJECT_ROOT = resolve(new URL('../..', import.meta.url).pathname)

const { analyseLocation, analyseLocations } = await import('../analyze-implicit-exits.mjs')

// ---------------------------------------------------------------------------
// Unit tests for analyseLocation()
// ---------------------------------------------------------------------------

describe('analyseLocation()', () => {
    test('Given a location with "to the north" in description, reports pending north at medium confidence', () => {
        const location = {
            id: 'loc-1',
            name: 'Test Location',
            description: 'Open moorland. To the north, hills rise.',
            exits: [],
        }
        const results = analyseLocation(location)
        const north = results.find((r) => r.direction === 'north')
        assert.ok(north, 'should detect north direction')
        assert.equal(north.suggestedAvailability, 'pending')
        assert.equal(north.confidence, 'medium')
        assert.ok(north.evidencePhrase.length > 0)
    })

    test('Given a location with "Sheer cliffs block passage west", reports forbidden west at high confidence', () => {
        const location = {
            id: 'loc-2',
            name: 'Cliff Edge',
            description: 'Rocky promontory. Sheer cliffs block passage west.',
            exits: [],
        }
        const results = analyseLocation(location)
        const west = results.find((r) => r.direction === 'west')
        assert.ok(west, 'should detect west direction')
        assert.equal(west.suggestedAvailability, 'forbidden')
        assert.equal(west.confidence, 'high')
    })

    test('Given existing hard exit north and description mentions "northward path", skips north (no duplicate)', () => {
        const location = {
            id: 'loc-3',
            name: 'Crossroads',
            description: 'A crossroads. Northward path leads into the hills.',
            exits: [{ direction: 'north', to: 'other-loc', description: 'Go north' }],
        }
        const results = analyseLocation(location)
        const north = results.find((r) => r.direction === 'north')
        assert.ok(!north, 'should not report north when hard exit already exists')
    })

    test('Given existing pending north in exitAvailability and description mentions "to the north", skips north', () => {
        const location = {
            id: 'loc-4',
            name: 'Field',
            description: 'Open field. To the north, forest stretches.',
            exits: [],
            exitAvailability: {
                pending: { north: 'Forest awaiting exploration' },
            },
        }
        const results = analyseLocation(location)
        const north = results.find((r) => r.direction === 'north')
        assert.ok(!north, 'should not report north when already in pending')
    })

    test('Given existing forbidden west in exitAvailability and description mentions "impassable west", skips west', () => {
        const location = {
            id: 'loc-5',
            name: 'Walled Area',
            description: 'Impassable cliff west, no crossing possible.',
            exits: [],
            exitAvailability: {
                forbidden: { west: { reason: 'Cliff', motif: 'cliff' } },
            },
        }
        const results = analyseLocation(location)
        const west = results.find((r) => r.direction === 'west')
        assert.ok(!west, 'should not report west when already in forbidden')
    })

    test('Given a location with no description, returns empty array', () => {
        const location = { id: 'loc-6', name: 'Empty', exits: [] }
        const results = analyseLocation(location)
        assert.deepEqual(results, [])
    })

    test('When both forbidden and pending patterns match the same direction, prefers forbidden', () => {
        // Description has "northward" (pending, medium) and "blocked north" (forbidden, high)
        const location = {
            id: 'loc-7',
            name: 'Blocked Path',
            description: 'Northward the road stretches but is blocked north by fallen boulders.',
            exits: [],
        }
        const results = analyseLocation(location)
        const north = results.find((r) => r.direction === 'north')
        // forbidden should win over pending
        assert.ok(north, 'should detect north')
        assert.equal(north.suggestedAvailability, 'forbidden')
    })

    test('Evidence phrase is included in result', () => {
        const location = {
            id: 'loc-8',
            name: 'Moor',
            description: 'Open moorland. North, hills rise toward distant peaks.',
            exits: [],
        }
        const results = analyseLocation(location)
        assert.ok(results.length > 0, 'should have candidates')
        for (const r of results) {
            assert.ok(typeof r.evidencePhrase === 'string' && r.evidencePhrase.length > 0, 'evidencePhrase should be non-empty')
        }
    })

    test('Result includes required fields: locationId, locationName, direction, evidencePhrase, confidence, suggestedAvailability', () => {
        const location = {
            id: 'loc-9',
            name: 'Valley',
            description: 'Valley floor. Southward the ground rises steeply.',
            exits: [],
        }
        const results = analyseLocation(location)
        assert.ok(results.length > 0)
        const entry = results[0]
        assert.ok('locationId' in entry)
        assert.ok('locationName' in entry)
        assert.ok('direction' in entry)
        assert.ok('evidencePhrase' in entry)
        assert.ok('confidence' in entry)
        assert.ok('suggestedAvailability' in entry)
        assert.equal(entry.locationId, 'loc-9')
        assert.equal(entry.locationName, 'Valley')
    })
})

// ---------------------------------------------------------------------------
// Unit tests for analyseLocations()
// ---------------------------------------------------------------------------

describe('analyseLocations()', () => {
    test('Locations without description are included in skipped list', () => {
        const locations = [
            { id: 'a', name: 'A', description: 'To the north lies a forest.', exits: [] },
            { id: 'b', name: 'B', exits: [] }, // no description
        ]
        const report = analyseLocations(locations)
        assert.equal(report.summary.skippedLocations, 1)
        assert.ok(report.skipped.some((s) => s.locationId === 'b'))
    })

    test('Summary counts match candidate array', () => {
        const locations = [
            { id: 'a', name: 'A', description: 'To the north lies a forest. Sheer cliffs block passage east.', exits: [] },
            { id: 'b', name: 'B', description: 'Southward the track leads onward.', exits: [] },
        ]
        const report = analyseLocations(locations)
        assert.equal(report.summary.totalCandidates, report.candidates.length)
        assert.equal(report.summary.totalLocations, 2)
        const pendingCount = report.candidates.filter((c) => c.suggestedAvailability === 'pending').length
        const forbiddenCount = report.candidates.filter((c) => c.suggestedAvailability === 'forbidden').length
        assert.equal(report.summary.pendingSuggested, pendingCount)
        assert.equal(report.summary.forbiddenSuggested, forbiddenCount)
    })

    test('scannedAt is an ISO timestamp string', () => {
        const report = analyseLocations([])
        assert.ok(typeof report.scannedAt === 'string')
        assert.ok(!isNaN(Date.parse(report.scannedAt)))
    })
})

// ---------------------------------------------------------------------------
// CLI integration tests
// ---------------------------------------------------------------------------

async function runScript(args, options = {}) {
    return execAsync('node', [SCRIPT_PATH, ...args], options)
}

describe('analyze-implicit-exits.mjs CLI', () => {
    test('--help flag shows usage information', async () => {
        const { stdout } = await runScript(['--help'])
        assert.ok(stdout.includes('Implicit Exit Analyser'))
        assert.ok(stdout.includes('Usage:'))
        assert.ok(stdout.includes('--data='))
        assert.ok(stdout.includes('--output='))
    })

    test('runs against default data file and outputs valid JSON to stdout', async () => {
        const { stdout } = await runScript([])
        let report
        try {
            report = JSON.parse(stdout)
        } catch {
            assert.fail(`stdout was not valid JSON: ${stdout.slice(0, 200)}`)
        }
        assert.ok(report.scannedAt, 'report has scannedAt')
        assert.ok(report.summary, 'report has summary')
        assert.ok(Array.isArray(report.candidates), 'candidates is array')
        assert.ok(Array.isArray(report.skipped), 'skipped is array')
        assert.ok(typeof report.summary.totalLocations === 'number')
        assert.ok(typeof report.summary.totalCandidates === 'number')
    })

    test('--output flag writes report to file', async () => {
        const tag = Date.now()
        const outRel = `scripts/test/.tmp/analyze-out-${tag}/report.json`
        const outAbs = resolve(PROJECT_ROOT, outRel)
        await mkdir(resolve(PROJECT_ROOT, `scripts/test/.tmp/analyze-out-${tag}`), { recursive: true })

        try {
            const { stderr } = await runScript([`--output=${outRel}`])
            assert.ok(stderr.includes('Analysis report written to') || stderr.includes('✓'), 'confirms write')

            const { readFile } = await import('node:fs/promises')
            const content = await readFile(outAbs, 'utf8')
            const report = JSON.parse(content)
            assert.ok(report.summary, 'file contains valid report')
        } finally {
            await rm(resolve(PROJECT_ROOT, `scripts/test/.tmp/analyze-out-${tag}`), { recursive: true, force: true })
        }
    })

    test('fails with exit code 1 for non-existent data file', async () => {
        try {
            await runScript(['--data=scripts/test/.tmp/does-not-exist.json'])
            assert.fail('should have exited with code 1')
        } catch (error) {
            assert.equal(error.code, 1)
            assert.ok((error.stderr || '').includes('Error'))
        }
    })

    test('rejects path traversal in --data', async () => {
        try {
            await runScript(['--data=../../../etc/passwd'])
            assert.fail('should have exited with code 1')
        } catch (error) {
            assert.equal(error.code, 1)
            assert.ok((error.stderr || '').includes('security'))
        }
    })

    test('fails with exit code 1 for unknown flag', async () => {
        try {
            await runScript(['--unknown-flag'])
            assert.fail('should have exited with code 1')
        } catch (error) {
            assert.equal(error.code, 1)
        }
    })

    test('custom --data file with known directional phrases produces expected candidates', async () => {
        const tag = Date.now()
        const tmpDir = resolve(PROJECT_ROOT, `scripts/test/.tmp/analyze-custom-${tag}`)
        await mkdir(tmpDir, { recursive: true })
        const dataFile = resolve(tmpDir, 'locs.json')
        const relData = `scripts/test/.tmp/analyze-custom-${tag}/locs.json`

        const testLocations = [
            {
                id: 'loc-pending-test',
                name: 'Moorland',
                description: 'Open moorland. To the north, hills rise.',
                exits: [],
                version: 1,
            },
            {
                id: 'loc-forbidden-test',
                name: 'Cliff Edge',
                description: 'Sheer cliffs block passage west.',
                exits: [],
                version: 1,
            },
            {
                id: 'loc-skip-test',
                name: 'Road',
                description: 'Northward the road continues.',
                exits: [{ direction: 'north', to: 'other', description: 'Road north' }],
                version: 1,
            },
        ]

        await writeFile(dataFile, JSON.stringify(testLocations, null, 2))

        try {
            const { stdout } = await runScript([`--data=${relData}`])
            const report = JSON.parse(stdout)

            // loc-pending-test: north should be pending
            const pendingNorth = report.candidates.find((c) => c.locationId === 'loc-pending-test' && c.direction === 'north')
            assert.ok(pendingNorth, 'should detect pending north')
            assert.equal(pendingNorth.suggestedAvailability, 'pending')

            // loc-forbidden-test: west should be forbidden
            const forbiddenWest = report.candidates.find((c) => c.locationId === 'loc-forbidden-test' && c.direction === 'west')
            assert.ok(forbiddenWest, 'should detect forbidden west')
            assert.equal(forbiddenWest.suggestedAvailability, 'forbidden')

            // loc-skip-test: north should NOT appear (already has hard exit)
            const skipNorth = report.candidates.find((c) => c.locationId === 'loc-skip-test' && c.direction === 'north')
            assert.ok(!skipNorth, 'should not report north for loc with existing hard exit')
        } finally {
            await rm(tmpDir, { recursive: true, force: true })
        }
    })
})
