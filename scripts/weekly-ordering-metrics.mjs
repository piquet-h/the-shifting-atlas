#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * weekly-ordering-metrics.mjs
 *
 * Stage 1 (schemaVersion=1) provided basic counts & rates.
 * This enrichment patch (schemaVersion=2) adds:
 *  - validation: { runs, success, fail }
 *  - integrity: { last: { contiguous, gaps, duplicates, failureCount, gapsSample? } }
 *  - schemaVersion field for forward compatibility
 *
 * Validation Approximation (First Implementation):
 *  We do not yet persist explicit validation lifecycle event history. For now we approximate a
 *  single validation run if we have >=1 artifact in the window. Success is defined as the
 *  inferred ordering (latest recommendedOrder per issue) having no gaps OR duplicate order values.
 *  Future refinement (tracked in #194 follow-up acceptance) will parse persisted validation events.
 *
 * Integrity Approximation:
 *  Build a set of latest recommendedOrder per issue (dedupe by issue, keep most recent artifact by mtime).
 *  Sort orders and identify:
 *    - gaps: non-sequential breaks (difference > 1)
 *    - duplicates: (totalArtifactsForDistinctIssues having same order) via counting collisions
 *  failureCount = gaps.length + duplicatesCount.
 *
 * Complexity: O(n log n) due to sort; n <= 200 (post-prune) is trivial.
 *
 * Usage:
 *   node scripts/weekly-ordering-metrics.mjs
 *   node scripts/weekly-ordering-metrics.mjs --days 7
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { emitOrderingEvent } from './shared/build-telemetry.mjs'
import { countOverrides, loadArtifacts } from './shared/ordering-artifacts.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ARTIFACTS_DIR = join(ROOT, 'artifacts', 'ordering')

const { values } = parseArgs({
    options: {
        days: { type: 'string', default: '7' }
    }
})

const DAYS = Number(values.days)

// ---------------- Integrity & Validation Helpers (schemaVersion 2) ----------------

/**
 * Build integrity snapshot from artifacts.
 * @param {Array<object>} artifacts
 */
export function computeIntegritySnapshot(artifacts) {
    if (!artifacts.length) {
        return null
    }
    // Keep latest artifact per issue
    const latestByIssue = new Map()
    for (const a of artifacts) {
        if (!latestByIssue.has(a.issue) || (a._mtime && latestByIssue.get(a.issue)._mtime < a._mtime)) {
            latestByIssue.set(a.issue, a)
        }
    }
    const orders = []
    for (const art of latestByIssue.values()) {
        if (typeof art.recommendedOrder === 'number') orders.push(art.recommendedOrder)
    }
    if (orders.length === 0) return null
    orders.sort((a, b) => a - b)
    const gaps = []
    for (let i = 1; i < orders.length; i++) {
        const expected = orders[i - 1] + 1
        // If it's a duplicate (same value) treat separately; do not mark as a gap.
        if (orders[i] === orders[i - 1]) continue
        if (orders[i] !== expected) {
            gaps.push({ from: orders[i - 1], to: orders[i] })
        }
    }
    // Duplicate detection
    let duplicatesCount = 0
    for (let i = 1; i < orders.length; i++) {
        if (orders[i] === orders[i - 1]) duplicatesCount++
    }
    const contiguous = gaps.length === 0 && duplicatesCount === 0
    return {
        contiguous,
        gaps: gaps.length,
        duplicates: duplicatesCount,
        failureCount: gaps.length + duplicatesCount,
        gapsSample: gaps.slice(0, 5)
    }
}

/**
 * Calculate base metrics (legacy + new schemaVersion 2 additions)
 */
export function calculateMetrics(artifacts) {
    const totalProcessed = artifacts.length
    const highConfidence = artifacts.filter((a) => a.confidence === 'high')
    const mediumConfidence = artifacts.filter((a) => a.confidence === 'medium')
    const lowConfidence = artifacts.filter((a) => a.confidence === 'low')
    const applied = artifacts.filter((a) => a.applied === true)
    const overrideCount = countOverrides(artifacts)
    const integritySnapshot = computeIntegritySnapshot(artifacts)
    // Validation approximation (see header notes)
    const validationRuns = artifacts.length ? 1 : 0
    const validationSuccess = integritySnapshot ? (integritySnapshot.contiguous ? 1 : 0) : 0
    const validationFail = validationRuns - validationSuccess
    return {
        schemaVersion: 2,
        totalProcessed,
        counts: {
            high: highConfidence.length,
            medium: mediumConfidence.length,
            low: lowConfidence.length,
            applied: applied.length,
            overrides: overrideCount
        },
        appliedPercent: totalProcessed > 0 ? Math.round((applied.length / totalProcessed) * 100) : 0,
        highConfidencePercent: totalProcessed > 0 ? Math.round((highConfidence.length / totalProcessed) * 100) : 0,
        overrideRate: applied.length > 0 ? Math.round((overrideCount / applied.length) * 100) : 0,
        lowConfidencePct: totalProcessed > 0 ? Math.round((lowConfidence.length / totalProcessed) * 100) : 0,
        validation: {
            runs: validationRuns,
            success: validationSuccess,
            fail: validationFail
        },
        integrity: {
            last: integritySnapshot
                ? {
                      contiguous: integritySnapshot.contiguous,
                      gaps: integritySnapshot.gaps,
                      duplicates: integritySnapshot.duplicates,
                      failureCount: integritySnapshot.failureCount,
                      // only include gapsSample if there are gaps
                      ...(integritySnapshot.gaps ? { gapsSample: integritySnapshot.gapsSample } : {})
                  }
                : null
        }
    }
}

/**
 * Emit metrics.weekly event using enriched metrics object (schemaVersion 2).
 */
export function emitWeeklyMetricsEvent(periodDays, metrics) {
    emitOrderingEvent('metrics.weekly', {
        schemaVersion: metrics.schemaVersion,
        periodDays,
        totalProcessed: metrics.totalProcessed,
        counts: metrics.counts,
        appliedPct: metrics.appliedPercent,
        overrideRate: metrics.overrideRate,
        lowConfidencePct: metrics.lowConfidencePct,
        validation: metrics.validation,
        integrity: metrics.integrity
    })
}

export async function generateWeeklyMetrics(periodDays = DAYS, artifactsDir = ARTIFACTS_DIR) {
    const artifacts = loadArtifacts(artifactsDir, { daysBack: periodDays })
    const metrics = calculateMetrics(artifacts)
    return { artifacts, metrics }
}

async function main() {
    console.log('Weekly Implementation Order Metrics Summary')
    console.log('===========================================')
    console.log(`Period: Last ${DAYS} days`)
    console.log('')

    const { artifacts, metrics } = await generateWeeklyMetrics(DAYS)

    if (!artifacts.length) {
        console.log('ℹ️  No artifacts found in the specified time window.')
        console.log('')
        console.log('To generate artifacts, run the implementation order automation:')
        console.log('  npm run assign:impl-order -- --issue <number>')
        // Emit empty metrics event (runs=0)
        emitWeeklyMetricsEvent(DAYS, metrics)
        return
    }

    console.log('📊 Metrics:')
    console.log(`  - Total issues processed: ${metrics.totalProcessed}`)
    console.log(`  - High confidence: ${metrics.counts.high} (${metrics.highConfidencePercent}%)`)
    console.log(`  - Medium confidence: ${metrics.counts.medium}`)
    console.log(`  - Low confidence: ${metrics.counts.low}`)
    console.log(`  - Auto-applied: ${metrics.counts.applied} (${metrics.appliedPercent}%)`)
    console.log(`  - Override rate: ${metrics.counts.overrides} / ${metrics.counts.applied} (${metrics.overrideRate}%)`)
    if (metrics.validation.runs) {
        console.log(
            `  - Validation: runs=${metrics.validation.runs}, success=${metrics.validation.success}, fail=${metrics.validation.fail}`
        )
    }
    if (metrics.integrity.last) {
        console.log(
            `  - Integrity: contiguous=${metrics.integrity.last.contiguous}, gaps=${metrics.integrity.last.gaps}, duplicates=${metrics.integrity.last.duplicates}`
        )
    }
    console.log('')

    emitWeeklyMetricsEvent(DAYS, metrics)

    // Recommendations (unchanged thresholds)
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

// Only execute main when invoked directly (enables importing for tests)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    main().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}
