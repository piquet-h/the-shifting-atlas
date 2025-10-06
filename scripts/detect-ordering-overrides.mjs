#!/usr/bin/env node
/* eslint-env node */
// DEPRECATED: detect-ordering-overrides.mjs retired.
console.error('detect-ordering-overrides.mjs deprecated – no action performed.')
process.exit(0)
/* global console, process */
/**
 * detect-ordering-overrides.mjs
 *
 * Detects manual overrides by comparing current ordering with previous automation artifacts.
 * Emits ordering_overridden telemetry event when same issue reordered within 24h of last automation.
 *
 * Usage:
 *   node scripts/detect-ordering-overrides.mjs
 *
 * Reads artifacts from: artifacts/ordering/*.json
 * Looks for changes where automation applied an order and it was manually changed within 24h.
 */

import { emitOrderingEvent, flushBuildTelemetry, initBuildTelemetry, trackOrderingOverridden } from './shared/build-telemetry.mjs'
import { detectOverrides, loadArtifacts } from './shared/ordering-artifacts.mjs'

async function main() {
    initBuildTelemetry()

    console.log('Detecting ordering overrides...')
    const artifacts = loadArtifacts(ARTIFACTS_DIR)
    console.log(`Loaded ${artifacts.length} artifact(s)`)

    if (artifacts.length < 2) {
        console.log('Not enough artifacts to detect overrides (need at least 2)')
        return
    }

    const overrides = detectOverrides(artifacts)

    if (overrides.length === 0) {
        console.log('No overrides detected')
    } else {
        console.log(`Found ${overrides.length} override(s):`)
        for (const override of overrides) {
            console.log(
                `  Issue #${override.issueNumber}: ${override.previousOrder} -> ${override.manualOrder} (${override.hoursSinceAutomation}h after automation)`
            )
            // Legacy event for backward compatibility
            trackOrderingOverridden(override)
            // New granular event
            emitOrderingEvent('override.detected', {
                issueNumber: override.issueNumber,
                previousAutoOrder: override.previousOrder,
                newOrder: override.manualOrder,
                hoursSinceAuto: override.hoursSinceAutomation,
                automationTimestamp: override.automationTimestamp
            })
        }
    }

    // Flush telemetry
    await flushBuildTelemetry(process.env.TELEMETRY_ARTIFACT)
}
