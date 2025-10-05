#!/usr/bin/env node
/* eslint-env node */
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

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initBuildTelemetry, trackOrderingOverridden, emitOrderingEvent, flushBuildTelemetry } from './shared/build-telemetry.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ARTIFACTS_DIR = join(ROOT, 'artifacts', 'ordering')

/**
 * Load all artifact files sorted by timestamp (newest first)
 */
function loadArtifacts() {
    try {
        const files = readdirSync(ARTIFACTS_DIR)
            .filter((f) => f.endsWith('.json'))
            .map((f) => ({
                name: f,
                path: join(ARTIFACTS_DIR, f),
                mtime: statSync(join(ARTIFACTS_DIR, f)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime) // newest first

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
 * Detect overrides by comparing artifacts
 * Returns array of override events
 */
function detectOverrides(artifacts) {
    const overrides = []
    
    // Group artifacts by issue number
    const byIssue = new Map()
    for (const artifact of artifacts) {
        if (!byIssue.has(artifact.issue)) {
            byIssue.set(artifact.issue, [])
        }
        byIssue.get(artifact.issue).push(artifact)
    }

    // For each issue, check for overrides
    for (const [issueNumber, issueArtifacts] of byIssue.entries()) {
        // Sort by timestamp (newest first)
        issueArtifacts.sort((a, b) => {
            const timeA = new Date(a.metadata?.timestamp || 0)
            const timeB = new Date(b.metadata?.timestamp || 0)
            return timeB - timeA
        })

        // Look for pattern: automation applied (applied=true) -> then different recommendedOrder within 24h
        for (let i = 0; i < issueArtifacts.length - 1; i++) {
            const current = issueArtifacts[i]
            const previous = issueArtifacts[i + 1]

            // Skip if previous wasn't applied by automation
            if (!previous.applied) continue

            // Check if orders differ
            if (current.recommendedOrder !== previous.recommendedOrder) {
                // Calculate time difference
                const currentTime = new Date(current.metadata?.timestamp || 0)
                const previousTime = new Date(previous.metadata?.timestamp || 0)
                const hoursDiff = (currentTime - previousTime) / (1000 * 60 * 60)

                // Only flag if within 24 hours
                if (hoursDiff <= 24 && hoursDiff >= 0) {
                    overrides.push({
                        issueNumber,
                        previousOrder: previous.recommendedOrder,
                        manualOrder: current.recommendedOrder,
                        hoursSinceAutomation: Math.round(hoursDiff * 10) / 10,
                        automationTimestamp: previous.metadata?.timestamp || 'unknown'
                    })
                }
            }
        }
    }

    return overrides
}

async function main() {
    initBuildTelemetry()

    console.log('Detecting ordering overrides...')
    const artifacts = loadArtifacts()
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
            console.log(`  Issue #${override.issueNumber}: ${override.previousOrder} -> ${override.manualOrder} (${override.hoursSinceAutomation}h after automation)`)
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

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
