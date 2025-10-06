#!/usr/bin/env node
/* eslint-env node */
// DEPRECATED: test-impl-order-automation.mjs retired.
console.error('test-impl-order-automation.mjs deprecated – no tests executed.')
process.exit(0)
import fs from 'node:fs'

function setupTest() {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true })
    }
    fs.mkdirSync(TEST_DIR, { recursive: true })

    const testData = {
        project: 3,
        fieldId: 'PVTF_test',
        generated: '2025-01-01T00:00:00.000Z',
        items: [
            { issue: 1, order: 1, title: 'First Issue' },
            { issue: 2, order: 2, title: 'Second Issue' },
            { issue: 3, order: 3, title: 'Third Issue' }
        ]
    }

    fs.writeFileSync(TEST_JSON, JSON.stringify(testData, null, 2))
}

function cleanupTest() {
    if (fs.existsSync(TEST_DIR)) {
        fs.rmSync(TEST_DIR, { recursive: true })
    }
}
