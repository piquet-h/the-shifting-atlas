#!/usr/bin/env node
/* eslint-env node */
/* global process, console */
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
 * Initialize build telemetry.
 * Build telemetry uses GitHub-native features (artifacts, outputs) only.
 * Application Insights is reserved exclusively for game telemetry.
 */
export function initBuildTelemetry() {
    console.log('Build telemetry initialized (GitHub artifacts mode)')
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
 * @param {number} data.finishDelta - Finish date delta (days)
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
        name: 'build.schedule_variance',
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
        name: 'build.provisional_schedule_created',
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
        name: 'build.variance_alert',
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
