#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * test-ordering-hardening.mjs
 *
 * Test script to validate ordering automation hardening features.
 * Tests: artifact generation, hash calculation, integrity checking.
 *
 * Usage:
 *   node scripts/test-ordering-hardening.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TEST_ARTIFACT_DIR = join(ROOT, '.test-artifacts-ordering')

// Test data
const testPlan = [
    { issue: 1, score: 100, desiredOrder: 1 },
    { issue: 2, score: 90, desiredOrder: 2 },
    { issue: 3, score: 80, desiredOrder: 3 }
]

const testPlanWithGap = [
    { issue: 1, score: 100, desiredOrder: 1 },
    { issue: 2, score: 90, desiredOrder: 3 }, // Gap at 2
    { issue: 3, score: 80, desiredOrder: 4 }
]

const testPlanWithDuplicate = [
    { issue: 1, score: 100, desiredOrder: 1 },
    { issue: 2, score: 90, desiredOrder: 2 },
    { issue: 3, score: 80, desiredOrder: 2 } // Duplicate 2
]

/**
 * Calculate SHA256 hash (same as in assign-impl-order.mjs)
 */
function calculatePlanHash(plan) {
    const sortedPlan = [...plan].sort((a, b) => a.desiredOrder - b.desiredOrder)
    const planString = JSON.stringify(sortedPlan, null, 0)
    return createHash('sha256').update(planString).digest('hex')
}

/**
 * Check ordering integrity (same logic as in assign-impl-order.mjs)
 */
function checkOrderingIntegrity(plan) {
    const errors = []
    const orders = plan.map((p) => p.desiredOrder).sort((a, b) => a - b)

    // Check for duplicates
    const duplicates = new Set()
    const seen = new Set()
    for (const order of orders) {
        if (seen.has(order)) {
            duplicates.add(order)
        }
        seen.add(order)
    }
    if (duplicates.size > 0) {
        errors.push(`Duplicate order values: ${[...duplicates].join(', ')}`)
    }

    // Check for gaps
    if (orders.length > 0) {
        const expected = Array.from({ length: orders.length }, (_, i) => i + 1)
        const missing = expected.filter((e) => !orders.includes(e))
        if (missing.length > 0) {
            errors.push(`Missing order values (gaps): ${missing.join(', ')}`)
        }
        if (orders[0] !== 1) {
            errors.push(`Ordering should start at 1, but starts at ${orders[0]}`)
        }
        if (orders[orders.length - 1] !== orders.length) {
            errors.push(`Ordering should end at ${orders.length}, but ends at ${orders[orders.length - 1]}`)
        }
    }

    return {
        valid: errors.length === 0,
        errors
    }
}

function runTests() {
    console.log('Testing ordering automation hardening features...\n')

    let passed = 0
    let failed = 0

    // Test 1: Hash calculation reproducibility
    console.log('Test 1: Hash calculation reproducibility')
    const hash1 = calculatePlanHash(testPlan)
    const hash2 = calculatePlanHash(testPlan)
    if (hash1 === hash2) {
        console.log('  ✓ Hashes are identical for same plan')
        passed++
    } else {
        console.error('  ✗ Hashes differ for same plan')
        failed++
    }

    // Test 2: Hash is stable regardless of input order (sorted before hashing)
    console.log('\nTest 2: Hash is stable regardless of input order')
    const hash3 = calculatePlanHash([...testPlan].reverse())
    if (hash1 === hash3) {
        console.log('  ✓ Hash is stable (plan sorted before hashing)')
        passed++
    } else {
        console.error('  ✗ Hash should be stable regardless of input order')
        failed++
    }

    // Test 3: Valid plan passes integrity check
    console.log('\nTest 3: Valid plan passes integrity check')
    const integrity1 = checkOrderingIntegrity(testPlan)
    if (integrity1.valid && integrity1.errors.length === 0) {
        console.log('  ✓ Valid plan passes integrity check')
        passed++
    } else {
        console.error('  ✗ Valid plan failed integrity check:', integrity1.errors)
        failed++
    }

    // Test 4: Plan with gap fails integrity check
    console.log('\nTest 4: Plan with gap fails integrity check')
    const integrity2 = checkOrderingIntegrity(testPlanWithGap)
    if (!integrity2.valid && integrity2.errors.some((e) => e.includes('gap'))) {
        console.log('  ✓ Plan with gap fails integrity check')
        console.log('    Errors:', integrity2.errors.join('; '))
        passed++
    } else {
        console.error('  ✗ Plan with gap should fail integrity check')
        failed++
    }

    // Test 5: Plan with duplicate fails integrity check
    console.log('\nTest 5: Plan with duplicate fails integrity check')
    const integrity3 = checkOrderingIntegrity(testPlanWithDuplicate)
    if (!integrity3.valid && integrity3.errors.some((e) => e.includes('Duplicate'))) {
        console.log('  ✓ Plan with duplicate fails integrity check')
        console.log('    Errors:', integrity3.errors.join('; '))
        passed++
    } else {
        console.error('  ✗ Plan with duplicate should fail integrity check')
        failed++
    }

    // Test 6: Artifact directory creation and filename pattern
    console.log('\nTest 6: Artifact directory and filename pattern')
    try {
        rmSync(TEST_ARTIFACT_DIR, { recursive: true, force: true })
        mkdirSync(TEST_ARTIFACT_DIR, { recursive: true })

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `decision-123-${timestamp}.json`
        const filepath = join(TEST_ARTIFACT_DIR, filename)

        const testArtifact = {
            issue: 123,
            plan: testPlan,
            planHash: calculatePlanHash(testPlan),
            metadata: { timestamp: new Date().toISOString() }
        }

        writeFileSync(filepath, JSON.stringify(testArtifact, null, 2))

        const saved = JSON.parse(readFileSync(filepath, 'utf8'))
        if (saved.planHash === testArtifact.planHash && filename.startsWith('decision-123-')) {
            console.log('  ✓ Artifact saved with correct filename pattern')
            passed++
        } else {
            console.error('  ✗ Artifact not saved correctly')
            failed++
        }

        rmSync(TEST_ARTIFACT_DIR, { recursive: true, force: true })
    } catch (err) {
        console.error('  ✗ Artifact test failed:', err.message)
        failed++
    }

    // Summary
    console.log(`\n${'='.repeat(50)}`)
    console.log(`Test Results: ${passed} passed, ${failed} failed`)
    console.log('='.repeat(50))

    if (failed > 0) {
        process.exit(1)
    }
}

runTests()
