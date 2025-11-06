/**
 * AI Cost Telemetry: Soft Budget Guardrails
 *
 * Provides soft threshold guardrails that emit AI.Cost.SoftThresholdCrossed when hourly
 * estimated cost exceeds configured limit. Designed for early visibility into anomalous
 * cost spikes without blocking execution.
 *
 * ## Usage
 *
 * ```typescript
 * import { checkSoftThreshold, initSoftThresholdFromEnv } from '@piquet-h/shared'
 *
 * // Backend: Initialize at startup by passing the AI_COST_SOFT_THRESHOLD_MICROS environment variable
 *
 * // After recording AI cost to aggregator, check threshold
 * const thresholdEvent = checkSoftThreshold({
 *     modelId: 'gpt-4o-mini',
 *     hourStart: '2025-11-05T20:00:00.000Z',
 *     totalEstimatedCostMicros: 1500000,
 *     calls: 42
 * })
 *
 * // Emit event if threshold crossed
 * if (thresholdEvent) {
 *     telemetryClient.emit('AI.Cost.SoftThresholdCrossed', thresholdEvent)
 * }
 * ```
 *
 * ## Configuration
 *
 * - Environment variable: AI_COST_SOFT_THRESHOLD_MICROS (integer in microdollars)
 * - If not set or ≤ 0: guardrails disabled (no events emitted)
 * - If set: first crossing per (modelId, hour) emits event, subsequent crossings suppressed
 * - Threshold resets on hour rollover (new hour re-enables event emission)
 *
 * ## Edge Cases
 *
 * - Threshold set to 0 or negative: treated as disabled
 * - Threshold not set: disabled
 * - Cost overflow (> Number.MAX_SAFE_INTEGER): capped and separate InputAdjusted event returned
 *
 * ## Privacy
 *
 * NO raw prompt or completion text is stored or emitted.
 * Only aggregated token counts and cost estimates.
 *
 * @module aiCostGuardrails
 */

import { getCurrentHourStart } from './aiCostAggregator.js'

/**
 * Options for checking soft threshold.
 */
export interface CheckSoftThresholdOptions {
    /** AI model identifier */
    modelId: string
    /** Hour start timestamp (ISO 8601, UTC, truncated to hour) */
    hourStart: string
    /** Total estimated cost in microdollars for this hour */
    totalEstimatedCostMicros: number
    /** Number of AI operations in this hour */
    calls: number
}

/**
 * Event payload for AI.Cost.SoftThresholdCrossed.
 */
export interface SoftThresholdCrossedEvent {
    /** Hour start timestamp (ISO 8601, UTC, truncated to hour) */
    hourStart: string
    /** AI model identifier */
    modelId: string
    /** Total estimated cost in microdollars that triggered the threshold */
    totalEstimatedCostMicros: number
    /** Configured threshold in microdollars */
    threshold: number
    /** Number of AI operations in this hour when threshold was crossed */
    calls: number
}

/**
 * Event payload for AI.Cost.InputAdjusted (integer overflow protection).
 */
export interface InputAdjustedEvent {
    /** Reason for adjustment */
    reason: 'overflow_protection'
    /** Original value before adjustment */
    originalValue: number
    /** Adjusted value after capping */
    adjustedValue: number
    /** Field that was adjusted */
    field: 'totalEstimatedCostMicros'
}

/**
 * Result from checking soft threshold.
 * May include both threshold crossed event and overflow adjustment event.
 */
export interface SoftThresholdCheckResult {
    /** Threshold crossed event (null if not crossed or suppressed) */
    thresholdEvent: SoftThresholdCrossedEvent | null
    /** Input adjusted event (null if no overflow) */
    adjustedEvent: InputAdjustedEvent | null
}

/**
 * In-memory tracking of threshold crossings per (modelId, hour).
 * Key: modelId|hourStart (e.g., "gpt-4o-mini|2025-11-05T20:00:00.000Z")
 * Value: true if threshold already crossed this hour
 */
const crossingTracker = new Map<string, boolean>()

/**
 * Configured soft threshold in microdollars (null = disabled).
 * Set via initSoftThresholdFromEnv() or setSoftThreshold().
 */
let softThresholdMicros: number | null = null

/**
 * Generate tracking key for modelId + hourStart.
 * @param modelId - AI model identifier
 * @param hourStart - Hour start timestamp
 * @returns Tracking key
 */
function getTrackingKey(modelId: string, hourStart: string): string {
    return `${modelId}|${hourStart}`
}

/**
 * Initialize soft threshold from environment variable value.
 * Caller should pass the value of AI_COST_SOFT_THRESHOLD_MICROS env var.
 * If value is not provided, not a valid integer string, or ≤ 0, guardrails are disabled.
 *
 * This function is safe to call multiple times (idempotent).
 *
 * @param envValue - Value of AI_COST_SOFT_THRESHOLD_MICROS environment variable (undefined if not set)
 */
export function initSoftThresholdFromEnv(envValue: string | undefined): void {
    if (!envValue) {
        // Not set - disabled
        softThresholdMicros = null
        return
    }

    const parsed = parseInt(envValue, 10)

    if (isNaN(parsed) || parsed <= 0) {
        // Invalid or ≤ 0 - disabled
        softThresholdMicros = null
        return
    }

    softThresholdMicros = parsed
}

/**
 * Set soft threshold programmatically (for testing or runtime configuration).
 * Pass null or value ≤ 0 to disable guardrails.
 *
 * @param thresholdMicros - Threshold in microdollars (null or ≤ 0 to disable)
 */
export function setSoftThreshold(thresholdMicros: number | null): void {
    if (thresholdMicros === null || thresholdMicros <= 0) {
        softThresholdMicros = null
    } else {
        softThresholdMicros = thresholdMicros
    }
}

/**
 * Get current soft threshold value (null = disabled).
 * @returns Current threshold in microdollars or null if disabled
 */
export function getSoftThreshold(): number | null {
    return softThresholdMicros
}

/**
 * Check if cost exceeds soft threshold and return event to emit.
 * First crossing per (modelId, hour) returns event; subsequent crossings return null (suppressed).
 * Automatically resets on hour rollover.
 *
 * @param options - Threshold check options
 * @param now - Current timestamp for testing (defaults to Date.now())
 * @returns Result with threshold event and/or adjustment event (both may be null)
 */
export function checkSoftThreshold(options: CheckSoftThresholdOptions, now: number = Date.now()): SoftThresholdCheckResult {
    const { modelId, hourStart, calls } = options
    let { totalEstimatedCostMicros } = options

    let adjustedEvent: InputAdjustedEvent | null = null

    // Check for integer overflow and cap if needed
    if (totalEstimatedCostMicros > Number.MAX_SAFE_INTEGER) {
        adjustedEvent = {
            reason: 'overflow_protection',
            originalValue: totalEstimatedCostMicros,
            adjustedValue: Number.MAX_SAFE_INTEGER,
            field: 'totalEstimatedCostMicros'
        }
        totalEstimatedCostMicros = Number.MAX_SAFE_INTEGER
    }

    // If threshold not configured or disabled, no event
    if (softThresholdMicros === null) {
        return {
            thresholdEvent: null,
            adjustedEvent
        }
    }

    // If cost doesn't exceed threshold, no event
    if (totalEstimatedCostMicros < softThresholdMicros) {
        return {
            thresholdEvent: null,
            adjustedEvent
        }
    }

    // Clean up old hours from tracker (automatic reset)
    cleanupOldHours(now)

    const key = getTrackingKey(modelId, hourStart)

    // Check if already crossed this hour
    if (crossingTracker.has(key)) {
        // Already emitted for this (modelId, hour) - suppress
        return {
            thresholdEvent: null,
            adjustedEvent
        }
    }

    // First crossing - mark as crossed and return event
    crossingTracker.set(key, true)

    return {
        thresholdEvent: {
            hourStart,
            modelId,
            totalEstimatedCostMicros,
            threshold: softThresholdMicros,
            calls
        },
        adjustedEvent
    }
}

/**
 * Remove tracking entries for completed hours (current time is in a later hour).
 * This enables re-emission in new hours without memory leak.
 *
 * @param now - Current timestamp (defaults to Date.now())
 */
function cleanupOldHours(now: number = Date.now()): void {
    const currentHourStart = getCurrentHourStart(now)
    const currentHourMs = new Date(currentHourStart).getTime()

    const keysToDelete: string[] = []

    for (const key of crossingTracker.keys()) {
        // Extract hourStart from key (format: "modelId|hourStart")
        const hourStart = key.split('|')[1]
        if (!hourStart) continue

        const hourMs = new Date(hourStart).getTime()

        // If hour is complete (current hour is later), remove it
        if (currentHourMs > hourMs) {
            keysToDelete.push(key)
        }
    }

    for (const key of keysToDelete) {
        crossingTracker.delete(key)
    }
}

/**
 * Reset guardrails state (for testing only).
 * Clears threshold configuration and crossing tracker.
 * @internal
 */
export function _resetGuardrailsForTests(): void {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
        throw new Error('_resetGuardrailsForTests should not be called in production')
    }
    softThresholdMicros = null
    crossingTracker.clear()
}
