/**
 * AI Cost Telemetry: Hourly Aggregation & Window Summary
 *
 * Provides in-memory hourly aggregation of AI cost metrics for dashboard queries and soft guardrails.
 * Keyed by modelId + hourStart (UTC, truncated to hour).
 *
 * ## Usage
 *
 * ```typescript
 * import { recordEstimatedAICost, forceFlushAICostSummary } from '@piquet-h/shared'
 *
 * // Record AI cost event (increments hourly counters)
 * const summaries = recordEstimatedAICost({
 *     modelId: 'gpt-4o-mini',
 *     promptTokens: 150,
 *     completionTokens: 450,
 *     estimatedCostMicros: 375
 * })
 *
 * // Backend emits WindowSummary events for any completed hours
 * for (const summary of summaries) {
 *     telemetryClient.emit('AI.Cost.WindowSummary', summary)
 * }
 *
 * // Explicit flush (e.g., before shutdown or for testing)
 * const allSummaries = forceFlushAICostSummary()
 * for (const summary of allSummaries) {
 *     telemetryClient.emit('AI.Cost.WindowSummary', summary)
 * }
 * ```
 *
 * ## Flush Logic
 *
 * - Automatic flush: When recording an event in a new hour, any completed previous hours are flushed
 * - Manual flush: Call `forceFlushAICostSummary()` to emit all pending summaries
 * - Delayed flush: If idle >1 hour, next event emits previous hour with `delayedFlush=true`
 * - Zero-call hours: Never emitted (no summary when calls=0)
 *
 * ## Telemetry Payload
 *
 * WindowSummary event includes:
 * - hourStart: ISO 8601 timestamp (UTC, truncated to hour)
 * - modelId: AI model identifier
 * - calls: Number of AI operations in this hour
 * - totalPromptTokens: Sum of prompt tokens
 * - totalCompletionTokens: Sum of completion tokens
 * - totalEstimatedCostMicros: Sum of estimated costs (microdollars)
 * - delayedFlush: true if flush occurred >1 hour after hour end
 *
 * ## Privacy
 *
 * NO raw prompt or completion text is stored or emitted.
 * Only aggregated token counts and cost estimates.
 *
 * @module aiCostAggregator
 */

/**
 * Options for recording an AI cost event.
 */
export interface RecordAICostOptions {
    /** AI model identifier */
    modelId: string
    /** Prompt token count */
    promptTokens: number
    /** Completion token count */
    completionTokens: number
    /** Estimated cost in microdollars (USD * 1,000,000) */
    estimatedCostMicros: number
}

/**
 * Window summary payload for AI.Cost.WindowSummary event.
 */
export interface AICostWindowSummary {
    /** Hour start timestamp (ISO 8601, UTC, truncated to hour) */
    hourStart: string
    /** AI model identifier */
    modelId: string
    /** Number of AI operations in this hour */
    calls: number
    /** Total prompt tokens in this hour */
    totalPromptTokens: number
    /** Total completion tokens in this hour */
    totalCompletionTokens: number
    /** Total estimated cost in microdollars (USD * 1,000,000) */
    totalEstimatedCostMicros: number
    /** True if flush occurred >1 hour after hour end (indicates long idle period or health issue) */
    delayedFlush: boolean
}

/**
 * Internal aggregation bucket for a single model+hour.
 */
interface AggregationBucket {
    /** Hour start timestamp (ISO 8601, UTC, truncated to hour) */
    hourStart: string
    /** AI model identifier */
    modelId: string
    /** Number of AI operations in this hour */
    calls: number
    /** Total prompt tokens in this hour */
    totalPromptTokens: number
    /** Total completion tokens in this hour */
    totalCompletionTokens: number
    /** Total estimated cost in microdollars (USD * 1,000,000) */
    totalEstimatedCostMicros: number
}

/**
 * In-memory aggregation store.
 * Key: modelId|hourStart (e.g., "gpt-4o-mini|2025-11-05T20:00:00.000Z")
 */
const aggregationStore = new Map<string, AggregationBucket>()

/**
 * Get current hour start timestamp (UTC, truncated to hour).
 * @param now - Optional timestamp for testing (defaults to Date.now())
 * @returns ISO 8601 timestamp truncated to hour
 */
export function getCurrentHourStart(now: number = Date.now()): string {
    const date = new Date(now)
    date.setUTCMinutes(0, 0, 0)
    return date.toISOString()
}

/**
 * Generate aggregation key for modelId + hourStart.
 * @param modelId - AI model identifier
 * @param hourStart - Hour start timestamp
 * @returns Aggregation key
 */
function getAggregationKey(modelId: string, hourStart: string): string {
    return `${modelId}|${hourStart}`
}

/**
 * Check if an hour is complete (current time is in a later hour).
 * @param hourStart - Hour start timestamp to check
 * @param now - Current timestamp (defaults to Date.now())
 * @returns True if hour is complete
 */
function isHourComplete(hourStart: string, now: number = Date.now()): boolean {
    const hourStartMs = new Date(hourStart).getTime()
    const currentHourStartMs = new Date(getCurrentHourStart(now)).getTime()
    return currentHourStartMs > hourStartMs
}

/**
 * Check if flush is delayed (>1 hour after hour end).
 * @param hourStart - Hour start timestamp
 * @param now - Current timestamp (defaults to Date.now())
 * @returns True if delayed (>1 hour gap)
 */
function isDelayedFlush(hourStart: string, now: number = Date.now()): boolean {
    const hourStartMs = new Date(hourStart).getTime()
    const hourEndMs = hourStartMs + 3600000 // +1 hour
    const gapMs = now - hourEndMs
    return gapMs > 3600000 // >1 hour gap
}

/**
 * Convert aggregation bucket to window summary payload.
 * @param bucket - Aggregation bucket
 * @param delayedFlush - True if flush is delayed
 * @returns Window summary payload
 */
function bucketToSummary(bucket: AggregationBucket, delayedFlush: boolean): AICostWindowSummary {
    return {
        hourStart: bucket.hourStart,
        modelId: bucket.modelId,
        calls: bucket.calls,
        totalPromptTokens: bucket.totalPromptTokens,
        totalCompletionTokens: bucket.totalCompletionTokens,
        totalEstimatedCostMicros: bucket.totalEstimatedCostMicros,
        delayedFlush
    }
}

/**
 * Record an AI cost event and return any completed hour summaries to emit.
 * Automatically flushes completed hours when a new hour starts.
 *
 * @param options - AI cost recording options
 * @param now - Optional timestamp for testing (defaults to Date.now())
 * @returns Array of window summaries to emit (may be empty)
 */
export function recordEstimatedAICost(options: RecordAICostOptions, now: number = Date.now()): AICostWindowSummary[] {
    const { modelId, promptTokens, completionTokens, estimatedCostMicros } = options
    const currentHourStart = getCurrentHourStart(now)
    const key = getAggregationKey(modelId, currentHourStart)

    // Flush completed hours before recording new event
    const summaries = flushCompletedHours(now)

    // Get or create current hour bucket
    let bucket = aggregationStore.get(key)
    if (!bucket) {
        bucket = {
            hourStart: currentHourStart,
            modelId,
            calls: 0,
            totalPromptTokens: 0,
            totalCompletionTokens: 0,
            totalEstimatedCostMicros: 0
        }
        aggregationStore.set(key, bucket)
    }

    // Increment counters
    bucket.calls++
    bucket.totalPromptTokens += promptTokens
    bucket.totalCompletionTokens += completionTokens
    bucket.totalEstimatedCostMicros += estimatedCostMicros

    return summaries
}

/**
 * Flush all completed hours (current time is in a later hour).
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Array of window summaries to emit
 */
function flushCompletedHours(now: number = Date.now()): AICostWindowSummary[] {
    const summaries: AICostWindowSummary[] = []

    for (const [key, bucket] of aggregationStore.entries()) {
        if (isHourComplete(bucket.hourStart, now)) {
            // Skip zero-call hours
            if (bucket.calls > 0) {
                const delayedFlush = isDelayedFlush(bucket.hourStart, now)
                summaries.push(bucketToSummary(bucket, delayedFlush))
            }
            aggregationStore.delete(key)
        }
    }

    return summaries
}

/**
 * Force flush all pending summaries (including current hour).
 * Useful for testing or graceful shutdown.
 *
 * @param now - Optional timestamp for testing (defaults to Date.now())
 * @returns Array of all window summaries
 */
export function forceFlushAICostSummary(now: number = Date.now()): AICostWindowSummary[] {
    const summaries: AICostWindowSummary[] = []

    for (const bucket of aggregationStore.values()) {
        // Skip zero-call hours
        if (bucket.calls > 0) {
            const delayedFlush = isDelayedFlush(bucket.hourStart, now)
            summaries.push(bucketToSummary(bucket, delayedFlush))
        }
    }

    // Clear all buckets
    aggregationStore.clear()

    return summaries
}

/**
 * Reset aggregation store (for testing only).
 * @internal
 */
export function _resetAggregationForTests(): void {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
        throw new Error('_resetAggregationForTests should not be called in production')
    }
    aggregationStore.clear()
}
