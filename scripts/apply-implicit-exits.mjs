#!/usr/bin/env node
/**
 * Apply Implicit Exits
 *
 * Merges curated additions from scripts/implicit-exits-additions.json into
 * backend/src/data/villageLocations.json without overwriting existing hard
 * exits or exitAvailability entries.
 *
 * Usage:
 *   node scripts/apply-implicit-exits.mjs [options]
 *
 * Options:
 *   --data=<path>       Path to locations JSON (default: backend/src/data/villageLocations.json)
 *   --additions=<path>  Path to curated additions JSON (default: scripts/implicit-exits-additions.json)
 *   --dry-run           Show proposed changes without modifying any file
 *   --help, -h          Show this help message
 *
 * Additions JSON format:
 *   Array of entries:
 *   [
 *     {
 *       "locationId": "<uuid>",
 *       "direction": "north",
 *       "availability": "pending",
 *       "reason": "Open countryside awaiting exploration"
 *     },
 *     {
 *       "locationId": "<uuid>",
 *       "direction": "west",
 *       "availability": "forbidden",
 *       "reason": "Sheer cliffs block passage",
 *       "motif": "cliff",
 *       "reveal": "onLook"
 *     }
 *   ]
 *
 * Exit Codes:
 *   0 - Success (or dry-run completed)
 *   1 - Fatal error
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PROJECT_ROOT = resolve(new URL('..', import.meta.url).pathname)
const DEFAULT_DATA_PATH = 'backend/src/data/villageLocations.json'
const DEFAULT_ADDITIONS_PATH = 'scripts/implicit-exits-additions.json'

const VALID_DIRECTIONS = new Set(['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'in', 'out'])
const VALID_AVAILABILITY = new Set(['pending', 'forbidden'])
const VALID_MOTIFS = new Set(['cliff', 'ward', 'water', 'law', 'ruin'])
const VALID_REVEALS = new Set(['onLook', 'onTryMove'])

/**
 * Load and parse a JSON file within the project directory.
 *
 * @param {string} relPath  Relative (or absolute within project) path
 * @returns {Promise<unknown>}
 */
async function loadJson(relPath) {
    const absPath = resolve(PROJECT_ROOT, relPath)
    if (!absPath.startsWith(PROJECT_ROOT + '/') && absPath !== PROJECT_ROOT) {
        throw new Error(`Path "${relPath}" resolves outside the project directory for security reasons.`)
    }
    let raw
    try {
        raw = await readFile(absPath, 'utf8')
    } catch {
        throw new Error(`Failed to read "${relPath}": file not found or unreadable.`)
    }
    try {
        return JSON.parse(raw)
    } catch {
        throw new Error(`Failed to parse "${relPath}": invalid JSON.`)
    }
}

/**
 * Validate a single addition entry.
 *
 * @param {unknown} entry
 * @param {number} index
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAdditionEntry(entry, index) {
    const errors = []
    const prefix = `additions[${index}]`

    if (!entry || typeof entry !== 'object') {
        return { valid: false, errors: [`${prefix}: must be an object`] }
    }

    if (typeof entry.locationId !== 'string' || !entry.locationId) {
        errors.push(`${prefix}.locationId: required string`)
    }
    if (typeof entry.direction !== 'string' || !VALID_DIRECTIONS.has(entry.direction)) {
        errors.push(`${prefix}.direction: must be one of ${[...VALID_DIRECTIONS].join(', ')}`)
    }
    if (typeof entry.availability !== 'string' || !VALID_AVAILABILITY.has(entry.availability)) {
        errors.push(`${prefix}.availability: must be 'pending' or 'forbidden'`)
    }
    if (typeof entry.reason !== 'string' || !entry.reason) {
        errors.push(`${prefix}.reason: required non-empty string`)
    }
    if (entry.motif !== undefined && !VALID_MOTIFS.has(entry.motif)) {
        errors.push(`${prefix}.motif: must be one of ${[...VALID_MOTIFS].join(', ')} (or omit)`)
    }
    if (entry.reveal !== undefined && !VALID_REVEALS.has(entry.reveal)) {
        errors.push(`${prefix}.reveal: must be 'onLook' or 'onTryMove' (or omit)`)
    }
    if (entry.availability === 'pending' && (entry.motif !== undefined || entry.reveal !== undefined)) {
        errors.push(`${prefix}: motif and reveal are only valid for 'forbidden' entries`)
    }

    return { valid: errors.length === 0, errors }
}

/**
 * Determine whether a direction already has explicit coverage in a location.
 *
 * @param {object} location
 * @param {string} direction
 * @returns {boolean}
 */
export function directionAlreadyCovered(location, direction) {
    const exits = location.exits ?? []
    if (exits.some((e) => e.direction === direction)) return true
    const pending = location.exitAvailability?.pending ?? {}
    if (direction in pending) return true
    const forbidden = location.exitAvailability?.forbidden ?? {}
    if (direction in forbidden) return true
    return false
}

/**
 * Apply a validated set of additions to locations array (mutates in-place).
 *
 * Returns an array of change records for reporting.
 *
 * @param {object[]} locations
 * @param {object[]} additions
 * @returns {{ applied: object[], skipped: object[] }}
 */
export function applyAdditions(locations, additions) {
    const locationMap = new Map(locations.map((loc) => [loc.id, loc]))
    const applied = []
    const skipped = []

    for (const addition of additions) {
        const { locationId, direction, availability, reason, motif, reveal } = addition
        const location = locationMap.get(locationId)

        if (!location) {
            skipped.push({ ...addition, skipReason: 'location not found' })
            continue
        }

        if (directionAlreadyCovered(location, direction)) {
            skipped.push({ ...addition, skipReason: 'direction already covered (hard exit or existing availability entry)' })
            continue
        }

        // Ensure exitAvailability object exists
        if (!location.exitAvailability) {
            location.exitAvailability = {}
        }

        if (availability === 'pending') {
            if (!location.exitAvailability.pending) {
                location.exitAvailability.pending = {}
            }
            location.exitAvailability.pending[direction] = reason
        } else {
            // forbidden
            if (!location.exitAvailability.forbidden) {
                location.exitAvailability.forbidden = {}
            }
            const entry = { reason }
            if (motif) entry.motif = motif
            if (reveal) entry.reveal = reveal
            location.exitAvailability.forbidden[direction] = entry
        }

        applied.push({ locationId, locationName: location.name, direction, availability, reason })
    }

    return { applied, skipped }
}

function printHelp() {
    console.log(`Apply Implicit Exits
Merges curated additions from a JSON file into villageLocations.json.

Usage:
  node scripts/apply-implicit-exits.mjs [options]

Options:
  --data=<path>       Path to locations JSON file relative to project root
                      (default: ${DEFAULT_DATA_PATH})
  --additions=<path>  Path to curated additions JSON file relative to project root
                      (default: ${DEFAULT_ADDITIONS_PATH})
  --dry-run           Show proposed changes without modifying any file
  --help, -h          Show this help message

Additions JSON format:
  [
    { "locationId": "<uuid>", "direction": "north", "availability": "pending", "reason": "..." },
    { "locationId": "<uuid>", "direction": "west", "availability": "forbidden", "reason": "...", "motif": "cliff" }
  ]

Workflow:
  1. Run node scripts/analyze-implicit-exits.mjs to generate a candidate report
  2. Curate candidates into ${DEFAULT_ADDITIONS_PATH}
  3. Run this script with --dry-run to preview changes
  4. Run without --dry-run to apply and review git diff before committing
`)
}

async function main() {
    const args = process.argv.slice(2)
    let dataPath = DEFAULT_DATA_PATH
    let additionsPath = DEFAULT_ADDITIONS_PATH
    let dryRun = false

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            printHelp()
            process.exit(0)
        } else if (arg === '--dry-run') {
            dryRun = true
        } else if (arg.startsWith('--data=')) {
            dataPath = arg.substring('--data='.length)
        } else if (arg.startsWith('--additions=')) {
            additionsPath = arg.substring('--additions='.length)
        } else {
            console.error(`Unknown option: ${arg}`)
            printHelp()
            process.exit(1)
        }
    }

    try {
        // Load locations
        const locations = await loadJson(dataPath)
        if (!Array.isArray(locations)) {
            throw new Error(`Location data in "${dataPath}" must be a JSON array.`)
        }

        // Load additions
        const additions = await loadJson(additionsPath)
        if (!Array.isArray(additions)) {
            throw new Error(`Additions data in "${additionsPath}" must be a JSON array.`)
        }

        // Validate all additions
        const validationErrors = []
        for (let i = 0; i < additions.length; i++) {
            const { errors } = validateAdditionEntry(additions[i], i)
            validationErrors.push(...errors)
        }
        if (validationErrors.length > 0) {
            console.error(`❌ Validation errors in additions file:`)
            for (const err of validationErrors) {
                console.error(`  - ${err}`)
            }
            process.exit(1)
        }

        // Apply (on a deep clone for dry-run, or in-place for real run)
        const workingLocations = dryRun ? JSON.parse(JSON.stringify(locations)) : locations
        const { applied, skipped } = applyAdditions(workingLocations, additions)

        // Report
        if (applied.length === 0 && skipped.length === 0) {
            console.log('ℹ No additions to process.')
        }

        if (applied.length > 0) {
            console.log(`\n${dryRun ? '[DRY RUN] Would apply' : 'Applied'} ${applied.length} addition(s):`)
            for (const a of applied) {
                console.log(`  ✓ ${a.locationName} (${a.locationId}): ${a.direction} → ${a.availability}`)
            }
        }

        if (skipped.length > 0) {
            console.log(`\nSkipped ${skipped.length} addition(s):`)
            for (const s of skipped) {
                console.log(`  ⚠ ${s.locationId} / ${s.direction}: ${s.skipReason}`)
            }
        }

        if (!dryRun && applied.length > 0) {
            const absData = resolve(PROJECT_ROOT, dataPath)
            await writeFile(absData, JSON.stringify(workingLocations, null, 4), 'utf8')
            console.log(`\n✅ ${dataPath} updated. Review git diff before committing.`)
        } else if (dryRun) {
            console.log('\n[DRY RUN] No files were modified.')
        }
    } catch (error) {
        console.error(`❌ Error: ${error.message}`)
        process.exit(1)
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main()
}
