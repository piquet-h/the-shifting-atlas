#!/usr/bin/env node
/**
 * AI Cost Telemetry: Simulation Harness
 *
 * Generates synthetic AI cost telemetry events for pre-integration validation.
 * Populates AI.Cost.Estimated and AI.Cost.WindowSummary events locally without a real AI model.
 *
 * ## Usage
 *
 * ```bash
 * # Basic usage with defaults (5 calls per prompt, completion ratio 0.5)
 * node scripts/simulate-ai-cost.mjs
 *
 * # Custom iteration count and completion ratio
 * SIM_CALLS_PER_TEMPLATE=10 COMPLETION_RATIO=1.5 node scripts/simulate-ai-cost.mjs
 *
 * # No completion text (completion ratio 0)
 * COMPLETION_RATIO=0 node scripts/simulate-ai-cost.mjs
 * ```
 *
 * ## Environment Variables
 *
 * - `SIM_CALLS_PER_TEMPLATE` (default: 5) - Number of iterations per prompt template
 * - `COMPLETION_RATIO` (default: 0.5) - Completion length as ratio of prompt length
 *   - 0 = no completion
 *   - 1 = completion same length as prompt
 *   - 2 = completion twice as long as prompt
 *
 * ## Output
 *
 * Console summary includes:
 * - Total AI calls made
 * - Aggregate cost in microdollars
 * - Top 3 token buckets by frequency
 * - Window summaries emitted (if any)
 *
 * ## Exit Codes
 *
 * - 0: Success
 * - 1: No prompts found or configuration error
 *
 * ## Edge Cases
 *
 * - Duplicate prompts: Counted normally (simulates repeated operations)
 * - Extremely long prompts: Token estimation handles via charDiv4 estimator
 * - Empty prompts: Skipped with warning
 *
 * ## Dependencies
 *
 * Requires @piquet-h/shared package with:
 * - prepareAICostTelemetry() (issue #302)
 * - recordEstimatedAICost() (issue #303)
 * - forceFlushAICostSummary() (issue #304)
 *
 * @module simulate-ai-cost
 */

import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Load shared package functions
 * Using dynamic import to handle potential build/dist path resolution
 */
async function loadSharedPackage() {
    try {
        // Try to import from built shared package
        const sharedPath = resolve(__dirname, '../shared/dist/index.js')
        const shared = await import(sharedPath)
        return shared
    } catch (error) {
        console.error('❌ Error: Could not load @piquet-h/shared package.')
        console.error('   Make sure to build the shared package first:')
        console.error('   cd shared && npm run build')
        throw error
    }
}

/**
 * Load prompt templates from the prompt registry (JSON files).
 *
 * Note:
 * - `shared/src/prompts/worldTemplates.ts` is deprecated.
 * - This harness should exercise the same prompts that production uses.
 */
async function loadPrompts() {
    const templatesDir = resolve(__dirname, '../shared/src/prompts/templates')
    const templateFiles = ['location-generator.json', 'npc-dialogue-generator.json', 'quest-generator.json']

    const prompts = []
    for (const file of templateFiles) {
        const filePath = resolve(templatesDir, file)
        try {
            const raw = await readFile(filePath, 'utf8')
            const parsed = JSON.parse(raw)
            const template = parsed?.template
            if (typeof template !== 'string' || template.trim().length === 0) {
                console.warn(`⚠️  Warning: Template file missing 'template' string: ${filePath}`)
                continue
            }
            prompts.push(template)
        } catch (error) {
            console.error(`❌ Error: Could not load prompt template: ${filePath}`)
            throw error
        }
    }

    return prompts
}

/**
 * Parse environment configuration
 */
function parseConfig() {
    const callsPerTemplate = parseInt(process.env.SIM_CALLS_PER_TEMPLATE || '5', 10)
    const completionRatio = parseFloat(process.env.COMPLETION_RATIO || '0.5')

    // Validate
    if (isNaN(callsPerTemplate) || callsPerTemplate < 1) {
        console.error('❌ Error: SIM_CALLS_PER_TEMPLATE must be a positive integer')
        process.exit(1)
    }

    if (isNaN(completionRatio) || completionRatio < 0) {
        console.error('❌ Error: COMPLETION_RATIO must be a non-negative number')
        process.exit(1)
    }

    return { callsPerTemplate, completionRatio }
}

/**
 * Base text for synthetic completion generation.
 * Repetitive but predictable for testing purposes.
 */
const COMPLETION_BASE_TEXT =
    'The ancient corridors stretch endlessly. Shadows dance on weathered stone walls. Echoes of forgotten battles linger. '

/**
 * Generate synthetic completion text based on prompt and ratio
 */
function generateCompletion(promptText, ratio) {
    if (ratio === 0) {
        return ''
    }

    // Generate completion of specified length ratio
    const targetLength = Math.round(promptText.length * ratio)

    // Create synthetic completion text by repeating base text
    let completion = ''

    while (completion.length < targetLength) {
        completion += COMPLETION_BASE_TEXT
    }

    return completion.substring(0, targetLength)
}

/**
 * Track token bucket frequencies
 */
class BucketTracker {
    constructor () {
        this.buckets = new Map()
    }

    record(bucket) {
        this.buckets.set(bucket, (this.buckets.get(bucket) || 0) + 1)
    }

    getTop3() {
        return Array.from(this.buckets.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
    }
}

/**
 * Main simulation function
 */
async function main() {
    console.log('🔬 AI Cost Telemetry Simulation Harness\n')

    // Load configuration
    const config = parseConfig()
    console.log(`Configuration:`)
    console.log(`  Calls per template: ${config.callsPerTemplate}`)
    console.log(`  Completion ratio: ${config.completionRatio}`)
    console.log()

    // Load shared package
    console.log('Loading shared package...')
    const shared = await loadSharedPackage()
    const { prepareAICostTelemetry, recordEstimatedAICost, forceFlushAICostSummary } = shared

    // Load prompts
    console.log('Loading prompt templates...')
    const prompts = await loadPrompts()

    if (!prompts || prompts.length === 0) {
        console.error('❌ Error: No prompts found')
        process.exit(1)
    }

    console.log(`Found ${prompts.length} prompt templates\n`)

    // Initialize tracking
    let totalCalls = 0
    let totalCostMicros = 0
    const promptBucketTracker = new BucketTracker()
    const completionBucketTracker = new BucketTracker()
    const windowSummaries = []

    // Simulate AI calls
    console.log('Simulating AI cost events...')

    for (const promptText of prompts) {
        if (!promptText || promptText.trim().length === 0) {
            console.warn('⚠️  Warning: Skipping empty prompt')
            continue
        }

        for (let i = 0; i < config.callsPerTemplate; i++) {
            // Generate completion
            const completionText = generateCompletion(promptText, config.completionRatio)

            // Prepare telemetry payload
            const payload = prepareAICostTelemetry({
                modelId: 'gpt-4o-mini',
                promptText,
                completionText
            })

            // Record cost and track any emitted summaries
            const summaries = recordEstimatedAICost({
                modelId: payload.modelId,
                promptTokens: payload.promptTokens,
                completionTokens: payload.completionTokens,
                estimatedCostMicros: payload.estimatedCostMicros
            })

            windowSummaries.push(...summaries)

            // Update aggregate stats
            totalCalls++
            totalCostMicros += payload.estimatedCostMicros
            promptBucketTracker.record(payload.promptBucket)
            completionBucketTracker.record(payload.completionBucket)

            // Log individual event (verbose)
            if (process.env.VERBOSE === 'true') {
                console.log(
                    `  Event ${totalCalls}: ${payload.promptTokens}p + ${payload.completionTokens}c = ${payload.estimatedCostMicros}µ$ [${payload.promptBucket}, ${payload.completionBucket}]`
                )
            }
        }
    }

    // Force flush any pending summaries
    console.log('\nFlushing pending summaries...')
    const finalSummaries = forceFlushAICostSummary()
    windowSummaries.push(...finalSummaries)

    // Output summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 Simulation Summary')
    console.log('='.repeat(60))
    console.log(`Total AI calls: ${totalCalls}`)
    console.log(`Aggregate cost: ${totalCostMicros.toLocaleString()} microdollars ($${(totalCostMicros / 1_000_000).toFixed(6)})`)

    console.log(`\nTop 3 prompt token buckets:`)
    const topPromptBuckets = promptBucketTracker.getTop3()
    if (topPromptBuckets.length === 0) {
        console.log('  (none)')
    } else {
        topPromptBuckets.forEach(([bucket, count], index) => {
            console.log(`  ${index + 1}. ${bucket}: ${count} calls (${((count / totalCalls) * 100).toFixed(1)}%)`)
        })
    }

    console.log(`\nTop 3 completion token buckets:`)
    const topCompletionBuckets = completionBucketTracker.getTop3()
    if (topCompletionBuckets.length === 0) {
        console.log('  (none)')
    } else {
        topCompletionBuckets.forEach(([bucket, count], index) => {
            console.log(`  ${index + 1}. ${bucket}: ${count} calls (${((count / totalCalls) * 100).toFixed(1)}%)`)
        })
    }

    console.log(`\nWindow summaries emitted: ${windowSummaries.length}`)
    if (windowSummaries.length > 0) {
        windowSummaries.forEach((summary, index) => {
            console.log(
                `  ${index + 1}. ${summary.hourStart} [${summary.modelId}]: ${summary.calls} calls, ${summary.totalEstimatedCostMicros.toLocaleString()}µ$ (delayed: ${summary.delayedFlush})`
            )
        })
    }

    console.log('='.repeat(60))
    console.log('✅ Simulation completed successfully')
}

// Run main and handle errors
main().catch((error) => {
    console.error('\n❌ Simulation failed:', error.message)
    if (process.env.VERBOSE === 'true') {
        console.error(error.stack)
    }
    process.exit(1)
})
