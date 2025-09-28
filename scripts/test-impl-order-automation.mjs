#!/usr/bin/env node
/* eslint-env node */

/**
 * Basic tests for implementation order automation scripts
 * Tests key functionality without full GitHub integration
 */

import {test} from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import {execSync, execFileSync} from 'node:child_process'

const TEST_DIR = path.join(process.cwd(), 'tmp', 'impl-order-tests')
const TEST_JSON = path.join(TEST_DIR, 'implementation-order.json')

// Create test directory and test data
function setupTest() {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, {recursive: true})
    }
    fs.mkdirSync(TEST_DIR, {recursive: true})

    // Create test implementation order file
    const testData = {
        project: 3,
        fieldId: 'PVTF_test',
        generated: '2025-01-01T00:00:00.000Z',
        items: [
            {issue: 1, order: 1, title: 'First Issue'},
            {issue: 2, order: 2, title: 'Second Issue'},
            {issue: 3, order: 3, title: 'Third Issue'}
        ]
    }

    fs.writeFileSync(TEST_JSON, JSON.stringify(testData, null, 2))
}

function cleanupTest() {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, {recursive: true})
    }
}

test('Priority analysis - high priority core feature', async (t) => {
    setupTest()

    const descFile = path.join(TEST_DIR, 'desc.txt')
    fs.writeFileSync(descFile, 'Foundation persistence layer for core database operations')

    const output = execFileSync(
        'node',
        [
            'scripts/analyze-issue-priority.mjs',
            '--issue-number',
            '999',
            '--title',
            'Core Database Foundation',
            '--description-file',
            descFile,
            '--labels',
            'scope:core,feature',
            '--milestone',
            'M0',
            '--has-existing-order',
            'false',
            '--existing-order',
            '0',
            '--force-resequence',
            'false'
        ],
        {encoding: 'utf8'}
    )

    const result = JSON.parse(output)

    assert.strictEqual(result.issueNumber, 999)
    assert.strictEqual(result.confidence, 'high')
    assert.strictEqual(result.action, 'assign')
    assert(result.priorityScore > 200, 'High priority score expected')
    assert(result.requiresResequence, 'Should require resequencing for high priority')

    cleanupTest()
})

test('Priority analysis - low priority documentation', async (t) => {
    setupTest()

    const descFile = path.join(TEST_DIR, 'desc.txt')
    fs.writeFileSync(descFile, 'Polish documentation and fix typos')

    const output = execFileSync(
        'node',
        [
            'scripts/analyze-issue-priority.mjs',
            '--issue-number',
            '998',
            '--title',
            '"Documentation Polish"',
            '--description-file',
            descFile,
            '--labels',
            'scope:devx,docs',
            '--milestone',
            '""',
            '--has-existing-order',
            'false',
            '--existing-order',
            '0',
            '--force-resequence',
            'false'
        ],
        {encoding: 'utf8'}
    )

    const result = JSON.parse(output)

    assert.strictEqual(result.issueNumber, 998)
    assert.strictEqual(result.confidence, 'low')
    assert.strictEqual(result.action, 'assign')
    assert(result.priorityScore < 100, 'Low priority score expected')
    assert(!result.requiresResequence, 'Should not require resequencing for low priority')

    cleanupTest()
})

test('Apply assignment - high priority insertion', async (t) => {
    setupTest()

    // Change working directory for the script to find our test file
    const originalCwd = process.cwd()
    const tempScriptDir = path.join(TEST_DIR, 'scripts')
    fs.mkdirSync(tempScriptDir, {recursive: true})

    // Copy scripts to test location
    fs.copyFileSync('scripts/apply-impl-order-assignment.mjs', path.join(tempScriptDir, 'apply-impl-order-assignment.mjs'))

    // Create roadmap directory in test location
    const testRoadmapDir = path.join(TEST_DIR, 'roadmap')
    fs.mkdirSync(testRoadmapDir, {recursive: true})
    fs.copyFileSync(TEST_JSON, path.join(testRoadmapDir, 'implementation-order.json'))

    process.chdir(TEST_DIR)

    try {
        execSync(
            [
                'node',
                'scripts/apply-impl-order-assignment.mjs',
                '--issue-number',
                '999',
                '--title',
                '"High Priority Issue"',
                '--recommended-order',
                '1',
                '--requires-resequence',
                'true',
                '--action',
                'assign'
            ].join(' '),
            {encoding: 'utf8', shell: true}
        )

        // Verify the result
        const updatedData = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'roadmap', 'implementation-order.json'), 'utf8'))

        assert.strictEqual(updatedData.items.length, 4)
        assert.strictEqual(updatedData.items[0].issue, 999)
        assert.strictEqual(updatedData.items[0].order, 1)

        // Verify resequencing
        assert.strictEqual(updatedData.items[1].issue, 1)
        assert.strictEqual(updatedData.items[1].order, 2)
    } finally {
        process.chdir(originalCwd)
        cleanupTest()
    }
})

test('Apply assignment - low priority append', async (t) => {
    setupTest()

    // Change working directory for the script to find our test file
    const originalCwd = process.cwd()
    const tempScriptDir = path.join(TEST_DIR, 'scripts')
    fs.mkdirSync(tempScriptDir, {recursive: true})

    // Copy scripts to test location
    fs.copyFileSync('scripts/apply-impl-order-assignment.mjs', path.join(tempScriptDir, 'apply-impl-order-assignment.mjs'))

    // Create roadmap directory in test location
    const testRoadmapDir = path.join(TEST_DIR, 'roadmap')
    fs.mkdirSync(testRoadmapDir, {recursive: true})
    fs.copyFileSync(TEST_JSON, path.join(testRoadmapDir, 'implementation-order.json'))

    process.chdir(TEST_DIR)

    try {
        execSync(
            [
                'node',
                'scripts/apply-impl-order-assignment.mjs',
                '--issue-number',
                '998',
                '--title',
                '"Low Priority Issue"',
                '--recommended-order',
                '4',
                '--requires-resequence',
                'false',
                '--action',
                'assign'
            ].join(' '),
            {encoding: 'utf8', shell: true}
        )

        // Verify the result
        const updatedData = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'roadmap', 'implementation-order.json'), 'utf8'))

        assert.strictEqual(updatedData.items.length, 4)
        assert.strictEqual(updatedData.items[3].issue, 998)
        assert.strictEqual(updatedData.items[3].order, 4)

        // Verify no resequencing of existing items
        assert.strictEqual(updatedData.items[0].issue, 1)
        assert.strictEqual(updatedData.items[0].order, 1)
    } finally {
        process.chdir(originalCwd)
        cleanupTest()
    }
})

test('Priority analysis with roadmap path dependencies', async (t) => {
    setupTest()

    const descFile = path.join(TEST_DIR, 'desc.txt')
    fs.writeFileSync(descFile, 'Implement core location vertex and exit edge persistence using Gremlin API')

    const output = execFileSync(
        'node',
        [
            'scripts/analyze-issue-priority.mjs',
            '--issue-number',
            '997',
            '--title',
            'Navigation Foundation Work',
            '--description-file',
            descFile,
            '--labels',
            'scope:core,feature',
            '--milestone',
            'M0',
            '--has-existing-order',
            'false',
            '--existing-order',
            '0',
            '--force-resequence',
            'false'
        ],
        {encoding: 'utf8'}
    )

    const result = JSON.parse(output)

    assert.strictEqual(result.issueNumber, 997)
    assert.strictEqual(result.confidence, 'high')
    assert.strictEqual(result.action, 'assign')
    assert(result.priorityScore > 300, 'Should have high priority due to roadmap path')

    // Check that roadmap path analysis was included
    const pathFactors = result.factors.filter((f) => f.includes('Roadmap path'))
    assert(pathFactors.length > 0, 'Should include roadmap path factors')
    assert(result.rationale.includes('Roadmap Path Analysis'), 'Should mention roadmap path in rationale')

    cleanupTest()
})

test('Skip action when issue position is reasonable', async (t) => {
    setupTest()

    const descFile = path.join(TEST_DIR, 'desc.txt')
    fs.writeFileSync(descFile, 'Minor style improvement work') // Low priority content

    const output = execFileSync(
        'node',
        [
            'scripts/analyze-issue-priority.mjs',
            '--issue-number',
            '999',
            '--title',
            'Style Enhancement',
            '--description-file',
            descFile,
            '--labels',
            'scope:devx,enhancement',
            '--milestone',
            '',
            '--has-existing-order',
            'true',
            '--existing-order',
            '12',
            '--force-resequence',
            'false'
        ],
        {encoding: 'utf8'}
    )

    const result = JSON.parse(output)

    // With existing position 12 vs recommended 13, difference is only 1 - should skip
    assert.strictEqual(result.action, 'skip', 'Should skip when existing position is reasonable')

    cleanupTest()
})

console.log('Running implementation order automation tests...')
