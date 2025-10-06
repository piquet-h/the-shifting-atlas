#!/usr/bin/env node
/* eslint-env node */
/* global console */
/**
 * Build automation telemetry module.
 *
 * CRITICAL: This module is for CI/automation events ONLY (scheduler, ordering, variance).
 * DO NOT use for game events - those belong in shared/src/telemetry.ts.
 *
 * Separation rationale:
 * - Build events use `build.` prefix
 * - Stays within GitHub ecosystem (artifacts, workflow outputs)
 * - Application Insights is ONLY for game telemetry
 * - The shared/ folder is exclusively for game domain code
 * - Prevents mixing infrastructure and domain concerns
 */

const eventBuffer = []

/**
 * Build event names for Stage 1 ordering automation.
 * These are build/CI events, NOT game domain events.
 */
export const BUILD_EVENT_NAMES = {
    // Stage 1 ordering events (legacy flat names - kept for backward compatibility)
    ORDERING_APPLIED: 'build.ordering_applied',
    ORDERING_LOW_CONFIDENCE: 'build.ordering_low_confidence',
    ORDERING_OVERRIDDEN: 'build.ordering_overridden',
    ORDERING_ASSIGNED: 'build.ordering_assigned',
    // Stage 1 ordering events (granular nested structure)
    ASSIGN_ATTEMPT: 'build.ordering.assign.attempt',
    ASSIGN_APPLY: 'build.ordering.assign.apply',
    ASSIGN_SKIP: 'build.ordering.assign.skip',
    CONFIDENCE_LOW: 'build.ordering.confidence.low',
    OVERRIDE_DETECTED: 'build.ordering.override.detected',
    INTEGRITY_SNAPSHOT: 'build.ordering.integrity.snapshot',
    METRICS_WEEKLY: 'build.ordering.metrics.weekly',
    VALIDATION_START: 'build.ordering.validation.start',
    VALIDATION_SUCCESS: 'build.ordering.validation.success',
    VALIDATION_FAIL: 'build.ordering.validation.fail',
    // Stage 2 scheduling events
    SCHEDULE_VARIANCE: 'build.schedule_variance',
    PROVISIONAL_SCHEDULE_CREATED: 'build.provisional_schedule_created',
    VARIANCE_ALERT: 'build.variance_alert',
    REBASELINE_TRIGGERED: 'build.rebaseline_triggered'
}

/**
 * Generic build event emission (ensures build. prefix).
 * @param {string} name Full event name (must start with build.)
 * @param {object} props Additional properties
 */
export function emitBuildEvent(name, props = {}) {
    if (!name.startsWith('build.')) {
        console.error(`Invalid build event name '${name}' (must start with 'build.')`)
        return
    }
    const event = {
        name,
        properties: {
            ...props,
            timestamp: new Date().toISOString(),
            telemetrySource: 'build-automation'
        }
    }
    console.log('[BUILD_TELEMETRY]', JSON.stringify(event, null, 2))
    eventBuffer.push(event)
}

// Validation helpers (Stage 1 integrity)
export function trackValidationStart(props = {}) {
    emitOrderingEvent('validation.start', { ...props, telemetryType: 'ordering', stage: 1 })
}
export function trackValidationSuccess(props = {}) {
    emitOrderingEvent('validation.success', { ...props, telemetryType: 'ordering', stage: 1 })
}
export function trackValidationFail(props = {}) {
    emitOrderingEvent('validation.fail', { ...props, telemetryType: 'ordering', stage: 1 })
}

/**
 * Initialize build telemetry.
 * Build telemetry uses GitHub-native features (artifacts, outputs) only.
 * Application Insights is reserved exclusively for game telemetry.
 */
export function initBuildTelemetry() {
    console.log('Build telemetry initialized (GitHub artifacts mode)')
}

/**
 * Emit an ordering event with automatic `build.ordering.` prefix.
 * Helper for Stage 1 granular telemetry events.
 *
 * @param {string} name - Event name segment (e.g., 'assign.attempt')
 * @param {object} props - Event properties
 */
export function emitOrderingEvent(name, props) {
    const fullName = name.startsWith('build.ordering.') ? name : `build.ordering.${name}`
    const event = {
        name: fullName,
        properties: {
            ...props,
            timestamp: new Date().toISOString(),
            telemetrySource: 'build-automation',
            telemetryType: 'ordering',
            stage: 1
        }
    }

    console.log('[BUILD_TELEMETRY]', JSON.stringify(event, null, 2))
    eventBuffer.push(event)
}

/**
 * Track an ordering applied event.
 * Emitted when implementation order is successfully applied without manual intervention.
 *
 * @param {object} data - Ordering data
 * @param {number} data.issueNumber - Issue number
 * @param {number} data.recommendedOrder - Recommended implementation order
 * @param {string} data.confidence - Confidence level (high/medium/low)
 * @param {number} data.score - Priority score
 * @param {number} data.changes - Number of issues reordered
 * @param {string} data.strategy - Strategy used (auto/append/scope-block)
 * @param {string} data.scope - Scope label
 * @param {string} data.type - Type label
 * @param {string} data.milestone - Milestone
 */
export function trackOrderingApplied(data) {
    const event = {
        name: BUILD_EVENT_NAMES.ORDERING_APPLIED,
        properties: {
            ...data,
            timestamp: new Date().toISOString(),
            telemetrySource: 'build-automation',
            telemetryType: 'ordering',
            stage: 1
        }
    }

    console.log('[BUILD_TELEMETRY]', JSON.stringify(event, null, 2))
    eventBuffer.push(event)
}

/**
 * Track a low confidence ordering event.
 * Emitted when confidence is not high and automation refrains from auto-apply.
 *
 * @param {object} data - Ordering data
 * @param {number} data.issueNumber - Issue number
 * @param {number} data.recommendedOrder - Recommended implementation order
 * @param {string} data.confidence - Confidence level (medium/low)
 * @param {number} data.score - Priority score
 * @param {string} data.reason - Why confidence is low (missing metadata)
 * @param {string} data.scope - Scope label (or 'none')
 * @param {string} data.type - Type label (or 'none')
 * @param {string} data.milestone - Milestone (or 'none')
 */
export function trackOrderingLowConfidence(data) {
    const event = {
        name: BUILD_EVENT_NAMES.ORDERING_LOW_CONFIDENCE,
        properties: {
            ...data,
            timestamp: new Date().toISOString(),
            telemetrySource: 'build-automation',
            telemetryType: 'ordering',
            stage: 1
        }
    }

    console.log('[BUILD_TELEMETRY]', JSON.stringify(event, null, 2))
    eventBuffer.push(event)
}

/**
 * Track an ordering override event.
 * Emitted when manual change detected within 24h of last automation run.
 *
 * @param {object} data - Override data
 * @param {number} data.issueNumber - Issue number
 * @param {number} data.previousOrder - Order assigned by automation
 * @param {number} data.manualOrder - Order set manually
 * @param {number} data.hoursSinceAutomation - Hours since automation applied
 * @param {string} data.automationTimestamp - Timestamp of automation run
 */
export function trackOrderingOverridden(data) {
    const event = {
        name: BUILD_EVENT_NAMES.ORDERING_OVERRIDDEN,
        properties: {
            ...data,
            timestamp: new Date().toISOString(),
            telemetrySource: 'build-automation',
            telemetryType: 'ordering',
            stage: 1
        }
    }

    console.log('[BUILD_TELEMETRY]', JSON.stringify(event, null, 2))
    eventBuffer.push(event)
}

/**
 * Track a schedule variance event.
 *
 * @param {object} data - Variance data
 * @param {number} data.issueNumber - Issue number
 * @param {number} data.implementationOrder - Implementation order
 * @param {string} data.provisionalStart - Provisional start date (YYYY-MM-DD)
 * @param {string} data.provisionalFinish - Provisional finish date (YYYY-MM-DD)
 * @param {number} data.provisionalDuration - Provisional duration (days)
 * @param {string} data.actualStart - Actual start date (YYYY-MM-DD)
 * @param {string} data.actualFinish - Actual finish date (YYYY-MM-DD)
 * @param {number} data.actualDuration - Actual duration (days)
 * @param {number} data.startDelta - Start date delta (days)
 * @param {number} data.finishDelta - Finish date (days)
 * @param {number} data.durationDelta - Duration delta (days)
 * @param {number} data.overallVariance - Overall variance (0-1, finish-weighted)
 * @param {string} data.scope - Scope label
 * @param {string} data.type - Type label
 * @param {string} data.confidence - Confidence level
 * @param {number} data.sampleSize - Sample size used for estimation
 * @param {string} data.basis - Basis type
 * @param {string} data.schedulerReason - Scheduler reason
 * @param {string} data.status - Issue status
 */
export function trackScheduleVariance(data) {
    const event = {
        name: BUILD_EVENT_NAMES.SCHEDULE_VARIANCE,
        properties: {
            ...data,
            timestamp: new Date().toISOString(),
            telemetrySource: 'build-automation',
            telemetryType: 'scheduler',
            stage: 2
        }
    }

    // Build telemetry logs to console for GitHub Actions logs
    // and stores in event buffer for artifact export
    console.log('[BUILD_TELEMETRY]', JSON.stringify(event, null, 2))
    eventBuffer.push(event)
}

/**
 * Track a provisional schedule creation event.
 *
 * @param {object} data - Provisional schedule data
 * @param {number} data.issueNumber - Issue number
 * @param {number} data.implementationOrder - Implementation order
 * @param {string} data.provisionalStart - Provisional start date
 * @param {string} data.provisionalFinish - Provisional finish date
 * @param {number} data.duration - Duration (days)
 * @param {string} data.confidence - Confidence level
 * @param {number} data.sampleSize - Sample size
 * @param {string} data.basis - Basis type
 */
export function trackProvisionalCreated(data) {
    const event = {
        name: BUILD_EVENT_NAMES.PROVISIONAL_SCHEDULE_CREATED,
        properties: {
            ...data,
            timestamp: new Date().toISOString(),
            telemetrySource: 'build-automation',
            telemetryType: 'ordering',
            stage: 2
        }
    }

    // Build telemetry logs to console for GitHub Actions logs
    // and stores in event buffer for artifact export
    console.log('[BUILD_TELEMETRY]', JSON.stringify(event, null, 2))
    eventBuffer.push(event)
}

/**
 * Track a variance alert event.
 *
 * @param {object} data - Alert data
 * @param {string} data.alertType - Alert type ('created', 'updated', 'closed')
 * @param {string} data.period - Period identifier (e.g., '2025-W02')
 * @param {number} data.variance - Aggregate variance value
 * @param {number} data.threshold - Threshold that triggered alert
 * @param {number} data.issueCount - Number of issues in window
 */
export function trackVarianceAlert(data) {
    const event = {
        name: BUILD_EVENT_NAMES.VARIANCE_ALERT,
        properties: {
            ...data,
            timestamp: new Date().toISOString(),
            telemetrySource: 'build-automation',
            telemetryType: 'variance',
            stage: 2
        }
    }

    // Build telemetry logs to console for GitHub Actions logs
    // and stores in event buffer for artifact export
    console.log('[BUILD_TELEMETRY]', JSON.stringify(event, null, 2))
    eventBuffer.push(event)
}

/**
 * Check if build telemetry is enabled.
 * Build telemetry is always enabled (logs to console + artifacts).
 *
 * @returns {boolean} True if telemetry is enabled
 */
export function isBuildTelemetryEnabled() {
    return true
}

/**
 * Get buffered events (for artifact export).
 *
 * @returns {Array} Array of telemetry events
 */
export function getBufferedEvents() {
    return [...eventBuffer]
}

/**
 * Flush telemetry to artifact file (if path specified).
 * Build telemetry stays within GitHub ecosystem via artifacts.
 *
 * @param {string} [artifactPath] - Optional path to write telemetry artifact
 * @returns {Promise<void>}
 */
export async function flushBuildTelemetry(artifactPath) {
    if (artifactPath) {
        const fs = await import('node:fs')
        const events = getBufferedEvents()
        fs.writeFileSync(artifactPath, JSON.stringify(events, null, 2))
        console.log(`Build telemetry flushed to artifact: ${artifactPath} (${events.length} events)`)
    } else {
        console.log('Build telemetry complete (no artifact path specified)')
    }
}
