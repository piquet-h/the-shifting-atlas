import assert from 'node:assert/strict'
import test from 'node:test'
import { ExitEdge } from '../src/domainModels.js'
import { exitsSummaryEquals, generateExitsSummary } from '../src/utils/exitsSummaryGenerator.js'

// ---------------------------------------------------------------------------
// Basic functionality
// ---------------------------------------------------------------------------
test('generateExitsSummary: no exits', () => {
    const result = generateExitsSummary([])
    assert.equal(result, 'No visible exits')
})

test('generateExitsSummary: single exit', () => {
    const exits: ExitEdge[] = [{ direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' }]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exit: north')
})

test('generateExitsSummary: single exit with description', () => {
    const exits: ExitEdge[] = [{ direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2', description: 'archway' }]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exit: north (archway)')
})

test('generateExitsSummary: multiple exits', () => {
    const exits: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exits: north, east')
})

test('generateExitsSummary: multiple exits with mixed descriptions', () => {
    const exits: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2', description: 'north gate' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' },
        { direction: 'in', fromLocationId: 'loc1', toLocationId: 'loc4', description: 'arena floor' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exits: north (north gate), east, in (arena floor)')
})

// ---------------------------------------------------------------------------
// Deterministic ordering
// ---------------------------------------------------------------------------
test('generateExitsSummary: cardinal directions in order', () => {
    const exits: ExitEdge[] = [
        { direction: 'west', fromLocationId: 'loc1', toLocationId: 'loc4' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' },
        { direction: 'south', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc5' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exits: north, south, east, west')
})

test('generateExitsSummary: intercardinal directions in order', () => {
    const exits: ExitEdge[] = [
        { direction: 'southwest', fromLocationId: 'loc1', toLocationId: 'loc4' },
        { direction: 'northeast', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'southeast', fromLocationId: 'loc1', toLocationId: 'loc3' },
        { direction: 'northwest', fromLocationId: 'loc1', toLocationId: 'loc5' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exits: northeast, northwest, southeast, southwest')
})

test('generateExitsSummary: all direction types mixed', () => {
    const exits: ExitEdge[] = [
        { direction: 'out', fromLocationId: 'loc1', toLocationId: 'loc12' },
        { direction: 'in', fromLocationId: 'loc1', toLocationId: 'loc11' },
        { direction: 'down', fromLocationId: 'loc1', toLocationId: 'loc10' },
        { direction: 'up', fromLocationId: 'loc1', toLocationId: 'loc9' },
        { direction: 'southwest', fromLocationId: 'loc1', toLocationId: 'loc8' },
        { direction: 'southeast', fromLocationId: 'loc1', toLocationId: 'loc7' },
        { direction: 'northwest', fromLocationId: 'loc1', toLocationId: 'loc6' },
        { direction: 'northeast', fromLocationId: 'loc1', toLocationId: 'loc5' },
        { direction: 'west', fromLocationId: 'loc1', toLocationId: 'loc4' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' },
        { direction: 'south', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc1' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exits: north, south, east, west, northeast, northwest, southeast, southwest, up, down, in, out')
})

test('generateExitsSummary: determinism - same exits always produce same output', () => {
    const exits1: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' },
        { direction: 'south', fromLocationId: 'loc1', toLocationId: 'loc4' }
    ]
    const exits2: ExitEdge[] = [
        { direction: 'south', fromLocationId: 'loc1', toLocationId: 'loc4' },
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' }
    ]
    const result1 = generateExitsSummary(exits1)
    const result2 = generateExitsSummary(exits2)
    assert.equal(result1, result2)
    assert.equal(result1, 'Exits: north, south, east')
})

// ---------------------------------------------------------------------------
// Blocked exits
// ---------------------------------------------------------------------------
test('generateExitsSummary: blocked exits are excluded', () => {
    const exits: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3', blocked: true },
        { direction: 'south', fromLocationId: 'loc1', toLocationId: 'loc4' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exits: north, south')
})

test('generateExitsSummary: all blocked exits', () => {
    const exits: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2', blocked: true },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3', blocked: true }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'No visible exits')
})

test('generateExitsSummary: single unblocked exit among blocked', () => {
    const exits: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2', blocked: true },
        { direction: 'south', fromLocationId: 'loc1', toLocationId: 'loc3' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exit: south')
})

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------
test('generateExitsSummary: undefined exits array', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = generateExitsSummary(undefined as any)
    assert.equal(result, 'No visible exits')
})

test('generateExitsSummary: null exits array', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = generateExitsSummary(null as any)
    assert.equal(result, 'No visible exits')
})

test('generateExitsSummary: empty description string', () => {
    const exits: ExitEdge[] = [{ direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2', description: '' }]
    const result = generateExitsSummary(exits)
    // Empty string description should be treated as no description
    assert.equal(result, 'Exit: north')
})

// ---------------------------------------------------------------------------
// exitsSummaryEquals function
// ---------------------------------------------------------------------------
test('exitsSummaryEquals: identical arrays', () => {
    const exits1: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' }
    ]
    const exits2: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' }
    ]
    assert.ok(exitsSummaryEquals(exits1, exits2))
})

test('exitsSummaryEquals: different order but same summary', () => {
    const exits1: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' },
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' }
    ]
    const exits2: ExitEdge[] = [
        { direction: 'east', fromLocationId: 'loc1', toLocationId: 'loc3' },
        { direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' }
    ]
    assert.ok(exitsSummaryEquals(exits1, exits2))
})

test('exitsSummaryEquals: different exits', () => {
    const exits1: ExitEdge[] = [{ direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2' }]
    const exits2: ExitEdge[] = [{ direction: 'south', fromLocationId: 'loc1', toLocationId: 'loc3' }]
    assert.ok(!exitsSummaryEquals(exits1, exits2))
})

test('exitsSummaryEquals: different descriptions', () => {
    const exits1: ExitEdge[] = [{ direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2', description: 'archway' }]
    const exits2: ExitEdge[] = [{ direction: 'north', fromLocationId: 'loc1', toLocationId: 'loc2', description: 'door' }]
    assert.ok(!exitsSummaryEquals(exits1, exits2))
})

test('exitsSummaryEquals: empty arrays', () => {
    assert.ok(exitsSummaryEquals([], []))
})

// ---------------------------------------------------------------------------
// Real-world scenarios
// ---------------------------------------------------------------------------
test('generateExitsSummary: typical room with 4 exits', () => {
    const exits: ExitEdge[] = [
        { direction: 'north', fromLocationId: 'room1', toLocationId: 'room2', description: 'corridor' },
        { direction: 'south', fromLocationId: 'room1', toLocationId: 'room3', description: 'stairwell' },
        { direction: 'east', fromLocationId: 'room1', toLocationId: 'room4' },
        { direction: 'west', fromLocationId: 'room1', toLocationId: 'room5' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exits: north (corridor), south (stairwell), east, west')
})

test('generateExitsSummary: vertical shaft', () => {
    const exits: ExitEdge[] = [
        { direction: 'up', fromLocationId: 'shaft1', toLocationId: 'shaft2', description: 'ladder' },
        { direction: 'down', fromLocationId: 'shaft1', toLocationId: 'shaft3', description: 'rope' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exits: up (ladder), down (rope)')
})

test('generateExitsSummary: entrance area with in/out', () => {
    const exits: ExitEdge[] = [
        { direction: 'in', fromLocationId: 'entrance', toLocationId: 'building', description: 'doorway' },
        { direction: 'out', fromLocationId: 'entrance', toLocationId: 'street' },
        { direction: 'north', fromLocationId: 'entrance', toLocationId: 'plaza' }
    ]
    const result = generateExitsSummary(exits)
    assert.equal(result, 'Exits: north, in (doorway), out')
})
