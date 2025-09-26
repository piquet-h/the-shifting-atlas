import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'
import {DIRECTIONS, isDirection} from '../src/domainModels.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

interface SeedLocation {
    id: string
    name: string
    exits?: {direction: string; to: string}[]
}

function loadSeed(): SeedLocation[] {
    const p = resolve(__dirname, '../src/data/villageLocations.json')
    return JSON.parse(readFileSync(p, 'utf8'))
}

function collectInvalidDirections(seed: SeedLocation[]) {
    const invalid: {loc: string; dir: string}[] = []
    for (const loc of seed) {
        if (!loc.exits) continue
        for (const ex of loc.exits) {
            if (!isDirection(ex.direction)) invalid.push({loc: loc.name, dir: ex.direction})
        }
    }
    return invalid
}

test('seedDirections: all exits use canonical directions', () => {
    const seed = loadSeed()
    const invalid = collectInvalidDirections(seed)
    if (invalid.length) {
        console.error('\nInvalid directions discovered:')
        for (const row of invalid) console.error(` - ${row.dir} (in ${row.loc})`)
    }
    assert.equal(invalid.length, 0, 'Seed contains non-canonical direction tokens')
})

test('seedDirections: direction list includes expected baseline', () => {
    for (const d of ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'in', 'out']) {
        assert.ok(DIRECTIONS.includes(d as any), `Missing baseline direction ${d}`)
    }
})
