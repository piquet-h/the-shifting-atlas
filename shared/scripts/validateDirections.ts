#!/usr/bin/env tsx
/**
 * Seed direction validator.
 *
 * Loads the world seed JSON (village locations) and ensures every exit direction
 * is a member of the canonical DIRECTIONS list. Fails the process (exit 1) if
 * any invalid tokens are discovered, printing a concise report.
 *
 * This is Phase N0 hygiene (pre‑normalization) from the navigation roadmap.
 */
import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {DIRECTIONS, isDirection} from '../src/domainModels.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path to the seed file relative to this script.
const seedPath = resolve(__dirname, '../src/data/villageLocations.json')

interface SeedLocation {
    id: string
    name: string
    exits?: {direction: string; to: string}[]
}

function loadSeed(): SeedLocation[] {
    const raw = readFileSync(seedPath, 'utf8')
    try {
        const data = JSON.parse(raw)
        if (!Array.isArray(data)) throw new Error('Seed root is not an array')
        return data
    } catch (err) {
        console.error('Failed to parse seed JSON:', (err as Error).message)
        process.exit(1)
    }
}

function validate() {
    const seed = loadSeed()
    const invalid: {locationId: string; locationName: string; direction: string}[] = []

    for (const loc of seed) {
        if (!loc.exits) continue
        for (const ex of loc.exits) {
            if (!isDirection(ex.direction)) {
                invalid.push({locationId: loc.id, locationName: loc.name, direction: ex.direction})
            }
        }
    }

    if (invalid.length) {
        console.error('\n❌ Invalid direction tokens found in seed:')
        for (const row of invalid) {
            console.error(`  - ${row.direction} (location: ${row.locationName} – ${row.locationId})`)
        }
        console.error(`\nAllowed directions: ${DIRECTIONS.join(', ')}`)
        console.error('\nSeed validation FAILED.')
        process.exit(1)
    } else {
        console.log('✅ Seed directions valid. Total locations:', seed.length)
    }
}

validate()
