#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * test-idempotent-comments.mjs
 *
 * Test idempotent comment behavior (marker-based update logic).
 * This simulates the comment finding and updating logic.
 *
 * Usage:
 *   node scripts/test-idempotent-comments.mjs
 */

/**
 * Simulate finding an existing comment with a marker
 */
function findCommentWithMarker(comments, marker) {
    return comments.find((c) => c.body && c.body.includes(marker)) || null
}

function runTests() {
    console.log('Testing idempotent comment behavior...\n')

    let passed = 0
    let failed = 0

    const marker = '<!-- IMPL_ORDER_AUTOMATION -->'

    // Test 1: Find existing comment with marker
    console.log('Test 1: Find existing comment with marker')
    const comments1 = [
        { id: 1, body: 'Regular comment' },
        { id: 2, body: `${marker}\n## Automation\nOld content` },
        { id: 3, body: 'Another comment' }
    ]
    const existing = findCommentWithMarker(comments1, marker)
    if (existing && existing.id === 2) {
        console.log('  ✓ Found existing comment with marker')
        passed++
    } else {
        console.error('  ✗ Failed to find existing comment')
        failed++
    }

    // Test 2: Return null when no comment has marker
    console.log('\nTest 2: Return null when no comment has marker')
    const comments2 = [
        { id: 1, body: 'Regular comment' },
        { id: 2, body: 'Another comment' }
    ]
    const notFound = findCommentWithMarker(comments2, marker)
    if (notFound === null) {
        console.log('  ✓ Correctly returns null when no marker found')
        passed++
    } else {
        console.error('  ✗ Should return null when no marker found')
        failed++
    }

    // Test 3: Handle empty comments array
    console.log('\nTest 3: Handle empty comments array')
    const comments3 = []
    const emptyResult = findCommentWithMarker(comments3, marker)
    if (emptyResult === null) {
        console.log('  ✓ Handles empty array correctly')
        passed++
    } else {
        console.error('  ✗ Should handle empty array')
        failed++
    }

    // Test 4: Find first match when multiple comments have marker (edge case)
    console.log('\nTest 4: Find first match when multiple comments have marker')
    const comments4 = [
        { id: 1, body: 'Regular comment' },
        { id: 2, body: `${marker}\nFirst match` },
        { id: 3, body: `${marker}\nSecond match` }
    ]
    const firstMatch = findCommentWithMarker(comments4, marker)
    if (firstMatch && firstMatch.id === 2) {
        console.log('  ✓ Finds first match when multiple markers exist')
        passed++
    } else {
        console.error('  ✗ Should find first match')
        failed++
    }

    // Test 5: Marker must be exact match (not partial)
    console.log('\nTest 5: Marker matching is substring-based (by design)')
    const comments5 = [{ id: 1, body: 'Some text <!-- IMPL_ORDER_AUTOMATION --> more text' }]
    const partialMatch = findCommentWithMarker(comments5, marker)
    if (partialMatch && partialMatch.id === 1) {
        console.log('  ✓ Marker found in substring (expected behavior)')
        passed++
    } else {
        console.error('  ✗ Should find marker in substring')
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
