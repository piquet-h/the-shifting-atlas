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
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
 * Load artifacts from the specified time window
 */
function loadArtifacts(daysBack) {
    try {
        const cutoffTime = Date.now() - daysBack * 24 * 60 * 60 * 1000
        const files = readdirSync(ARTIFACTS_DIR)
            .filter((f) => f.endsWith('.json'))
            .map((f) => {
                const path = join(ARTIFACTS_DIR, f)
                return {
                    name: f,
                    path,
                    mtime: statSync(path).mtime
                }
            })
            .filter((f) => f.mtime.getTime() >= cutoffTime)

        return files.map((f) => {
            try {
                const content = JSON.parse(readFileSync(f.path, 'utf-8'))
                return { ...content, _filename: f.name, _mtime: f.mtime }
            } catch (err) {
                console.error(`Warning: Failed to parse ${f.name}: ${err.message}`)
                return null
            }
        }).filter(Boolean)
    } catch (err) {
        console.error(`Warning: Failed to load artifacts: ${err.message}`)
        return []
    }
}

/**
 * Calculate metrics from artifacts
 */
function calculateMetrics(artifacts) {
    const totalProcessed = artifacts.length
    const highConfidence = artifacts.filter((a) => a.confidence === 'high')
    const mediumConfidence = artifacts.filter((a) => a.confidence === 'medium')
    const lowConfidence = artifacts.filter((a) => a.confidence === 'low')
    const applied = artifacts.filter((a) => a.applied === true)

    // Calculate override rate by grouping by issue
    const byIssue = new Map()
    for (const artifact of artifacts) {
        if (!byIssue.has(artifact.issue)) {
            byIssue.set(artifact.issue, [])
        }
        byIssue.get(artifact.issue).push(artifact)
    }

    let overrideCount = 0
    for (const [, issueArtifacts] of byIssue.entries()) {
        issueArtifacts.sort((a, b) => {
            const timeA = new Date(a.metadata?.timestamp || 0)
            const timeB = new Date(b.metadata?.timestamp || 0)
            return timeB - timeA
        })

        for (let i = 0; i < issueArtifacts.length - 1; i++) {
            const current = issueArtifacts[i]
            const previous = issueArtifacts[i + 1]

            if (!previous.applied) continue
            if (current.recommendedOrder !== previous.recommendedOrder) {
                const currentTime = new Date(current.metadata?.timestamp || 0)
                const previousTime = new Date(previous.metadata?.timestamp || 0)
                const hoursDiff = (currentTime - previousTime) / (1000 * 60 * 60)

                if (hoursDiff <= 24 && hoursDiff >= 0) {
                    overrideCount++
                }
            }
        }
    }

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

    const artifacts = loadArtifacts(DAYS)

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
