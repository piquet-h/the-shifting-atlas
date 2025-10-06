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
 * Calculate metrics from artifacts
 */
function calculateMetrics(artifacts) {
    const totalProcessed = artifacts.length
    const highConfidence = artifacts.filter((a) => a.confidence === 'high')
    const mediumConfidence = artifacts.filter((a) => a.confidence === 'medium')
    const lowConfidence = artifacts.filter((a) => a.confidence === 'low')
    const applied = artifacts.filter((a) => a.applied === true)
    const overrideCount = countOverrides(artifacts)
    return {
        totalProcessed,
        highConfidence: highConfidence.length,
        mediumConfidence: mediumConfidence.length,
        lowConfidence: lowConfidence.length,
        applied: applied.length,
        overrideCount,
        highConfidencePercent: totalProcessed > 0 ? Math.round((highConfidence.length / totalProcessed) * 100) : 0,
        appliedPercent: totalProcessed > 0 ? Math.round((applied.length / totalProcessed) * 100) : 0,
        overrideRate: applied.length > 0 ? Math.round((overrideCount / applied.length) * 100) : 0
    }
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
        return
    }

    const metrics = calculateMetrics(artifacts)

    console.log('📊 Metrics:')
    console.log(`  - Total issues processed: ${metrics.totalProcessed}`)
    console.log(`  - High confidence: ${metrics.highConfidence} (${metrics.highConfidencePercent}%)`)
    console.log(`  - Medium confidence: ${metrics.mediumConfidence}`)
    console.log(`  - Low confidence: ${metrics.lowConfidence}`)
    console.log(`  - Auto-applied: ${metrics.applied} (${metrics.appliedPercent}%)`)
    console.log(`  - Override rate: ${metrics.overrideCount} / ${metrics.applied} (${metrics.overrideRate}%)`)
    console.log('')

    // Emit metrics.weekly event
    emitOrderingEvent('metrics.weekly', {
        periodDays: DAYS,
        totalProcessed: metrics.totalProcessed,
        counts: {
            high: metrics.highConfidence,
            medium: metrics.mediumConfidence,
            low: metrics.lowConfidence,
            applied: metrics.applied,
            overrides: metrics.overrideCount
        },
        appliedPct: metrics.appliedPercent,
        overrideRate: metrics.overrideRate,
        lowConfidencePct: Math.round((metrics.lowConfidence / metrics.totalProcessed) * 100) || 0
    })

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
