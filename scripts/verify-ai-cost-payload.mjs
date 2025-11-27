#!/usr/bin/env node
/* eslint-env node */
/**
 * AI Cost Telemetry: PII & Payload Safety Audit
 *
 * Verifies that AI cost telemetry payloads conform to minimal allowed schema
 * and contain NO raw prompt text, completion text, or user-identifiable content.
 *
 * ## Usage
 *
 * ```bash
 * # Audit all AI cost payloads (requires shared package built)
 * node scripts/verify-ai-cost-payload.mjs
 *
 * # With verbose output
 * VERBOSE=true node scripts/verify-ai-cost-payload.mjs
 * ```
 *
 * ## Validation Rules
 *
 * 1. **Allowed Fields Only**: Payloads must contain ONLY fields defined in allowed schemas
 * 2. **No Large Strings**: String fields must not exceed 200 characters (prevents raw text)
 * 3. **No Nested Objects**: Deeply nested structures forbidden (except predefined schemas)
 * 4. **Primitive Types**: Only string, number, boolean primitives allowed
 *
 * ## Exit Codes
 *
 * - 0: All validations passed
 * - 1: Validation failures detected or configuration error
 *
 * @module verify-ai-cost-payload
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

/**
 * Allowed field schemas for each AI cost telemetry event.
 * Any field not in this list will trigger a validation failure.
 */
const ALLOWED_SCHEMAS = {
    'AI.Cost.Estimated': {
        modelId: 'string',
        promptTokens: 'number',
        completionTokens: 'number',
        estimatedCostMicros: 'number',
        promptBucket: 'string',
        completionBucket: 'string',
        pricingSource: 'string',
        estimator: 'string',
        simulation: 'boolean',
        hadNegativeTokens: 'boolean',
        // Optional fields (only present conditionally)
        originalPromptTokens: 'number',
        originalCompletionTokens: 'number'
    },
    'AI.Cost.WindowSummary': {
        hourStart: 'string',
        modelId: 'string',
        calls: 'number',
        totalPromptTokens: 'number',
        totalCompletionTokens: 'number',
        totalEstimatedCostMicros: 'number',
        delayedFlush: 'boolean'
    },
    'AI.Cost.SoftThresholdCrossed': {
        hourStart: 'string',
        modelId: 'string',
        totalEstimatedCostMicros: 'number',
        threshold: 'number',
        calls: 'number'
    },
    'AI.Cost.InputAdjusted': {
        reason: 'string',
        originalValue: 'number',
        adjustedValue: 'number',
        field: 'string',
        // Legacy fields from negative token clamping
        originalPromptTokens: 'number',
        originalCompletionTokens: 'number',
        adjustedPromptTokens: 'number',
        adjustedCompletionTokens: 'number'
    },
    'AI.Cost.InputCapped': {
        originalLength: 'number',
        cappedLength: 'number',
        estimator: 'string'
    },
    'AI.Cost.OverrideRejected': {
        reason: 'string',
        providedValue: 'string' // Truncated to 100 chars in emission
    }
}

/**
 * Maximum allowed string length (prevents raw prompt/completion text).
 * Chosen to allow model IDs, timestamps, and short messages but block full text.
 */
const MAX_STRING_LENGTH = 200

/**
 * Forbidden field names (case-insensitive).
 * These should NEVER appear in any AI cost telemetry payload.
 *
 * This comprehensive list covers common variations and PII fields.
 * See also: shared/test/aiCostPayloadSafety.test.ts for test validation list.
 */
const FORBIDDEN_FIELDS = [
    'prompttext',
    'completiontext',
    'prompt',
    'completion',
    'responsetext',
    'response',
    'username',
    'userid',
    'email',
    'name',
    'playerid',
    'sessionid'
]

/**
 * Load shared package for generating test payloads.
 */
async function loadSharedPackage() {
    try {
        const sharedPath = resolve(__dirname, '../shared/dist/index.js')
        const shared = await import(sharedPath)
        return shared
    } catch (error) {
        process.stderr.write('❌ Error: Could not load @piquet-h/shared package.\n')
        process.stderr.write('   Make sure to build the shared package first:\n')
        process.stderr.write('   cd shared && npm run build\n')
        throw error
    }
}

/**
 * Validate payload against allowed schema.
 *
 * @param {string} eventName - Telemetry event name
 * @param {object} payload - Payload to validate
 * @returns {object} Validation result with errors array
 */
function validatePayload(eventName, payload) {
    const errors = []
    const schema = ALLOWED_SCHEMAS[eventName]

    if (!schema) {
        errors.push(`Unknown event name: ${eventName}`)
        return { valid: false, errors }
    }

    // Check for disallowed fields
    for (const key of Object.keys(payload)) {
        // Check forbidden fields (case-insensitive)
        if (FORBIDDEN_FIELDS.includes(key.toLowerCase())) {
            errors.push(`Forbidden field detected: ${key}`)
        }

        // Check if field is in allowed schema
        if (!Object.prototype.hasOwnProperty.call(schema, key)) {
            errors.push(`Disallowed field: ${key} (not in schema for ${eventName})`)
        }
    }

    // Validate field types and constraints
    for (const [key, value] of Object.entries(payload)) {
        const expectedType = schema[key]

        if (value === undefined || value === null) {
            // Null/undefined optional fields are OK if they're in schema
            continue
        }

        const actualType = typeof value

        // Type check
        if (expectedType && actualType !== expectedType) {
            errors.push(`Invalid type for ${key}: expected ${expectedType}, got ${actualType}`)
        }

        // String length check (prevents raw text leakage)
        if (actualType === 'string' && value.length > MAX_STRING_LENGTH) {
            errors.push(`String field ${key} exceeds max length (${value.length} > ${MAX_STRING_LENGTH})`)
        }

        // Object nesting check (primitives only)
        if (actualType === 'object' && !Array.isArray(value)) {
            errors.push(`Nested object detected in field ${key} (not allowed)`)
        }

        // Array check (not allowed in current schemas)
        if (Array.isArray(value)) {
            errors.push(`Array field ${key} not allowed in AI cost telemetry`)
        }
    }

    return {
        valid: errors.length === 0,
        errors
    }
}

/**
 * Generate test payloads from shared package functions.
 */
async function generateTestPayloads(shared) {
    const payloads = []

    // Test AI.Cost.Estimated payload
    const estimatedPayload = shared.prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptText: 'Generate a dungeon description with detailed room layout',
        completionText: 'The dark corridor stretches before you, lit by flickering torches.'
    })
    payloads.push({ eventName: 'AI.Cost.Estimated', payload: estimatedPayload })

    // Test AI.Cost.Estimated with negative tokens (hadNegativeTokens=true)
    const negativeTokenPayload = shared.prepareAICostTelemetry({
        modelId: 'gpt-4o-mini',
        promptTokens: -10,
        completionTokens: -5
    })
    payloads.push({ eventName: 'AI.Cost.Estimated', payload: negativeTokenPayload })

    // Test AI.Cost.WindowSummary payload
    // Simulate by recording and forcing flush
    shared._resetAggregationForTests?.() // Reset if available
    const now = Date.now()
    shared.recordEstimatedAICost(
        {
            modelId: 'gpt-4o-mini',
            promptTokens: 150,
            completionTokens: 450,
            estimatedCostMicros: 375
        },
        now
    )

    // Force flush to get summary
    const summaries = shared.forceFlushAICostSummary(now)
    if (summaries && summaries.length > 0) {
        payloads.push({ eventName: 'AI.Cost.WindowSummary', payload: summaries[0] })
    }

    // Test AI.Cost.SoftThresholdCrossed payload
    shared._resetGuardrailsForTests?.() // Reset if available
    shared.setSoftThreshold?.(10000) // 10,000 microdollars
    const thresholdResult = shared.checkSoftThreshold?.({
        modelId: 'gpt-4o-mini',
        hourStart: '2025-11-06T07:00:00.000Z',
        totalEstimatedCostMicros: 15000,
        calls: 67
    })

    if (thresholdResult?.thresholdEvent) {
        payloads.push({ eventName: 'AI.Cost.SoftThresholdCrossed', payload: thresholdResult.thresholdEvent })
    }

    // Test AI.Cost.InputAdjusted payload (overflow protection)
    if (thresholdResult?.adjustedEvent) {
        payloads.push({ eventName: 'AI.Cost.InputAdjusted', payload: thresholdResult.adjustedEvent })
    }

    return payloads
}

/**
 * Main validation function.
 */
async function main() {
    const verbose = process.env.VERBOSE === 'true'

    if (verbose) {
        process.stdout.write('🔍 AI Cost Telemetry Payload Safety Audit\n\n')
    }

    // Load shared package
    const shared = await loadSharedPackage()

    if (verbose) {
        process.stdout.write('Generating test payloads from shared package...\n')
    }

    // Generate test payloads
    const testPayloads = await generateTestPayloads(shared)

    if (verbose) {
        process.stdout.write(`Generated ${testPayloads.length} test payloads\n\n`)
    }

    // Validate each payload
    let failureCount = 0
    const results = []

    for (const { eventName, payload } of testPayloads) {
        const result = validatePayload(eventName, payload)
        results.push({ eventName, result })

        if (!result.valid) {
            failureCount++
            process.stderr.write(`❌ FAILED: ${eventName}\n`)
            for (const error of result.errors) {
                process.stderr.write(`   - ${error}\n`)
            }
        } else if (verbose) {
            process.stdout.write(`✅ PASSED: ${eventName}\n`)
        }
    }

    // Summary
    if (verbose || failureCount > 0) {
        process.stdout.write('\n' + '='.repeat(60) + '\n')
        process.stdout.write('📊 Validation Summary\n')
        process.stdout.write('='.repeat(60) + '\n')
        process.stdout.write(`Total payloads validated: ${testPayloads.length}\n`)
        process.stdout.write(`Passed: ${testPayloads.length - failureCount}\n`)
        process.stdout.write(`Failed: ${failureCount}\n`)
        process.stdout.write('='.repeat(60) + '\n')
    }

    if (failureCount === 0) {
        process.stdout.write('[verify-ai-cost-payload] ✅ All AI cost telemetry payloads conform to allowed schema\n')
        process.exit(0)
    } else {
        process.stderr.write('[verify-ai-cost-payload] ❌ Payload validation failures detected\n')
        process.exit(1)
    }
}

// Run main and handle errors
main().catch((error) => {
    process.stderr.write(`\n❌ Audit failed: ${error.message}\n`)
    if (process.env.VERBOSE === 'true') {
        process.stderr.write(error.stack + '\n')
    }
    process.exit(1)
})
