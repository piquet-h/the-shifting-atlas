#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * weekly-ordering-metrics.mjs
 *
 * Generates weekly metrics summary for implementation order automation.
 * Reads ordering artifacts and computes:
 * - Total issues processed
 * - High confidence auto-applied percentage
 * - Medium/low confidence requiring manual review
 * - Override rate (manual changes within 24h)
 * - Contiguous ordering integrity status
 *
 * Schema version 2 enrichments:
 * - Validation approximation: runs/success/fail counts derived from artifact metadata
 * - Integrity snapshot: contiguous/gaps/duplicates computed from artifact ordering values
 * - Nested objects (validation, integrity) added to metrics.weekly event payload
 * - Backwards-compatible legacy fields preserved (counts, appliedPct, overrideRate, lowConfidencePct)
 *
 * Approximation rationale:
 * - Validation metrics approximated from artifact applied/confidence (real validation lifecycle events in future patch)
 * - Integrity snapshot computed from artifact recommendedOrder (last artifact's order used as reference)
 * - Gap detection excludes duplicates from gap list per check-ordering-integrity.mjs pattern
 *
 * Usage:
 *   node scripts/weekly-ordering-metrics.mjs
 *   node scripts/weekly-ordering-metrics.mjs --days 7
 */

import { parseArgs } from 'node:util'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emitOrderingEvent } from './shared/build-telemetry.mjs'
import { loadArtifacts, countOverrides } from './shared/ordering-artifacts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ARTIFACTS_DIR = join(ROOT, 'artifacts', 'ordering')

const { values } = parseArgs({
    options: {
        days: { type: 'string', default: '7' }
    }
})

const DAYS = Number(values.days)

/**
 * Compute integrity snapshot approximation from artifacts.
 * Uses artifact recommendedOrder values to detect gaps and duplicates.
 *
 * @param {Array<object>} artifacts - Artifact objects with recommendedOrder property
 * @returns {object} Integrity snapshot with contiguous, gaps, duplicates, failureCount, gapsSample, last
 */
export function computeIntegritySnapshot(artifacts) {
    if (artifacts.length === 0) {
        return {
            contiguous: true,
            gaps: [],
            duplicates: [],
            failureCount: 0,
            gapsSample: [],
            last: null
        }
    }

    // Extract order values and find the highest
    const orderValues = artifacts
        .map((a) => a.recommendedOrder)
        .filter((order) => typeof order === 'number')
        .sort((a, b) => a - b)

    const last = orderValues.length > 0 ? Math.max(...orderValues) : null

    // Detect duplicates
    const uniqueOrders = new Set(orderValues)
    const duplicates = []
    if (uniqueOrders.size !== orderValues.length) {
        const dupValues = orderValues.filter((val, idx) => orderValues.indexOf(val) !== idx)
        duplicates.push(...new Set(dupValues))
    }

    // Detect gaps (should be contiguous 1..N)
    const gaps = []
    if (orderValues.length > 0) {
        const expectedSequence = Array.from({ length: last }, (_, i) => i + 1)
        for (const expected of expectedSequence) {
            if (!orderValues.includes(expected)) {
                // Exclude duplicates from gap list
                if (!duplicates.includes(expected)) {
                    gaps.push(expected)
                }
            }
        }
    }

    const contiguous = gaps.length === 0 && duplicates.length === 0
    const failureCount = gaps.length + duplicates.length
    const gapsSample = gaps.slice(0, 3) // First 3 gaps for quick diagnosis

    return {
        contiguous,
        gaps,
        duplicates,
        failureCount,
        gapsSample,
        last
    }
}

/**
 * Calculate metrics from artifacts
 * @param {Array<object>} artifacts - Artifact objects
 * @returns {object} Metrics object
 */
export function calculateMetrics(artifacts) {
    const totalProcessed = artifacts.length
    const highConfidence = artifacts.filter((a) => a.confidence === 'high')
    const mediumConfidence = artifacts.filter((a) => a.confidence === 'medium')
    const lowConfidence = artifacts.filter((a) => a.confidence === 'low')
    const applied = artifacts.filter((a) => a.applied === true)
    const overrideCount = countOverrides(artifacts)

    // Validation approximation: runs=totalProcessed, success=applied, fail=totalProcessed-applied
    const validationRuns = totalProcessed
    const validationSuccess = applied.length
    const validationFail = totalProcessed - applied.length

    return {
        totalProcessed,
        highConfidence: highConfidence.length,
        mediumConfidence: mediumConfidence.length,
        lowConfidence: lowConfidence.length,
        applied: applied.length,
        overrideCount,
        highConfidencePercent: totalProcessed > 0 ? Math.round((highConfidence.length / totalProcessed) * 100) : 0,
        appliedPercent: totalProcessed > 0 ? Math.round((applied.length / totalProcessed) * 100) : 0,
        overrideRate: applied.length > 0 ? Math.round((overrideCount / applied.length) * 100) : 0,
        // Validation approximation
        validationRuns,
        validationSuccess,
        validationFail
    }
}

/**
 * Generate weekly metrics with enriched validation and integrity data.
 * @param {Array<object>} artifacts - Artifact objects
 * @param {number} periodDays - Number of days in the period
 * @returns {object} Complete metrics payload with schemaVersion=2
 */
export function generateWeeklyMetrics(artifacts, periodDays) {
    const metrics = calculateMetrics(artifacts)
    const integrity = computeIntegritySnapshot(artifacts)

    return {
        schemaVersion: 2,
        periodDays,
        totalProcessed: metrics.totalProcessed,
        // Legacy fields (backwards compatible)
        counts: {
            high: metrics.highConfidence,
            medium: metrics.mediumConfidence,
            low: metrics.lowConfidence,
            applied: metrics.applied,
            overrides: metrics.overrideCount
        },
        appliedPct: metrics.appliedPercent,
        overrideRate: metrics.overrideRate,
        lowConfidencePct: Math.round((metrics.lowConfidence / metrics.totalProcessed) * 100) || 0,
        // New enriched fields (schemaVersion 2)
        validation: {
            runs: metrics.validationRuns,
            success: metrics.validationSuccess,
            fail: metrics.validationFail
        },
        integrity: {
            contiguous: integrity.contiguous,
            gaps: integrity.gaps,
            duplicates: integrity.duplicates,
            failureCount: integrity.failureCount,
            gapsSample: integrity.gapsSample,
            last: integrity.last
        }
    }
}

/**
 * Emit weekly metrics event with schemaVersion=2 payload.
 * @param {object} metricsPayload - Complete metrics payload from generateWeeklyMetrics
 */
export function emitWeeklyMetricsEvent(metricsPayload) {
    emitOrderingEvent('metrics.weekly', metricsPayload)
}

async function main() {
    console.log('Weekly Implementation Order Metrics Summary')
    console.log('===========================================')
    console.log(`Period: Last ${DAYS} days`)
    console.log('')

    const artifacts = loadArtifacts(ARTIFACTS_DIR, { daysBack: DAYS })

    if (artifacts.length === 0) {
        console.log('ℹ️  No artifacts found in the specified time window.')
        console.log('')
        console.log('To generate artifacts, run the implementation order automation:')
        console.log('  npm run assign:impl-order -- --issue <number>')
        // Emit event with zero artifacts (validation runs=0, integrity.last=null)
        const zeroMetrics = generateWeeklyMetrics([], DAYS)
        emitWeeklyMetricsEvent(zeroMetrics)
        return
    }

    const metrics = calculateMetrics(artifacts)
    const integrity = computeIntegritySnapshot(artifacts)

    console.log('📊 Metrics:')
    console.log(`  - Total issues processed: ${metrics.totalProcessed}`)
    console.log(`  - High confidence: ${metrics.highConfidence} (${metrics.highConfidencePercent}%)`)
    console.log(`  - Medium confidence: ${metrics.mediumConfidence}`)
    console.log(`  - Low confidence: ${metrics.lowConfidence}`)
    console.log(`  - Auto-applied: ${metrics.applied} (${metrics.appliedPercent}%)`)
    console.log(`  - Override rate: ${metrics.overrideCount} / ${metrics.applied} (${metrics.overrideRate}%)`)
    console.log('')

    // Emit metrics.weekly event with schemaVersion=2
    const weeklyMetrics = generateWeeklyMetrics(artifacts, DAYS)
    emitWeeklyMetricsEvent(weeklyMetrics)

    // Check integrity by running the integrity checker
    console.log('🔍 Contiguous Ordering Integrity:')
    console.log('  Run: npm run check:ordering-integrity')
    console.log('')

    // Recommendations
    if (metrics.highConfidencePercent < 70) {
        console.log('⚠️  Recommendations:')
        console.log('  - High confidence rate is below 70%')
        console.log('  - Ensure issues have scope label + milestone + type for better automation')
    }

    if (metrics.overrideRate > 20) {
        console.log('⚠️  High override rate detected:')
        console.log('  - Review automation heuristics (may need tuning)')
        console.log('  - Check for systematic disagreements with scoring')
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
