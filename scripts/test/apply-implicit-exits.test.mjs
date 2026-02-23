/**
 * Tests for apply-implicit-exits.mjs
 *
 * Covers:
 * - applyAdditions(): merge logic, duplicate prevention, pending/forbidden entry creation
 * - validateAdditionEntry(): field validation
 * - CLI interface (--help, --dry-run, --data, --additions)
 */

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { promisify } from 'node:util'

const execAsync = promisify(execFile)

const SCRIPT_PATH = resolve(new URL('..', import.meta.url).pathname, 'apply-implicit-exits.mjs')
const PROJECT_ROOT = resolve(new URL('../..', import.meta.url).pathname)

const { applyAdditions, validateAdditionEntry, directionAlreadyCovered } = await import('../apply-implicit-exits.mjs')

// ---------------------------------------------------------------------------
// Unit tests for validateAdditionEntry()
// ---------------------------------------------------------------------------

describe('validateAdditionEntry()', () => {
    test('valid pending entry passes validation', () => {
        const entry = { locationId: 'loc-1', direction: 'north', availability: 'pending', reason: 'Open field' }
        const { valid, errors } = validateAdditionEntry(entry, 0)
        assert.ok(valid, `Expected valid but got errors: ${errors.join(', ')}`)
        assert.equal(errors.length, 0)
    })

    test('valid forbidden entry with motif and reveal passes validation', () => {
        const entry = {
            locationId: 'loc-1',
            direction: 'west',
            availability: 'forbidden',
            reason: 'Sheer cliff',
            motif: 'cliff',
            reveal: 'onLook',
        }
        const { valid, errors } = validateAdditionEntry(entry, 0)
        assert.ok(valid, `Expected valid but got errors: ${errors.join(', ')}`)
    })

    test('missing locationId is invalid', () => {
        const entry = { direction: 'north', availability: 'pending', reason: 'Open' }
        const { valid } = validateAdditionEntry(entry, 0)
        assert.ok(!valid)
    })

    test('invalid direction is rejected', () => {
        const entry = { locationId: 'loc-1', direction: 'upward', availability: 'pending', reason: 'Open' }
        const { valid } = validateAdditionEntry(entry, 0)
        assert.ok(!valid)
    })

    test('invalid availability is rejected', () => {
        const entry = { locationId: 'loc-1', direction: 'north', availability: 'maybe', reason: 'Open' }
        const { valid } = validateAdditionEntry(entry, 0)
        assert.ok(!valid)
    })

    test('empty reason is rejected', () => {
        const entry = { locationId: 'loc-1', direction: 'north', availability: 'pending', reason: '' }
        const { valid } = validateAdditionEntry(entry, 0)
        assert.ok(!valid)
    })

    test('pending entry with motif is rejected', () => {
        const entry = { locationId: 'loc-1', direction: 'north', availability: 'pending', reason: 'Field', motif: 'cliff' }
        const { valid } = validateAdditionEntry(entry, 0)
        assert.ok(!valid)
    })

    test('invalid motif is rejected', () => {
        const entry = { locationId: 'loc-1', direction: 'west', availability: 'forbidden', reason: 'Cliff', motif: 'unknown' }
        const { valid } = validateAdditionEntry(entry, 0)
        assert.ok(!valid)
    })

    test('invalid reveal is rejected', () => {
        const entry = { locationId: 'loc-1', direction: 'west', availability: 'forbidden', reason: 'Cliff', reveal: 'immediately' }
        const { valid } = validateAdditionEntry(entry, 0)
        assert.ok(!valid)
    })

    test('non-object entry returns error', () => {
        const { valid, errors } = validateAdditionEntry('not-an-object', 3)
        assert.ok(!valid)
        assert.ok(errors[0].includes('additions[3]'))
    })
})

// ---------------------------------------------------------------------------
// Unit tests for directionAlreadyCovered()
// ---------------------------------------------------------------------------

describe('directionAlreadyCovered()', () => {
    test('returns true when direction has a hard exit', () => {
        const loc = { exits: [{ direction: 'north', to: 'other' }], exitAvailability: {} }
        assert.ok(directionAlreadyCovered(loc, 'north'))
    })

    test('returns true when direction is in pending', () => {
        const loc = { exits: [], exitAvailability: { pending: { north: 'Forest' } } }
        assert.ok(directionAlreadyCovered(loc, 'north'))
    })

    test('returns true when direction is in forbidden', () => {
        const loc = { exits: [], exitAvailability: { forbidden: { west: { reason: 'Cliff' } } } }
        assert.ok(directionAlreadyCovered(loc, 'west'))
    })

    test('returns false when direction is uncovered', () => {
        const loc = { exits: [{ direction: 'south', to: 'other' }], exitAvailability: { pending: { east: 'Forest' } } }
        assert.ok(!directionAlreadyCovered(loc, 'north'))
    })

    test('returns false when exits and exitAvailability are missing', () => {
        const loc = { id: 'x' }
        assert.ok(!directionAlreadyCovered(loc, 'north'))
    })
})

// ---------------------------------------------------------------------------
// Unit tests for applyAdditions()
// ---------------------------------------------------------------------------

describe('applyAdditions()', () => {
    test('applies a pending addition to a location without exitAvailability', () => {
        const locations = [{ id: 'loc-a', name: 'Field', exits: [], version: 1 }]
        const additions = [{ locationId: 'loc-a', direction: 'north', availability: 'pending', reason: 'Open countryside' }]

        const { applied, skipped } = applyAdditions(locations, additions)

        assert.equal(applied.length, 1)
        assert.equal(skipped.length, 0)
        assert.equal(locations[0].exitAvailability.pending.north, 'Open countryside')
    })

    test('applies a forbidden addition with motif and reveal', () => {
        const locations = [{ id: 'loc-a', name: 'Cliff', exits: [], version: 1 }]
        const additions = [
            {
                locationId: 'loc-a',
                direction: 'west',
                availability: 'forbidden',
                reason: 'Sheer drop',
                motif: 'cliff',
                reveal: 'onLook',
            },
        ]

        applyAdditions(locations, additions)

        const entry = locations[0].exitAvailability.forbidden.west
        assert.deepEqual(entry, { reason: 'Sheer drop', motif: 'cliff', reveal: 'onLook' })
    })

    test('forbidden addition without optional fields omits them from object', () => {
        const locations = [{ id: 'loc-a', name: 'Wall', exits: [], version: 1 }]
        const additions = [{ locationId: 'loc-a', direction: 'east', availability: 'forbidden', reason: 'Solid wall' }]

        applyAdditions(locations, additions)

        const entry = locations[0].exitAvailability.forbidden.east
        assert.deepEqual(entry, { reason: 'Solid wall' })
        assert.ok(!('motif' in entry))
        assert.ok(!('reveal' in entry))
    })

    test('does not overwrite an existing hard exit', () => {
        const locations = [
            {
                id: 'loc-a',
                name: 'Road',
                exits: [{ direction: 'north', to: 'loc-b', description: 'Road north' }],
                version: 1,
            },
        ]
        const additions = [{ locationId: 'loc-a', direction: 'north', availability: 'pending', reason: 'New pending' }]

        const { applied, skipped } = applyAdditions(locations, additions)

        assert.equal(applied.length, 0)
        assert.equal(skipped.length, 1)
        assert.ok(skipped[0].skipReason.includes('already covered'))
        // Original exit untouched
        assert.equal(locations[0].exits[0].to, 'loc-b')
        assert.ok(!locations[0].exitAvailability)
    })

    test('does not overwrite an existing pending entry', () => {
        const locations = [
            {
                id: 'loc-a',
                name: 'Gate',
                exits: [],
                exitAvailability: { pending: { north: 'Wilderness' } },
                version: 1,
            },
        ]
        const additions = [{ locationId: 'loc-a', direction: 'north', availability: 'pending', reason: 'New description' }]

        const { applied, skipped } = applyAdditions(locations, additions)

        assert.equal(applied.length, 0)
        assert.equal(skipped.length, 1)
        // Original entry preserved
        assert.equal(locations[0].exitAvailability.pending.north, 'Wilderness')
    })

    test('does not overwrite an existing forbidden entry', () => {
        const locations = [
            {
                id: 'loc-a',
                name: 'Cliff',
                exits: [],
                exitAvailability: { forbidden: { east: { reason: 'Original cliff' } } },
                version: 1,
            },
        ]
        const additions = [{ locationId: 'loc-a', direction: 'east', availability: 'forbidden', reason: 'New cliff' }]

        const { applied, skipped } = applyAdditions(locations, additions)

        assert.equal(applied.length, 0)
        assert.equal(skipped.length, 1)
        // Original entry preserved
        assert.equal(locations[0].exitAvailability.forbidden.east.reason, 'Original cliff')
    })

    test('skips additions for unknown locationId', () => {
        const locations = [{ id: 'loc-a', name: 'Field', exits: [], version: 1 }]
        const additions = [{ locationId: 'loc-unknown', direction: 'north', availability: 'pending', reason: 'Open' }]

        const { applied, skipped } = applyAdditions(locations, additions)

        assert.equal(applied.length, 0)
        assert.equal(skipped.length, 1)
        assert.ok(skipped[0].skipReason.includes('not found'))
    })

    test('merges multiple additions to same location correctly', () => {
        const locations = [{ id: 'loc-a', name: 'Junction', exits: [], version: 1 }]
        const additions = [
            { locationId: 'loc-a', direction: 'north', availability: 'pending', reason: 'Countryside north' },
            { locationId: 'loc-a', direction: 'west', availability: 'forbidden', reason: 'Sheer cliff west', motif: 'cliff' },
        ]

        const { applied } = applyAdditions(locations, additions)

        assert.equal(applied.length, 2)
        assert.equal(locations[0].exitAvailability.pending.north, 'Countryside north')
        assert.equal(locations[0].exitAvailability.forbidden.west.reason, 'Sheer cliff west')
        assert.equal(locations[0].exitAvailability.forbidden.west.motif, 'cliff')
    })

    test('preserves existing exits and exitAvailability when adding new entries', () => {
        const locations = [
            {
                id: 'loc-a',
                name: 'Complex',
                exits: [{ direction: 'south', to: 'loc-b', description: 'Go south' }],
                exitAvailability: { pending: { east: 'Forest' } },
                version: 1,
            },
        ]
        const additions = [{ locationId: 'loc-a', direction: 'north', availability: 'pending', reason: 'Hills' }]

        applyAdditions(locations, additions)

        // Original exits preserved
        assert.equal(locations[0].exits[0].direction, 'south')
        // Original pending preserved
        assert.equal(locations[0].exitAvailability.pending.east, 'Forest')
        // New pending added
        assert.equal(locations[0].exitAvailability.pending.north, 'Hills')
    })
})

// ---------------------------------------------------------------------------
// CLI integration tests
// ---------------------------------------------------------------------------

async function runScript(args, options = {}) {
    return execAsync('node', [SCRIPT_PATH, ...args], options)
}

async function withTmpDir(fn) {
    const tag = Date.now() + '-' + Math.random().toString(36).slice(2, 8)
    const tmpDir = resolve(PROJECT_ROOT, `scripts/test/.tmp/apply-${tag}`)
    await mkdir(tmpDir, { recursive: true })
    try {
        await fn(tmpDir, `scripts/test/.tmp/apply-${tag}`)
    } finally {
        await rm(tmpDir, { recursive: true, force: true })
    }
}

describe('apply-implicit-exits.mjs CLI', () => {
    test('--help flag shows usage information', async () => {
        const { stdout } = await runScript(['--help'])
        assert.ok(stdout.includes('Apply Implicit Exits'))
        assert.ok(stdout.includes('--data='))
        assert.ok(stdout.includes('--additions='))
        assert.ok(stdout.includes('--dry-run'))
    })

    test('--dry-run shows proposed changes without modifying file', async () => {
        await withTmpDir(async (tmpDir, relTmp) => {
            const locations = [{ id: 'loc-test', name: 'Field', exits: [], version: 1 }]
            const additions = [{ locationId: 'loc-test', direction: 'north', availability: 'pending', reason: 'Open field' }]

            const dataFile = resolve(tmpDir, 'locations.json')
            const addFile = resolve(tmpDir, 'additions.json')
            const originalContent = JSON.stringify(locations, null, 2)

            await writeFile(dataFile, originalContent)
            await writeFile(addFile, JSON.stringify(additions, null, 2))

            const { stdout } = await runScript([
                `--data=${relTmp}/locations.json`,
                `--additions=${relTmp}/additions.json`,
                '--dry-run',
            ])

            assert.ok(stdout.includes('DRY RUN'))
            assert.ok(stdout.includes('No files were modified'))

            // File must NOT be modified
            const { readFile } = await import('node:fs/promises')
            const afterContent = await readFile(dataFile, 'utf8')
            assert.equal(afterContent, originalContent)
        })
    })

    test('applies additions and writes updated file', async () => {
        await withTmpDir(async (tmpDir, relTmp) => {
            const locations = [{ id: 'loc-test', name: 'Field', exits: [], version: 1 }]
            const additions = [{ locationId: 'loc-test', direction: 'north', availability: 'pending', reason: 'Open countryside' }]

            const dataFile = resolve(tmpDir, 'locations.json')
            const addFile = resolve(tmpDir, 'additions.json')

            await writeFile(dataFile, JSON.stringify(locations, null, 2))
            await writeFile(addFile, JSON.stringify(additions, null, 2))

            const { stdout } = await runScript([`--data=${relTmp}/locations.json`, `--additions=${relTmp}/additions.json`])

            assert.ok(stdout.includes('Applied 1'))

            const { readFile } = await import('node:fs/promises')
            const updated = JSON.parse(await readFile(dataFile, 'utf8'))
            assert.equal(updated[0].exitAvailability.pending.north, 'Open countryside')
        })
    })

    test('reports skipped entries when direction already covered', async () => {
        await withTmpDir(async (tmpDir, relTmp) => {
            const locations = [
                {
                    id: 'loc-test',
                    name: 'Road',
                    exits: [{ direction: 'north', to: 'other', description: 'Go north' }],
                    version: 1,
                },
            ]
            const additions = [{ locationId: 'loc-test', direction: 'north', availability: 'pending', reason: 'Already covered' }]

            await writeFile(resolve(tmpDir, 'locations.json'), JSON.stringify(locations, null, 2))
            await writeFile(resolve(tmpDir, 'additions.json'), JSON.stringify(additions, null, 2))

            const { stdout } = await runScript([`--data=${relTmp}/locations.json`, `--additions=${relTmp}/additions.json`])

            assert.ok(stdout.includes('Skipped 1'))
        })
    })

    test('fails with exit code 1 when data file not found', async () => {
        await withTmpDir(async (tmpDir, relTmp) => {
            await writeFile(resolve(tmpDir, 'additions.json'), '[]')

            try {
                await runScript([`--data=${relTmp}/missing.json`, `--additions=${relTmp}/additions.json`])
                assert.fail('should exit 1')
            } catch (error) {
                assert.equal(error.code, 1)
                assert.ok((error.stderr || '').includes('Error'))
            }
        })
    })

    test('fails with exit code 1 when additions file not found', async () => {
        await withTmpDir(async (tmpDir, relTmp) => {
            await writeFile(resolve(tmpDir, 'locations.json'), '[]')

            try {
                await runScript([`--data=${relTmp}/locations.json`, `--additions=${relTmp}/missing.json`])
                assert.fail('should exit 1')
            } catch (error) {
                assert.equal(error.code, 1)
            }
        })
    })

    test('fails with exit code 1 when additions JSON is invalid', async () => {
        await withTmpDir(async (tmpDir, relTmp) => {
            await writeFile(resolve(tmpDir, 'locations.json'), '[]')
            await writeFile(
                resolve(tmpDir, 'additions.json'),
                JSON.stringify([{ locationId: 'x', direction: 'invalid-dir', availability: 'pending', reason: 'test' }])
            )

            try {
                await runScript([`--data=${relTmp}/locations.json`, `--additions=${relTmp}/additions.json`])
                assert.fail('should exit 1')
            } catch (error) {
                assert.equal(error.code, 1)
                assert.ok((error.stderr || '').includes('Validation errors'))
            }
        })
    })

    test('rejects path traversal in --data', async () => {
        await withTmpDir(async (tmpDir, relTmp) => {
            await writeFile(resolve(tmpDir, 'additions.json'), '[]')

            try {
                await runScript([`--data=../../../etc/passwd`, `--additions=${relTmp}/additions.json`])
                assert.fail('should exit 1')
            } catch (error) {
                assert.equal(error.code, 1)
                assert.ok((error.stderr || '').includes('security'))
            }
        })
    })

    test('integration: no existing hard exits are overwritten', async () => {
        await withTmpDir(async (tmpDir, relTmp) => {
            const locations = [
                {
                    id: 'loc-north',
                    name: 'North Gate',
                    exits: [
                        { direction: 'south', to: 'loc-road', description: 'Back down' },
                        { direction: 'east', to: 'loc-shrine', description: 'To shrine' },
                    ],
                    exitAvailability: { pending: { north: 'Open wilderness' } },
                    version: 3,
                },
            ]
            // Attempt to overwrite all three covered directions
            const additions = [
                { locationId: 'loc-north', direction: 'south', availability: 'pending', reason: 'Should be skipped' },
                { locationId: 'loc-north', direction: 'east', availability: 'forbidden', reason: 'Should be skipped' },
                { locationId: 'loc-north', direction: 'north', availability: 'pending', reason: 'Should be skipped' },
                // This one should apply
                { locationId: 'loc-north', direction: 'west', availability: 'pending', reason: 'Rolling hills west' },
            ]

            await writeFile(resolve(tmpDir, 'locations.json'), JSON.stringify(locations, null, 2))
            await writeFile(resolve(tmpDir, 'additions.json'), JSON.stringify(additions, null, 2))

            await runScript([`--data=${relTmp}/locations.json`, `--additions=${relTmp}/additions.json`])

            const { readFile } = await import('node:fs/promises')
            const updated = JSON.parse(await readFile(resolve(tmpDir, 'locations.json'), 'utf8'))
            const loc = updated[0]

            // Hard exits preserved
            assert.equal(loc.exits[0].direction, 'south')
            assert.equal(loc.exits[1].direction, 'east')
            // Existing pending preserved
            assert.equal(loc.exitAvailability.pending.north, 'Open wilderness')
            // New pending added
            assert.equal(loc.exitAvailability.pending.west, 'Rolling hills west')
            // No forbidden accidentally added
            assert.ok(!loc.exitAvailability.forbidden?.south)
            assert.ok(!loc.exitAvailability.forbidden?.east)
        })
    })
})
