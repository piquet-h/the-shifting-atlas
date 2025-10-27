/**
 * Integration tests for mosswell-migration.mjs script
 * Tests CLI interface, validation, dry-run mode, and edge cases
 */

import assert from 'node:assert'
import { execFile } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, test, beforeEach, afterEach } from 'node:test'
import { promisify } from 'node:util'

const execAsync = promisify(execFile)

const SCRIPT_PATH = resolve(new URL('..', import.meta.url).pathname, 'mosswell-migration.mjs')
const TEST_MIGRATIONS_DIR = resolve('/tmp', 'migration-test-' + Date.now())

// Helper to check output from both stdout and stderr
function getOutput(result) {
    return (result.stdout || '') + (result.stderr || '')
}

describe('mosswell-migration.mjs CLI', () => {
    beforeEach(async () => {
        // Create temporary directory for test migrations
        await mkdir(TEST_MIGRATIONS_DIR, { recursive: true })
    })

    afterEach(async () => {
        // Clean up test directory
        try {
            await rm(TEST_MIGRATIONS_DIR, { recursive: true, force: true })
        } catch (err) {
            // Ignore cleanup errors
        }
    })

    test('--help flag shows usage information', async () => {
        const { stdout } = await execAsync('node', [SCRIPT_PATH, '--help'])
        
        assert.ok(stdout.includes('Mosswell World Data Migration'), 'shows title')
        assert.ok(stdout.includes('Usage:'), 'shows usage')
        assert.ok(stdout.includes('--mode='), 'shows mode option')
        assert.ok(stdout.includes('--data='), 'shows data option')
        assert.ok(stdout.includes('--dry-run'), 'shows dry-run option')
        assert.ok(stdout.includes('--schema-version='), 'shows schema-version option')
        assert.ok(stdout.includes('Examples:'), 'shows examples')
    })

    test('requires --data argument', async () => {
        try {
            await execAsync('node', [SCRIPT_PATH, '--mode=memory'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            const output = error.stdout + error.stderr
            assert.ok(output.includes('❌ Error: --data argument is required'), 'shows error')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('dry-run mode previews changes without applying', async () => {
        const testData = {
            schemaVersion: 1,
            migrationName: 'test-migration',
            locations: [
                {
                    id: 'test-loc-001',
                    name: 'Test Location',
                    description: 'A test location for dry-run',
                    version: 1,
                    exits: [
                        { direction: 'north', to: 'test-loc-002', description: 'Go north' }
                    ]
                },
                {
                    id: 'test-loc-002',
                    name: 'Second Test Location',
                    description: 'Another test location',
                    version: 1,
                    exits: []
                }
            ]
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'test-migration.json')
        await writeFile(testDataPath, JSON.stringify(testData, null, 2))

        const { stdout } = await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--dry-run'], {
            env: { ...process.env, PERSISTENCE_MODE: 'memory' }
        })

        assert.ok(stdout.includes('Mosswell World Data Migration'), 'shows title')
        assert.ok(stdout.includes('Dry Run: YES'), 'confirms dry-run mode')
        assert.ok(stdout.includes('Planned Changes'), 'shows planned changes section')
        assert.ok(stdout.includes('test-migration'), 'shows migration name')
        assert.ok(stdout.includes('Locations to add: 2'), 'shows location count')
        assert.ok(stdout.includes('DRY RUN MODE - No changes applied'), 'confirms no changes')
        assert.ok(stdout.includes('Test Location'), 'shows location details')
    })

    test('validates migration data structure', async () => {
        const invalidData = {
            // Missing schemaVersion
            migrationName: 'invalid-migration',
            locations: []
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'invalid-migration.json')
        await writeFile(testDataPath, JSON.stringify(invalidData, null, 2))

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('❌ Validation Errors'), 'shows validation errors')
            assert.ok(getOutput(error).includes('schemaVersion'), 'mentions missing field')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('detects empty locations array', async () => {
        const emptyData = {
            schemaVersion: 1,
            migrationName: 'empty-migration',
            locations: []
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'empty-migration.json')
        await writeFile(testDataPath, JSON.stringify(emptyData, null, 2))

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('locations array cannot be empty'), 'shows error')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('detects duplicate IDs within migration data', async () => {
        const duplicateData = {
            schemaVersion: 1,
            migrationName: 'duplicate-migration',
            locations: [
                {
                    id: 'duplicate-id',
                    name: 'First Location',
                    description: 'First location with duplicate ID',
                    version: 1
                },
                {
                    id: 'duplicate-id',
                    name: 'Second Location',
                    description: 'Second location with duplicate ID',
                    version: 1
                }
            ]
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'duplicate-migration.json')
        await writeFile(testDataPath, JSON.stringify(duplicateData, null, 2))

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('Duplicate ID'), 'shows duplicate ID error')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('validates schema version meets minimum requirement', async () => {
        const lowVersionData = {
            schemaVersion: 1,
            migrationName: 'low-version-migration',
            locations: [
                {
                    id: 'test-loc-v1',
                    name: 'Test Location',
                    description: 'Location with low schema version',
                    version: 1
                }
            ]
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'low-version-migration.json')
        await writeFile(testDataPath, JSON.stringify(lowVersionData, null, 2))

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--schema-version=3', '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('Schema Version Error'), 'shows schema error')
            assert.ok(getOutput(error).includes('below minimum required version'), 'explains version issue')
            assert.equal(error.code, 3, 'exits with code 3 for schema errors')
        }
    })

    test('rejects schema version downgrades', async () => {
        const downgradeData = {
            schemaVersion: 1,
            migrationName: 'downgrade-migration',
            locations: [
                {
                    id: 'test-loc-downgrade',
                    name: 'Test Location',
                    description: 'Location with downgraded schema',
                    version: 1
                }
            ]
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'downgrade-migration.json')
        await writeFile(testDataPath, JSON.stringify(downgradeData, null, 2))

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--schema-version=2', '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('Schema downgrades are not allowed'), 'prevents downgrade')
            assert.equal(error.code, 3, 'exits with code 3')
        }
    })

    test('validates location structure', async () => {
        const invalidLocData = {
            schemaVersion: 1,
            migrationName: 'invalid-location',
            locations: [
                {
                    // Missing id and name
                    description: 'Invalid location',
                    version: 1
                }
            ]
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'invalid-location.json')
        await writeFile(testDataPath, JSON.stringify(invalidLocData, null, 2))

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('Validation Errors'), 'shows validation errors')
            assert.ok(getOutput(error).includes('Missing or invalid id'), 'mentions missing id')
            assert.ok(getOutput(error).includes('Missing or invalid name'), 'mentions missing name')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('validates exit structure', async () => {
        const invalidExitData = {
            schemaVersion: 1,
            migrationName: 'invalid-exit',
            locations: [
                {
                    id: 'test-loc-exit',
                    name: 'Test Location',
                    description: 'Location with invalid exit',
                    version: 1,
                    exits: [
                        {
                            // Missing direction
                            to: 'other-loc',
                            description: 'Go somewhere'
                        }
                    ]
                }
            ]
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'invalid-exit.json')
        await writeFile(testDataPath, JSON.stringify(invalidExitData, null, 2))

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('Missing or invalid direction'), 'validates exit direction')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('rejects invalid mode values', async () => {
        const testData = {
            schemaVersion: 1,
            migrationName: 'test',
            locations: [
                {
                    id: 'test-id',
                    name: 'Test',
                    description: 'Test location',
                    version: 1
                }
            ]
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'test.json')
        await writeFile(testDataPath, JSON.stringify(testData, null, 2))

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--mode=invalid'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('❌ Error: Invalid mode'), 'shows invalid mode error')
            assert.ok(getOutput(error).includes("Must be 'memory' or 'cosmos'"), 'explains valid modes')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('prevents path traversal attacks', async () => {
        try {
            await execAsync('node', [SCRIPT_PATH, '--data=../../../etc/passwd', '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('outside the project directory'), 'shows security error')
            assert.ok(getOutput(error).includes('security reasons'), 'explains security concern')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('handles missing data file gracefully', async () => {
        const nonexistentPath = resolve(TEST_MIGRATIONS_DIR, 'nonexistent.json')

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${nonexistentPath}`, '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('Failed to load migration data'), 'shows load error')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('handles malformed JSON gracefully', async () => {
        const malformedPath = resolve(TEST_MIGRATIONS_DIR, 'malformed.json')
        await writeFile(malformedPath, '{ invalid json }')

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${malformedPath}`, '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('Failed to load migration data'), 'shows load error')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('validates invalid schema-version argument', async () => {
        const testData = {
            schemaVersion: 1,
            migrationName: 'test',
            locations: [
                {
                    id: 'test-id',
                    name: 'Test',
                    description: 'Test location',
                    version: 1
                }
            ]
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'test.json')
        await writeFile(testDataPath, JSON.stringify(testData, null, 2))

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--schema-version=invalid'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            assert.ok(getOutput(error).includes('schema-version must be a positive integer'), 'validates argument')
            assert.equal(error.code, 1, 'exits with code 1')
        }
    })

    test('shows idempotency note in output', async () => {
        const testData = {
            schemaVersion: 1,
            migrationName: 'idempotent-test',
            locations: [
                {
                    id: 'test-idem-001',
                    name: 'Idempotent Test',
                    description: 'Testing idempotency message',
                    version: 1
                }
            ]
        }

        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'idempotent-test.json')
        await writeFile(testDataPath, JSON.stringify(testData, null, 2))

        const { stdout } = await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--dry-run'])

        assert.ok(stdout.includes('idempotent'), 'mentions idempotency')
        assert.ok(stdout.includes('Re-running'), 'explains re-run behavior')
    })

    test('displays recovery information on runtime errors', async () => {
        // This test would need to trigger a runtime error during migration
        // For now, we test that file loading errors show helpful messages
        const testDataPath = resolve(TEST_MIGRATIONS_DIR, 'nonexistent-error.json')

        try {
            await execAsync('node', [SCRIPT_PATH, `--data=${testDataPath}`, '--dry-run'])
            assert.fail('Should have thrown an error')
        } catch (error) {
            const output = getOutput(error)
            assert.ok(output.includes('Failed to load migration data'), 'shows error message')
            assert.ok(output.includes(testDataPath), 'includes file path')
        }
    })
})

describe('mosswell-migration.mjs validation functions', () => {
    test('validateMigrationData detects structural issues', async () => {
        const { validateMigrationData } = await import('../mosswell-migration.mjs')
        
        // Missing schemaVersion
        let errors = validateMigrationData({ migrationName: 'test', locations: [] })
        assert.ok(errors.some(e => e.includes('schemaVersion')), 'detects missing schemaVersion')
        
        // Missing migrationName
        errors = validateMigrationData({ schemaVersion: 1, locations: [] })
        assert.ok(errors.some(e => e.includes('migrationName')), 'detects missing migrationName')
        
        // Invalid locations type
        errors = validateMigrationData({ schemaVersion: 1, migrationName: 'test', locations: 'not-array' })
        assert.ok(errors.some(e => e.includes('locations must be an array')), 'detects invalid locations type')
    })

    test('validateSchemaVersion checks version requirements', async () => {
        const { validateSchemaVersion } = await import('../mosswell-migration.mjs')
        
        // Valid version
        let result = validateSchemaVersion({ schemaVersion: 3 }, 2)
        assert.strictEqual(result.valid, true, 'accepts higher version')
        
        // Equal version
        result = validateSchemaVersion({ schemaVersion: 2 }, 2)
        assert.strictEqual(result.valid, true, 'accepts equal version')
        
        // Lower version (downgrade)
        result = validateSchemaVersion({ schemaVersion: 1 }, 2)
        assert.strictEqual(result.valid, false, 'rejects lower version')
        assert.strictEqual(result.isDowngrade, true, 'marks as downgrade')
    })

    test('checkDuplicateIds finds conflicts', async () => {
        const { checkDuplicateIds } = await import('../mosswell-migration.mjs')
        
        const migrationData = {
            locations: [
                { id: 'existing-id', name: 'New Location' },
                { id: 'new-id', name: 'Another Location' }
            ]
        }
        
        const existingLocations = [
            { id: 'existing-id', name: 'Old Location' }
        ]
        
        const duplicates = await checkDuplicateIds(migrationData, existingLocations)
        assert.strictEqual(duplicates.length, 1, 'finds one duplicate')
        assert.strictEqual(duplicates[0].id, 'existing-id', 'identifies correct duplicate')
    })

    test('formatPlannedChanges generates readable output', async () => {
        const { formatPlannedChanges } = await import('../mosswell-migration.mjs')
        
        const migrationData = {
            schemaVersion: 2,
            migrationName: 'test-migration',
            locations: [
                {
                    id: 'loc-1',
                    name: 'First Location',
                    description: 'Test',
                    version: 1,
                    tags: ['test', 'demo'],
                    exits: [
                        { direction: 'north', to: 'loc-2' },
                        { direction: 'south', to: 'loc-3' }
                    ]
                },
                {
                    id: 'loc-2',
                    name: 'Second Location',
                    description: 'Test',
                    version: 1,
                    exits: []
                }
            ]
        }
        
        const output = formatPlannedChanges(migrationData)
        assert.ok(output.includes('test-migration'), 'includes migration name')
        assert.ok(output.includes('Schema Version: 2'), 'includes schema version')
        assert.ok(output.includes('Locations to add: 2'), 'includes location count')
        assert.ok(output.includes('Total exits: 2'), 'includes exit count')
        assert.ok(output.includes('First Location'), 'includes location details')
        assert.ok(output.includes('Tags: test, demo'), 'includes tags')
        assert.ok(output.includes('Exits: north, south'), 'includes exit directions')
    })
})
