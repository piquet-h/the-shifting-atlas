#!/usr/bin/env node
/**
 * Implicit Exit Analyser
 *
 * Scans location descriptions in villageLocations.json for directional language
 * patterns and reports directions that are narratively implied but not yet
 * represented as explicit exits or exitAvailability entries.
 *
 * Output: structured JSON report with locationId, direction, evidence phrase,
 * confidence, and suggested availability (pending | forbidden).
 *
 * Usage:
 *   node scripts/analyze-implicit-exits.mjs [--data=path] [--output=report.json]
 *
 * Options:
 *   --data=<path>      Path to locations JSON (default: backend/src/data/villageLocations.json)
 *   --output=<path>    Write JSON report to file instead of stdout
 *   --help, -h         Show this help message
 *
 * Exit Codes:
 *   0 - Analysis complete (candidates may or may not exist)
 *   1 - Fatal error (file not found, JSON parse error)
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const PROJECT_ROOT = resolve(new URL('..', import.meta.url).pathname)
const DEFAULT_DATA_PATH = 'backend/src/data/villageLocations.json'

/** All canonical direction values. */
const DIRECTIONS = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'in', 'out']

/**
 * Pattern library for detecting directional language in descriptions.
 *
 * Each entry is:
 *   { pattern: RegExp, direction: string|null, availability: 'pending'|'forbidden', confidence: 'high'|'medium'|'low' }
 *
 * When direction is null the pattern contains a named capture group `dir`
 * that matches a direction word which is then normalised.
 */
const PATTERNS = [
    // --- Forbidden indicators (high confidence) ---
    {
        pattern: /sheer\s+cliff(?:s)?\s+(?:to\s+the\s+|block(?:s|ing)?\s+(?:passage\s+)?|bar(?:s)?\s+(?:passage\s+)?)(?<dir>north(?:east|west)?|south(?:east|west)?|east|west|up|down)/i,
        direction: null,
        availability: 'forbidden',
        confidence: 'high',
    },
    {
        pattern: /(?<dir>north(?:east|west)?|south(?:east|west)?|east|west|up|down)[^\n.!?]{0,40}(?:sheer\s+cliff|impassable|no\s+way\s+(?:through|forward|past)|blocked)/i,
        direction: null,
        availability: 'forbidden',
        confidence: 'high',
    },
    {
        pattern: /(?:blocked|impassable|no\s+way\s+(?:through|forward|past)|bars?\s+passage|no\s+(?:safe\s+)?crossing)[^\n.!?]{0,40}(?<dir>north(?:east|west)?|south(?:east|west)?|east|west|up|down)/i,
        direction: null,
        availability: 'forbidden',
        confidence: 'high',
    },
    {
        pattern: /(?<dir>north(?:east|west)?|south(?:east|west)?|east|west|up|down)[^\n.!?]{0,40}(?:blocked|impassable|no\s+way\s+(?:through|forward|past)|bars?\s+passage)/i,
        direction: null,
        availability: 'forbidden',
        confidence: 'high',
    },
    // cliff/wall to a direction — high confidence forbidden
    {
        pattern: /(?:cliff|sheer\s+drop|sheer\s+face|rock\s+face|stone\s+wall)[^\n.!?]{0,30}(?<dir>north(?:east|west)?|south(?:east|west)?|east|west|up|down)/i,
        direction: null,
        availability: 'forbidden',
        confidence: 'high',
    },
    {
        pattern: /(?<dir>north(?:east|west)?|south(?:east|west)?|east|west|up|down)[^\n.!?]{0,30}(?:cliff|sheer\s+drop|sheer\s+face|rock\s+face)/i,
        direction: null,
        availability: 'forbidden',
        confidence: 'high',
    },

    // --- Pending indicators (medium confidence) ---
    // "to the north", "northward", "to the south", etc.
    {
        pattern: /\bto\s+the\s+(?<dir>north(?:east|west)?|south(?:east|west)?|east|west)\b/i,
        direction: null,
        availability: 'pending',
        confidence: 'medium',
    },
    {
        pattern: /\b(?<dir>north|south|east|west)ward\b/i,
        direction: null,
        availability: 'pending',
        confidence: 'medium',
    },
    {
        pattern: /\brises?\s+(?:toward|to(?:wards?)?)\s+the\s+(?<dir>north(?:east|west)?|south(?:east|west)?|east|west)\b/i,
        direction: null,
        availability: 'pending',
        confidence: 'medium',
    },
    {
        pattern: /\bstretches?\s+(?:toward|to(?:wards?)?|beyond|into)\b[^\n.!?]{0,30}(?<dir>north(?:east|west)?|south(?:east|west)?|east|west)\b/i,
        direction: null,
        availability: 'pending',
        confidence: 'medium',
    },
    {
        pattern: /\b(?<dir>north(?:east|west)?|south(?:east|west)?|east|west)[^\n.!?]{0,30}(?:stretch(?:es|ing)?|extend(?:s|ing)?|recede(?:s|ing)?|rise(?:s|ing)?|lead(?:s|ing)?|continue(?:s|ing)?|open(?:s|ing)?)\b/i,
        direction: null,
        availability: 'pending',
        confidence: 'medium',
    },
    // "hills rise to the north", "open plain stretches west"
    {
        pattern: /\b(?:hill(?:s)?|plain(?:s)?|road|path|track|lane|trail|forest|wood(?:s)?|field(?:s)?|moor(?:s)?|valley|river)\b[^\n.!?]{0,30}\b(?<dir>north(?:east|west)?|south(?:east|west)?|east|west)\b/i,
        direction: null,
        availability: 'pending',
        confidence: 'medium',
    },

    // --- Pending indicators (low confidence / ambiguous) ---
    // "distant mountains north" — directional mention without strong verb
    {
        pattern: /\b(?:distant|far|beyond|across)[^\n.!?]{0,30}(?<dir>north(?:east|west)?|south(?:east|west)?|east|west)\b/i,
        direction: null,
        availability: 'pending',
        confidence: 'low',
    },
    {
        pattern: /\b(?<dir>north(?:east|west)?|south(?:east|west)?|east|west)[^\n.!?]{0,30}(?:distant|horizon|far|yonder)\b/i,
        direction: null,
        availability: 'pending',
        confidence: 'low',
    },
]

/** Direction word aliases used in pattern captures → canonical Direction. */
const DIRECTION_NORMALISE = {
    north: 'north',
    northeast: 'northeast',
    northwest: 'northwest',
    south: 'south',
    southeast: 'southeast',
    southwest: 'southwest',
    east: 'east',
    west: 'west',
    up: 'up',
    down: 'down',
    in: 'in',
    out: 'out',
}

/**
 * Normalise raw captured direction word to canonical Direction or null.
 * @param {string} raw
 * @returns {string|null}
 */
function normaliseDirection(raw) {
    const key = raw.toLowerCase().replace(/\s+/g, '')
    return DIRECTION_NORMALISE[key] ?? null
}

/**
 * Determine whether a direction already has explicit coverage in a location:
 * - hard exit in `exits[]`
 * - pending entry in `exitAvailability.pending`
 * - forbidden entry in `exitAvailability.forbidden`
 *
 * @param {object} location
 * @param {string} direction
 * @returns {boolean}
 */
function directionAlreadyCovered(location, direction) {
    // Check hard exits
    const exits = location.exits ?? []
    if (exits.some((e) => e.direction === direction)) {
        return true
    }
    // Check exitAvailability.pending
    const pending = location.exitAvailability?.pending ?? {}
    if (direction in pending) {
        return true
    }
    // Check exitAvailability.forbidden
    const forbidden = location.exitAvailability?.forbidden ?? {}
    if (direction in forbidden) {
        return true
    }
    return false
}

/**
 * Confidence priority for deduplication: prefer forbidden over pending,
 * and prefer higher confidence over lower.
 *
 * @param {'pending'|'forbidden'} availA
 * @param {'high'|'medium'|'low'} confA
 * @param {'pending'|'forbidden'} availB
 * @param {'high'|'medium'|'low'} confB
 * @returns {boolean} true if A should replace B
 */
function hasHigherPriority(availA, confA, availB, confB) {
    // forbidden always beats pending
    if (availA === 'forbidden' && availB === 'pending') return true
    if (availA === 'pending' && availB === 'forbidden') return false
    // same availability — compare confidence
    const rank = { high: 2, medium: 1, low: 0 }
    return rank[confA] > rank[confB]
}

/**
 * Extract the matched phrase from text for a given pattern match.
 *
 * @param {string} text
 * @param {RegExpExecArray} match
 * @returns {string}
 */
function extractPhrase(text, match) {
    // Return a trimmed window of ±30 chars around the match
    const start = Math.max(0, match.index - 10)
    const end = Math.min(text.length, match.index + match[0].length + 10)
    let phrase = text.slice(start, end).trim()
    if (start > 0) phrase = '…' + phrase
    if (end < text.length) phrase = phrase + '…'
    return phrase
}

/**
 * Analyse a single location and return candidate implicit exit entries.
 *
 * @param {object} location
 * @returns {Array<{locationId:string, locationName:string, direction:string, evidencePhrase:string, confidence:string, suggestedAvailability:string}>}
 */
export function analyseLocation(location) {
    const { id, name, description } = location

    if (!description) {
        return []
    }

    // Map direction → best candidate so far
    /** @type {Map<string, {evidencePhrase:string, confidence:string, suggestedAvailability:string}>} */
    const candidates = new Map()

    for (const entry of PATTERNS) {
        const regex = new RegExp(entry.pattern.source, entry.pattern.flags.includes('g') ? entry.pattern.flags : entry.pattern.flags + 'g')
        let match
        while ((match = regex.exec(description)) !== null) {
            const rawDir = match.groups?.dir ?? null
            if (!rawDir) continue

            const direction = normaliseDirection(rawDir)
            if (!direction) continue

            // Skip if this direction already has explicit coverage
            if (directionAlreadyCovered(location, direction)) continue

            const phrase = extractPhrase(description, match)
            const existing = candidates.get(direction)

            if (!existing || hasHigherPriority(entry.availability, entry.confidence, existing.suggestedAvailability, existing.confidence)) {
                candidates.set(direction, {
                    evidencePhrase: phrase,
                    confidence: entry.confidence,
                    suggestedAvailability: entry.availability,
                })
            }
        }
    }

    return Array.from(candidates.entries()).map(([direction, data]) => ({
        locationId: id,
        locationName: name,
        direction,
        evidencePhrase: data.evidencePhrase,
        confidence: data.confidence,
        suggestedAvailability: data.suggestedAvailability,
    }))
}

/**
 * Analyse all locations and return the full report.
 *
 * @param {object[]} locations
 * @returns {{ scannedAt: string, summary: object, candidates: object[], skipped: object[] }}
 */
export function analyseLocations(locations) {
    const scannedAt = new Date().toISOString()
    const candidates = []
    const skipped = []

    for (const location of locations) {
        if (!location.description) {
            skipped.push({ locationId: location.id, locationName: location.name, reason: 'no description field' })
            continue
        }
        const found = analyseLocation(location)
        candidates.push(...found)
    }

    return {
        scannedAt,
        summary: {
            totalLocations: locations.length,
            locationsWithCandidates: new Set(candidates.map((c) => c.locationId)).size,
            skippedLocations: skipped.length,
            totalCandidates: candidates.length,
            highConfidence: candidates.filter((c) => c.confidence === 'high').length,
            mediumConfidence: candidates.filter((c) => c.confidence === 'medium').length,
            lowConfidence: candidates.filter((c) => c.confidence === 'low').length,
            pendingSuggested: candidates.filter((c) => c.suggestedAvailability === 'pending').length,
            forbiddenSuggested: candidates.filter((c) => c.suggestedAvailability === 'forbidden').length,
        },
        candidates,
        skipped,
    }
}

/**
 * Load and validate a locations JSON file.
 *
 * @param {string} dataPath  Relative to project root
 * @returns {Promise<object[]>}
 */
async function loadLocations(dataPath) {
    const absPath = resolve(PROJECT_ROOT, dataPath)

    // Security: only allow files within the project directory
    if (!absPath.startsWith(PROJECT_ROOT + '/') && absPath !== PROJECT_ROOT) {
        throw new Error(`Path "${dataPath}" resolves outside the project directory for security reasons.`)
    }

    let raw
    try {
        raw = await readFile(absPath, 'utf8')
    } catch {
        throw new Error(`Failed to load location data from "${dataPath}": file not found or unreadable.`)
    }

    let data
    try {
        data = JSON.parse(raw)
    } catch {
        throw new Error(`Failed to parse location data from "${dataPath}": invalid JSON.`)
    }

    if (!Array.isArray(data)) {
        throw new Error(`Location data in "${dataPath}" must be a JSON array.`)
    }

    return data
}

function printHelp() {
    console.log(`Implicit Exit Analyser
Scans location descriptions for directional language and reports implied exits.

Usage:
  node scripts/analyze-implicit-exits.mjs [options]

Options:
  --data=<path>      Path to locations JSON file relative to project root
                     (default: ${DEFAULT_DATA_PATH})
  --output=<path>    Write JSON report to file instead of stdout
  --help, -h         Show this help message

Examples:
  node scripts/analyze-implicit-exits.mjs
  node scripts/analyze-implicit-exits.mjs --output=report.json
  node scripts/analyze-implicit-exits.mjs --data=backend/src/data/villageLocations.json

Workflow:
  1. Run this script → review the output JSON report
  2. Curate candidates into scripts/implicit-exits-additions.json
  3. Run scripts/apply-implicit-exits.mjs to merge into villageLocations.json
`)
}

async function main() {
    const args = process.argv.slice(2)
    let dataPath = DEFAULT_DATA_PATH
    let outputFile = null

    for (const arg of args) {
        if (arg === '--help' || arg === '-h') {
            printHelp()
            process.exit(0)
        } else if (arg.startsWith('--data=')) {
            dataPath = arg.substring('--data='.length)
        } else if (arg.startsWith('--output=')) {
            outputFile = arg.substring('--output='.length)
        } else {
            console.error(`Unknown option: ${arg}`)
            printHelp()
            process.exit(1)
        }
    }

    try {
        const locations = await loadLocations(dataPath)
        const report = analyseLocations(locations)

        const jsonOutput = JSON.stringify(report, null, 2)

        if (outputFile) {
            const absOutput = resolve(PROJECT_ROOT, outputFile)
            await writeFile(absOutput, jsonOutput, 'utf8')
            console.log(`✓ Analysis report written to ${outputFile}`)
        } else {
            console.log(jsonOutput)
        }

        // Summary to stderr
        const s = report.summary
        console.error(`\nAnalysis Summary:`)
        console.error(`  Locations scanned:        ${s.totalLocations}`)
        console.error(`  Locations with candidates: ${s.locationsWithCandidates}`)
        console.error(`  Locations skipped:         ${s.skippedLocations}`)
        console.error(`  Total candidates:          ${s.totalCandidates}`)
        console.error(`  High confidence:           ${s.highConfidence}`)
        console.error(`  Medium confidence:         ${s.mediumConfidence}`)
        console.error(`  Low confidence:            ${s.lowConfidence}`)
        console.error(`  Suggested pending:         ${s.pendingSuggested}`)
        console.error(`  Suggested forbidden:       ${s.forbiddenSuggested}`)
        console.error(`\n✓ Review candidates and curate into scripts/implicit-exits-additions.json`)
        console.error(`  Then run: node scripts/apply-implicit-exits.mjs`)
    } catch (error) {
        console.error(`❌ Error: ${error.message}`)
        process.exit(1)
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main()
}
