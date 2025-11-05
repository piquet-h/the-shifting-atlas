import { DIRECTIONS, isDirection } from '@piquet-h/shared'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

interface SeedLocation {
    id: string
    name: string
    exits?: { direction: string; to: string }[]
}

function loadSeed(): SeedLocation[] {
    // Using process.cwd() keeps the path stable regardless of ESM __dirname semantics.
    const p = resolve(process.cwd(), 'src/data/villageLocations.json')
    return JSON.parse(readFileSync(p, 'utf8'))
}

test('seedIntegrity: all exit directions are canonical', () => {
    const seed = loadSeed()
    const invalid: { loc: string; dir: string }[] = []
    for (const loc of seed) {
        if (!loc.exits) continue
        for (const ex of loc.exits) {
            if (!isDirection(ex.direction)) invalid.push({ loc: loc.name, dir: ex.direction })
        }
    }
    if (invalid.length) {
        // Provide diagnostic output if failure occurs.
        console.error('\nInvalid directions discovered:')
        for (const row of invalid) {
            console.error(` - ${row.dir} (in ${row.loc})`)
        }
    }
    assert.equal(invalid.length, 0, 'Seed contains non-canonical direction tokens')
})

test('seedIntegrity: canonical direction baseline present', () => {
    const baseline = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'in', 'out']
    for (const d of baseline) {
        assert.ok(DIRECTIONS.includes(d as (typeof DIRECTIONS)[number]), `Missing baseline direction ${d}`)
    }
})

test('seedIntegrity: shrine exit direction remains "east" (regression guard)', () => {
    const seed = loadSeed()
    const shrine = seed.find((l) => /Shrine/i.test(l.name))
    assert.ok(shrine, 'Shrine location not found in seed')
    const exits = shrine!.exits || []
    const hasEast = exits.some((e) => e.direction === 'east')
    assert.ok(hasEast, 'Shrine must have an east exit (regression guard)')
})
