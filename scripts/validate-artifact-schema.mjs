#!/usr/bin/env node
/* eslint-env node */
/* global console, process */
/**
 * validate-artifact-schema.mjs
 *
 * Validates that ordering artifact files match the expected schema.
 * Fails CI if extraneous keys or invalid structure detected.
 *
 * Usage:
 *   node scripts/validate-artifact-schema.mjs
 *
 * Exit codes:
 *   0: All artifacts valid
 *   1: Schema violations detected
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const ARTIFACTS_DIR = join(ROOT, 'artifacts', 'ordering')

/**
 * Expected artifact schema
 */
const EXPECTED_KEYS = new Set([
    'strategy',
    'issue',
    'recommendedOrder',
    'changes',
    'confidence',
    'score',
    'rationale',
    'diff',
    'plan',
    'metadata',
    'applied',
    'reason',
    '_filename',
    '_mtime'
])

const REQUIRED_KEYS = new Set(['issue', 'recommendedOrder', 'confidence', 'score', 'metadata'])

const METADATA_KEYS = new Set(['scope', 'type', 'milestone', 'timestamp'])

/**
 * Validate a single artifact
 */
function validateArtifact(artifact, filename) {
    const violations = []

    // Check required keys
    for (const key of REQUIRED_KEYS) {
        if (!(key in artifact)) {
            violations.push(`Missing required key: ${key}`)
        }
    }

    // Check for extraneous keys
    for (const key of Object.keys(artifact)) {
        if (!EXPECTED_KEYS.has(key)) {
            violations.push(`Extraneous key: ${key}`)
        }
    }

    // Validate metadata structure if present
    if (artifact.metadata) {
        if (typeof artifact.metadata !== 'object') {
            violations.push('metadata must be an object')
        } else {
            for (const key of Object.keys(artifact.metadata)) {
                if (!METADATA_KEYS.has(key)) {
                    violations.push(`metadata: extraneous key: ${key}`)
                }
            }
        }
    }

    // Validate types
    if (typeof artifact.issue !== 'number') {
        violations.push('issue must be a number')
    }
    if (typeof artifact.recommendedOrder !== 'number') {
        violations.push('recommendedOrder must be a number')
    }
    if (!['high', 'medium', 'low'].includes(artifact.confidence)) {
        violations.push('confidence must be "high", "medium", or "low"')
    }
    if (typeof artifact.score !== 'number') {
        violations.push('score must be a number')
    }

    // Validate optional fields
    if ('applied' in artifact && typeof artifact.applied !== 'boolean') {
        violations.push('applied must be a boolean')
    }
    if ('diff' in artifact && !Array.isArray(artifact.diff)) {
        violations.push('diff must be an array')
    }
    if ('plan' in artifact && !Array.isArray(artifact.plan)) {
        violations.push('plan must be an array')
    }

    return violations
}

async function main() {
    console.log('Validating artifact schema...\n')

    try {
        const files = readdirSync(ARTIFACTS_DIR).filter((f) => f.endsWith('.json') && f !== '.gitkeep')

        if (files.length === 0) {
            console.log('No artifact files found to validate')
            return
        }

        console.log(`Checking ${files.length} artifact file(s)...\n`)

        let totalViolations = 0
        const violatedFiles = []

        for (const file of files) {
            const path = join(ARTIFACTS_DIR, file)
            let artifact

            try {
                artifact = JSON.parse(readFileSync(path, 'utf-8'))
            } catch (err) {
                console.error(`❌ ${file}: Invalid JSON - ${err.message}`)
                totalViolations++
                violatedFiles.push(file)
                continue
            }

            const violations = validateArtifact(artifact, file)

            if (violations.length > 0) {
                console.error(`❌ ${file}:`)
                for (const violation of violations) {
                    console.error(`   - ${violation}`)
                }
                console.error('')
                totalViolations += violations.length
                violatedFiles.push(file)
            }
        }

        if (totalViolations > 0) {
            console.error(`❌ Found ${totalViolations} schema violation(s) in ${violatedFiles.length} file(s)`)
            process.exit(1)
        }

        console.log(`✅ All ${files.length} artifact file(s) valid`)
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.log('Artifacts directory not found (no artifacts to validate)')
            return
        }
        throw err
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
