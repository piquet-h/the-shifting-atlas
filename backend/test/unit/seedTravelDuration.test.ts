import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

interface SeedExit {
    direction: string
    to: string
    description?: string
    travelDurationMs?: number
}

interface SeedLocation {
    id: string
    name: string
    exits?: SeedExit[]
}

function loadSeed(): SeedLocation[] {
    const p = resolve(process.cwd(), 'src/data/villageLocations.json')
    return JSON.parse(readFileSync(p, 'utf8'))
}

test('seedTravelDuration: every exit declares a positive travelDurationMs', () => {
    const seed = loadSeed()

    const missing: Array<{ location: string; direction: string; to: string }> = []
    const invalid: Array<{ location: string; direction: string; to: string; value: unknown }> = []

    for (const loc of seed) {
        for (const ex of loc.exits ?? []) {
            if (ex.travelDurationMs === undefined) {
                missing.push({ location: loc.name, direction: ex.direction, to: ex.to })
                continue
            }
            if (typeof ex.travelDurationMs !== 'number' || !Number.isFinite(ex.travelDurationMs) || ex.travelDurationMs <= 0) {
                invalid.push({ location: loc.name, direction: ex.direction, to: ex.to, value: ex.travelDurationMs })
            }
        }
    }

    if (missing.length || invalid.length) {
        console.error('\nSeed exits missing/invalid travelDurationMs:')
        for (const row of missing.slice(0, 25)) {
            console.error(` - MISSING: ${row.location} (${row.direction} → ${row.to})`)
        }
        for (const row of invalid.slice(0, 25)) {
            console.error(` - INVALID: ${row.location} (${row.direction} → ${row.to}) = ${String(row.value)}`)
        }
        if (missing.length > 25 || invalid.length > 25) {
            console.error(` ... and more (missing=${missing.length}, invalid=${invalid.length})`)
        }
    }

    assert.equal(missing.length, 0, 'Seed contains exits without travelDurationMs')
    assert.equal(invalid.length, 0, 'Seed contains exits with invalid travelDurationMs')
})
