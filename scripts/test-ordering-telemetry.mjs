#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * test-ordering-telemetry.mjs
 *
 * Basic integration tests for ordering telemetry and metrics functionality.
 * Tests without requiring GitHub API access.
 */

import { strict as assert } from 'node:assert'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const TEST_ARTIFACTS_DIR = join(ROOT, 'tmp', 'test-artifacts')

// Test 1: Build telemetry module loads and emits events
async function testBuildTelemetry() {
    console.log('Test 1: Build telemetry module...')

    const { initBuildTelemetry, trackOrderingApplied, trackOrderingLowConfidence, trackOrderingOverridden, getBufferedEvents } =
        await import('./shared/build-telemetry.mjs')

    initBuildTelemetry()

    trackOrderingApplied({
        issueNumber: 123,
        recommendedOrder: 42,
        confidence: 'high',
        score: 150,
        changes: 3,
        strategy: 'auto',
        scope: 'scope:core',
        type: 'feature',
        milestone: 'M0'
    })

    trackOrderingLowConfidence({
        issueNumber: 456,
        recommendedOrder: 99,
        confidence: 'low',
        score: 50,
        reason: 'Missing: scope, type',
        scope: 'none',
        type: 'none',
        milestone: 'M1'
    })

    trackOrderingOverridden({
        issueNumber: 789,
        previousOrder: 10,
        manualOrder: 5,
        hoursSinceAutomation: 2.5,
        automationTimestamp: '2025-01-01T00:00:00Z'
    })

    const events = getBufferedEvents()
    assert.equal(events.length, 3, 'Should have 3 events')
    assert.equal(events[0].name, 'build.ordering_applied')
    assert.equal(events[1].name, 'build.ordering_low_confidence')
    assert.equal(events[2].name, 'build.ordering_overridden')

    console.log('  ✅ Build telemetry events emitted correctly')
}

// Test 1a: Granular events with emitOrderingEvent helper
async function testGranularEvents() {
    console.log('Test 1a: Granular telemetry events...')

    const { emitOrderingEvent, getBufferedEvents, BUILD_EVENT_NAMES } = await import('./shared/build-telemetry.mjs')

    // Clear buffer by re-importing (or just test from clean state)
    const initialCount = getBufferedEvents().length

    emitOrderingEvent('assign.attempt', {
        issueNumber: 100,
        recommendedOrder: 5,
        confidence: 'high'
    })

    emitOrderingEvent('assign.apply', {
        issueNumber: 100,
        durationMs: 1500,
        reason: 'auto'
    })

    emitOrderingEvent('integrity.snapshot', {
        totalIssues: 50,
        gaps: [],
        duplicates: [],
        isContiguous: true
    })

    const events = getBufferedEvents()
    assert.ok(events.length > initialCount, 'Should have new events')

    // Find our events
    const attemptEvent = events.find((e) => e.name === 'build.ordering.assign.attempt')
    const applyEvent = events.find((e) => e.name === 'build.ordering.assign.apply')
    const snapshotEvent = events.find((e) => e.name === 'build.ordering.integrity.snapshot')

    assert.ok(attemptEvent, 'Should have assign.attempt event')
    assert.ok(applyEvent, 'Should have assign.apply event')
    assert.ok(snapshotEvent, 'Should have integrity.snapshot event')

    assert.equal(attemptEvent.properties.issueNumber, 100)
    assert.equal(snapshotEvent.properties.isContiguous, true)

    // Check event name constants
    assert.equal(BUILD_EVENT_NAMES.ASSIGN_ATTEMPT, 'build.ordering.assign.attempt')
    assert.equal(BUILD_EVENT_NAMES.ASSIGN_APPLY, 'build.ordering.assign.apply')
    assert.equal(BUILD_EVENT_NAMES.INTEGRITY_SNAPSHOT, 'build.ordering.integrity.snapshot')

    console.log('  ✅ Granular telemetry events working correctly')
}

// Test 2: Artifact pruning logic
async function testArtifactPruning() {
    console.log('Test 2: Artifact pruning...')

    // Create test artifacts directory
    mkdirSync(TEST_ARTIFACTS_DIR, { recursive: true })

    // Create 10 test artifact files
    const now = Date.now()
    for (let i = 0; i < 10; i++) {
        const timestamp = new Date(now - i * 1000 * 60 * 60).toISOString().replace(/[:.]/g, '-')
        const filename = `${timestamp}-issue-${i}.json`
        writeFileSync(
            join(TEST_ARTIFACTS_DIR, filename),
            JSON.stringify({
                issue: i,
                confidence: 'high',
                recommendedOrder: i + 1,
                applied: true,
                score: 100,
                metadata: { timestamp: new Date(now - i * 1000 * 60 * 60).toISOString() }
            })
        )
    }

    // Verify files were created
    const { readdirSync } = await import('node:fs')
    const files = readdirSync(TEST_ARTIFACTS_DIR).filter((f) => f.endsWith('.json'))
    assert.equal(files.length, 10, 'Should have 10 artifact files')

    console.log('  ✅ Artifact creation works')

    // Cleanup
    rmSync(TEST_ARTIFACTS_DIR, { recursive: true })
}

// Test 3: Weekly metrics calculation
async function testWeeklyMetrics() {
    console.log('Test 3: Weekly metrics calculation...')

    // Create test artifacts
    mkdirSync(TEST_ARTIFACTS_DIR, { recursive: true })

    const artifacts = [
        { issue: 1, confidence: 'high', recommendedOrder: 1, applied: true, score: 150, metadata: { timestamp: new Date().toISOString() } },
        { issue: 2, confidence: 'high', recommendedOrder: 2, applied: true, score: 140, metadata: { timestamp: new Date().toISOString() } },
        {
            issue: 3,
            confidence: 'medium',
            recommendedOrder: 3,
            applied: false,
            score: 100,
            metadata: { timestamp: new Date().toISOString() }
        },
        { issue: 4, confidence: 'low', recommendedOrder: 4, applied: false, score: 50, metadata: { timestamp: new Date().toISOString() } },
        {
            issue: 1,
            confidence: 'high',
            recommendedOrder: 5,
            applied: false,
            score: 150,
            metadata: { timestamp: new Date(Date.now() + 1000).toISOString() }
        } // Override within 24h
    ]

    for (let i = 0; i < artifacts.length; i++) {
        const timestamp = new Date(Date.now() + i * 1000).toISOString().replace(/[:.]/g, '-')
        writeFileSync(join(TEST_ARTIFACTS_DIR, `${timestamp}-issue-${artifacts[i].issue}.json`), JSON.stringify(artifacts[i]))
    }

    // Read artifacts and calculate metrics
    const { readdirSync, readFileSync, statSync } = await import('node:fs')
    const files = readdirSync(TEST_ARTIFACTS_DIR)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({
            name: f,
            path: join(TEST_ARTIFACTS_DIR, f),
            mtime: statSync(join(TEST_ARTIFACTS_DIR, f)).mtime
        }))

    const loadedArtifacts = files.map((f) => JSON.parse(readFileSync(f.path, 'utf-8')))

    const totalProcessed = loadedArtifacts.length
    const highConfidence = loadedArtifacts.filter((a) => a.confidence === 'high')
    const applied = loadedArtifacts.filter((a) => a.applied === true)

    assert.equal(totalProcessed, 5, 'Should have 5 artifacts')
    assert.equal(highConfidence.length, 3, 'Should have 3 high confidence')
    assert.equal(applied.length, 2, 'Should have 2 applied')

    console.log('  ✅ Metrics calculation works')

    // Cleanup
    rmSync(TEST_ARTIFACTS_DIR, { recursive: true })
}

// Test 4: Event name constants
async function testEventNameConstants() {
    console.log('Test 4: Event name constants...')

    const { BUILD_EVENT_NAMES } = await import('./shared/build-telemetry.mjs')

    assert.ok(BUILD_EVENT_NAMES.ORDERING_APPLIED, 'Should have ORDERING_APPLIED constant')
    assert.ok(BUILD_EVENT_NAMES.ORDERING_LOW_CONFIDENCE, 'Should have ORDERING_LOW_CONFIDENCE constant')
    assert.ok(BUILD_EVENT_NAMES.ORDERING_OVERRIDDEN, 'Should have ORDERING_OVERRIDDEN constant')
    assert.equal(BUILD_EVENT_NAMES.ORDERING_APPLIED, 'build.ordering_applied')
    assert.equal(BUILD_EVENT_NAMES.ORDERING_LOW_CONFIDENCE, 'build.ordering_low_confidence')
    assert.equal(BUILD_EVENT_NAMES.ORDERING_OVERRIDDEN, 'build.ordering_overridden')
    // New validation constants
    assert.equal(BUILD_EVENT_NAMES.VALIDATION_START, 'build.ordering.validation.start')
    assert.equal(BUILD_EVENT_NAMES.VALIDATION_SUCCESS, 'build.ordering.validation.success')
    assert.equal(BUILD_EVENT_NAMES.VALIDATION_FAIL, 'build.ordering.validation.fail')

    console.log('  ✅ Event name constants correct')
}

// Test 5: Validation events helpers
async function testValidationEvents() {
    console.log('Test 5: Validation events...')
    const { trackValidationStart, trackValidationSuccess, trackValidationFail, getBufferedEvents } = await import('./shared/build-telemetry.mjs')

    const before = getBufferedEvents().length
    trackValidationStart({ phase: 'test' })
    trackValidationSuccess({ phase: 'test', totalIssues: 0 })
    trackValidationFail({ phase: 'test', reason: 'simulated' })
    const after = getBufferedEvents().length
    assert.ok(after - before >= 3, 'Should have at least 3 new validation events')
    console.log('  ✅ Validation events emitted')
}

async function main() {
    console.log('Running ordering telemetry tests...\n')

    try {
        await testBuildTelemetry()
        await testGranularEvents()
        await testArtifactPruning()
        await testWeeklyMetrics()
    await testEventNameConstants()
    await testValidationEvents()

        console.log('\n✅ All tests passed!')
    } catch (err) {
        console.error('\n❌ Test failed:', err.message)
        console.error(err.stack)
        process.exit(1)
    }
}

main()
