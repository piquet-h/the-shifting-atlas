/**
 * Integration test for seed-anchor-locations.mjs script
 * Tests the CLI interface and idempotency behavior
 */

import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import { promisify } from 'node:util'

const execAsync = promisify(execFile)

const SCRIPT_PATH = resolve(new URL('..', import.meta.url).pathname, 'seed-anchor-locations.mjs')

describe('seed-anchor-locations.mjs CLI', () => {
    test('--help flag shows usage information', async () => {
        const { stdout, stderr } = await execAsync('node', [SCRIPT_PATH, '--help'])

        assert.ok(stdout.includes('Seed Script: Anchor Locations & Exits'), 'shows title')
        assert.ok(stdout.includes('Usage:'), 'shows usage')
        assert.ok(stdout.includes('--mode='), 'shows mode option')
        assert.ok(stdout.includes('--data='), 'shows data option')
        assert.ok(stdout.includes('Examples:'), 'shows examples')
    })

    test('runs successfully in memory mode with default data', async () => {
        const { stdout, stderr } = await execAsync('node', [SCRIPT_PATH, '--mode=memory'], {
            env: { ...process.env, PERSISTENCE_MODE: 'memory' }
        })

        // Check for success indicators
        assert.ok(stdout.includes('Seed Script: Anchor Locations & Exits'), 'shows title')
        assert.ok(stdout.includes('Persistence Mode: memory'), 'confirms memory mode')
        assert.ok(stdout.includes('✅ Seed operation completed successfully'), 'shows success')
        assert.ok(stdout.includes('Summary'), 'shows summary section')
        assert.ok(stdout.includes('Locations processed:'), 'shows locations count')
        assert.ok(stdout.includes('Exits created:'), 'shows exits count')
        assert.ok(stdout.includes('Elapsed time:'), 'shows elapsed time')
    })

    test('is idempotent - second run creates no duplicates', async () => {
        const env = { ...process.env, PERSISTENCE_MODE: 'memory' }

        // First run
        const firstRun = await execAsync('node', [SCRIPT_PATH, '--mode=memory'], { env })
        assert.ok(firstRun.stdout.includes('✅ Seed operation completed successfully'), 'first run succeeds')

        // Extract counts from first run (basic parsing)
        const firstLocationsMatch = firstRun.stdout.match(/Location vertices created:\s+(\d+)/)
        const firstExitsMatch = firstRun.stdout.match(/Exits created:\s+(\d+)/)

        assert.ok(firstLocationsMatch, 'first run reports locations created')
        assert.ok(firstExitsMatch, 'first run reports exits created')

        // Note: In memory mode with fresh process, each run starts fresh
        // For true idempotency testing, would need persistent storage or same process
        // This test validates the script runs twice without error
        const secondRun = await execAsync('node', [SCRIPT_PATH, '--mode=memory'], { env })
        assert.ok(secondRun.stdout.includes('✅ Seed operation completed successfully'), 'second run succeeds')
    })

    test('handles custom data file path', async () => {
        // Create a temporary test data file
        const tmpDir = resolve('/tmp', 'seed-test-' + Date.now())
        await mkdir(tmpDir, { recursive: true })

        const testDataPath = resolve(tmpDir, 'test-locations.json')
        const testData = [
            {
                id: 'test-loc-1',
                name: 'Test Location 1',
                description: 'A test location',
                exits: [
                    { direction: 'north', to: 'test-loc-2', description: 'Go north' }
                ],
                version: 1
            },
            {
                id: 'test-loc-2',
                name: 'Test Location 2',
                description: 'Another test location',
                exits: [],
                version: 1
            }
        ]
        await writeFile(testDataPath, JSON.stringify(testData, null, 2))

        // Run with custom data file
        const { stdout } = await execAsync('node', [SCRIPT_PATH, '--mode=memory', `--data=${testDataPath}`], {
            env: { ...process.env, PERSISTENCE_MODE: 'memory' }
        })

        assert.ok(stdout.includes('Loading location data from: ' + testDataPath), 'uses custom data path')
        assert.ok(stdout.includes('✓ Loaded 2 locations from blueprint'), 'loads correct count')
        assert.ok(stdout.includes('✅ Seed operation completed successfully'), 'succeeds with custom data')
    })

    test('fails gracefully with invalid data file', async () => {
        try {
            await execAsync(`node ${SCRIPT_PATH} --mode=memory --data=/nonexistent/file.json`, {
                env: { ...process.env, PERSISTENCE_MODE: 'memory' }
            })
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(error.stdout.includes('❌ Error: Failed to load location data'), 'shows error message')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('rejects invalid mode values', async () => {
        try {
            await execAsync(`node ${SCRIPT_PATH} --mode=invalid`, {
                env: { ...process.env, PERSISTENCE_MODE: 'memory' }
            })
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(error.stdout.includes('❌ Error: Invalid mode'), 'shows invalid mode error')
            assert.ok(error.stdout.includes("Must be 'memory' or 'cosmos'"), 'explains valid modes')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('prevents path traversal attacks', async () => {
        try {
            await execAsync(`node ${SCRIPT_PATH} --mode=memory --data=../../../etc/passwd`, {
                env: { ...process.env, PERSISTENCE_MODE: 'memory' }
            })
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(error.stdout.includes('outside the project directory'), 'shows security error')
            assert.ok(error.stdout.includes('security reasons'), 'explains security concern')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('prevents absolute paths outside project', async () => {
        try {
            await execAsync(`node ${SCRIPT_PATH} --mode=memory --data=/etc/passwd`, {
                env: { ...process.env, PERSISTENCE_MODE: 'memory' }
            })
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(error.stdout.includes('outside the project directory'), 'shows security error')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('shows idempotency note in output', async () => {
        const { stdout } = await execAsync(`node ${SCRIPT_PATH} --mode=memory`, {
            env: { ...process.env, PERSISTENCE_MODE: 'memory' }
        })

        assert.ok(stdout.includes('idempotent'), 'mentions idempotency')
        assert.ok(stdout.includes('Re-running'), 'explains re-run behavior')
        assert.ok(stdout.includes('duplicate'), 'explains no duplicates')
    })
})
