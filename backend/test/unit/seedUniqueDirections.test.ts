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
    const p = resolve(process.cwd(), 'src/data/villageLocations.json')
    return JSON.parse(readFileSync(p, 'utf8'))
}

// Ensures each location has at most one exit per direction (pub test fairness: no ambiguous duplicate options)
test('seedUniqueDirections: no duplicate direction tokens per location', () => {
    const seed = loadSeed()
    const dupDiagnostics: string[] = []
    for (const loc of seed) {
        if (!loc.exits || loc.exits.length === 0) continue
        const seen = new Map<string, string>()
        for (const ex of loc.exits) {
            const existing = seen.get(ex.direction)
            if (existing && existing !== ex.to) {
                dupDiagnostics.push(`${loc.name}: direction '${ex.direction}' points to both ${existing} and ${ex.to}`)
            } else if (existing && existing === ex.to) {
                dupDiagnostics.push(`${loc.name}: duplicate exit '${ex.direction}' to same target ${ex.to}`)
            } else {
                seen.set(ex.direction, ex.to)
            }
        }
    }
    if (dupDiagnostics.length) {
        console.error('\nDuplicate direction exits discovered:')
        for (const line of dupDiagnostics) console.error(' - ' + line)
    }
    assert.equal(dupDiagnostics.length, 0, 'Seed contains duplicate exit directions in one or more locations')
})

// Guard against two different directions pointing to the same target within the same location.
test('seedUniqueDirections: no two directions lead to the same target location', () => {
    const seed = loadSeed()
    const dupDiagnostics: string[] = []
    for (const loc of seed) {
        if (!loc.exits || loc.exits.length === 0) continue
        const seenTargets = new Map<string, string>()
        for (const ex of loc.exits) {
            if (!ex.to) continue
            const existing = seenTargets.get(ex.to)
            if (existing) {
                dupDiagnostics.push(`${loc.name}: both '${existing}' and '${ex.direction}' lead to ${ex.to}`)
            } else {
                seenTargets.set(ex.to, ex.direction)
            }
        }
    }
    if (dupDiagnostics.length) {
        console.error('\nDuplicate target exits discovered:')
        for (const line of dupDiagnostics) console.error(' - ' + line)
    }
    assert.equal(dupDiagnostics.length, 0, 'Seed contains exits where two directions lead to the same location')
})

// Soft sanity: Extremely high exit counts can overwhelm players (pub test cognitive load). Allow hub up to 10.
// Adjust threshold if design expands. Currently highest is Mosswell River Jetty (9) and Junction (8).
test('seedUniqueDirections: exit count sane (<=10)', () => {
    const seed = loadSeed()
    const offenders: string[] = []
    for (const loc of seed) {
        const count = loc.exits?.length || 0
        if (count > 10) offenders.push(`${loc.name} has ${count} exits`)
    }
    if (offenders.length) {
        console.error('\nLocations exceeding exit count threshold:')
        for (const o of offenders) console.error(' - ' + o)
    }
    assert.equal(offenders.length, 0, 'One or more locations exceed maximum recommended exit count (10)')
})
