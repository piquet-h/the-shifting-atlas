import assert from 'node:assert'
import test from 'node:test'
import type { Direction } from '../src/domainModels.js'
import {
    buildExitInfoArray,
    determineExitAvailability,
    isExitAvailability,
    type ExitAvailabilityMetadata,
    type ExitInfo
} from '../src/exitAvailability.js'

// --- Type Guard Tests ---

test('isExitAvailability: valid states', () => {
    assert.ok(isExitAvailability('hard'))
    assert.ok(isExitAvailability('pending'))
    assert.ok(isExitAvailability('forbidden'))
})

test('isExitAvailability: invalid states', () => {
    assert.equal(isExitAvailability('unknown'), false)
    assert.equal(isExitAvailability('open'), false)
    assert.equal(isExitAvailability(''), false)
    assert.equal(isExitAvailability('Hard'), false) // case sensitive
})

// --- determineExitAvailability Tests ---

test('determineExitAvailability: hard exit takes precedence', () => {
    const exits: Partial<Record<Direction, string>> = { north: 'loc-123' }
    const metadata: ExitAvailabilityMetadata = {
        forbidden: { north: 'wall' } // Data error: both hard and forbidden
    }
    
    // Hard exit wins
    const result = determineExitAvailability('north', exits, metadata)
    assert.equal(result, 'hard')
})

test('determineExitAvailability: hard exit without metadata', () => {
    const exits: Partial<Record<Direction, string>> = { east: 'loc-456' }
    
    const result = determineExitAvailability('east', exits, undefined)
    assert.equal(result, 'hard')
})

test('determineExitAvailability: forbidden without exit', () => {
    const metadata: ExitAvailabilityMetadata = {
        forbidden: { south: 'chasm' }
    }
    
    const result = determineExitAvailability('south', undefined, metadata)
    assert.equal(result, 'forbidden')
})

test('determineExitAvailability: pending without exit', () => {
    const metadata: ExitAvailabilityMetadata = {
        pending: { west: 'unexplored' }
    }
    
    const result = determineExitAvailability('west', undefined, metadata)
    assert.equal(result, 'pending')
})

test('determineExitAvailability: forbidden takes precedence over pending', () => {
    const metadata: ExitAvailabilityMetadata = {
        pending: { up: 'ceiling' },
        forbidden: { up: 'solid stone' } // Data error: both pending and forbidden
    }
    
    // Forbidden wins over pending
    const result = determineExitAvailability('up', undefined, metadata)
    assert.equal(result, 'forbidden')
})

test('determineExitAvailability: unknown direction', () => {
    const exits: Partial<Record<Direction, string>> = { north: 'loc-123' }
    const metadata: ExitAvailabilityMetadata = {
        forbidden: { south: 'wall' }
    }
    
    const result = determineExitAvailability('west', exits, metadata)
    assert.equal(result, undefined) // Not configured
})

test('determineExitAvailability: no exits or metadata', () => {
    const result = determineExitAvailability('north', undefined, undefined)
    assert.equal(result, undefined)
})

test('determineExitAvailability: empty metadata objects', () => {
    const metadata: ExitAvailabilityMetadata = {
        pending: {},
        forbidden: {}
    }
    
    const result = determineExitAvailability('north', undefined, metadata)
    assert.equal(result, undefined)
})

// --- buildExitInfoArray Tests ---

test('buildExitInfoArray: single hard exit', () => {
    const exits: Partial<Record<Direction, string>> = { north: 'loc-123' }
    
    const result = buildExitInfoArray(exits, undefined)
    
    assert.equal(result.length, 1)
    assert.equal(result[0].direction, 'north')
    assert.equal(result[0].availability, 'hard')
    assert.equal(result[0].toLocationId, 'loc-123')
    assert.equal(result[0].reason, undefined)
})

test('buildExitInfoArray: multiple hard exits', () => {
    const exits: Partial<Record<Direction, string>> = {
        north: 'loc-123',
        south: 'loc-456',
        east: 'loc-789'
    }
    
    const result = buildExitInfoArray(exits, undefined)
    
    assert.equal(result.length, 3)
    const directions = result.map(e => e.direction)
    assert.ok(directions.includes('north'))
    assert.ok(directions.includes('south'))
    assert.ok(directions.includes('east'))
    assert.ok(result.every(e => e.availability === 'hard'))
})

test('buildExitInfoArray: pending exits with reasons', () => {
    const metadata: ExitAvailabilityMetadata = {
        pending: {
            west: 'unexplored',
            up: 'unclear ceiling'
        }
    }
    
    const result = buildExitInfoArray(undefined, metadata)
    
    assert.equal(result.length, 2)
    const west = result.find(e => e.direction === 'west')
    assert.ok(west)
    assert.equal(west.availability, 'pending')
    assert.equal(west.reason, 'unexplored')
    assert.equal(west.toLocationId, undefined)
})

test('buildExitInfoArray: forbidden exits with reasons', () => {
    const metadata: ExitAvailabilityMetadata = {
        forbidden: {
            down: 'solid floor',
            out: 'no exit visible'
        }
    }
    
    const result = buildExitInfoArray(undefined, metadata)
    
    assert.equal(result.length, 2)
    const down = result.find(e => e.direction === 'down')
    assert.ok(down)
    assert.equal(down.availability, 'forbidden')
    assert.equal(down.reason, 'solid floor')
})

test('buildExitInfoArray: mixed hard, pending, and forbidden', () => {
    const exits: Partial<Record<Direction, string>> = { north: 'loc-123' }
    const metadata: ExitAvailabilityMetadata = {
        pending: { south: 'unexplored' },
        forbidden: { east: 'wall', west: 'chasm' }
    }
    
    const result = buildExitInfoArray(exits, metadata)
    
    assert.equal(result.length, 4)
    
    const north = result.find(e => e.direction === 'north')
    assert.ok(north)
    assert.equal(north.availability, 'hard')
    assert.equal(north.toLocationId, 'loc-123')
    
    const south = result.find(e => e.direction === 'south')
    assert.ok(south)
    assert.equal(south.availability, 'pending')
    
    const east = result.find(e => e.direction === 'east')
    assert.ok(east)
    assert.equal(east.availability, 'forbidden')
    
    const west = result.find(e => e.direction === 'west')
    assert.ok(west)
    assert.equal(west.availability, 'forbidden')
})

test('buildExitInfoArray: hard exit overrides pending (data error)', () => {
    const exits: Partial<Record<Direction, string>> = { north: 'loc-123' }
    const metadata: ExitAvailabilityMetadata = {
        pending: { north: 'should be ignored' }
    }
    
    const result = buildExitInfoArray(exits, metadata)
    
    assert.equal(result.length, 1)
    assert.equal(result[0].direction, 'north')
    assert.equal(result[0].availability, 'hard') // Hard wins
    assert.equal(result[0].toLocationId, 'loc-123')
})

test('buildExitInfoArray: hard exit overrides forbidden (data error)', () => {
    const exits: Partial<Record<Direction, string>> = { south: 'loc-456' }
    const metadata: ExitAvailabilityMetadata = {
        forbidden: { south: 'should be ignored' }
    }
    
    const result = buildExitInfoArray(exits, metadata)
    
    assert.equal(result.length, 1)
    assert.equal(result[0].direction, 'south')
    assert.equal(result[0].availability, 'hard') // Hard wins
})

test('buildExitInfoArray: forbidden overrides pending (data error)', () => {
    const metadata: ExitAvailabilityMetadata = {
        pending: { up: 'should be ignored' },
        forbidden: { up: 'solid ceiling' }
    }
    
    const result = buildExitInfoArray(undefined, metadata)
    
    assert.equal(result.length, 1)
    assert.equal(result[0].direction, 'up')
    assert.equal(result[0].availability, 'forbidden') // Forbidden wins over pending
})

test('buildExitInfoArray: empty inputs', () => {
    const result = buildExitInfoArray(undefined, undefined)
    assert.equal(result.length, 0)
})

test('buildExitInfoArray: empty exits and metadata', () => {
    const exits: Partial<Record<Direction, string>> = {}
    const metadata: ExitAvailabilityMetadata = { pending: {}, forbidden: {} }
    
    const result = buildExitInfoArray(exits, metadata)
    assert.equal(result.length, 0)
})

// --- Edge Cases from Acceptance Criteria ---

test('edge case: location has no exits field at all (backward compat)', () => {
    // undefined exits should be treated as "unknown/none visible"
    const result = buildExitInfoArray(undefined, undefined)
    assert.equal(result.length, 0) // No pending implied
})

test('edge case: direction is both forbidden and has hard exit (data error)', () => {
    const exits: Partial<Record<Direction, string>> = { north: 'loc-123' }
    const metadata: ExitAvailabilityMetadata = {
        forbidden: { north: 'wall' }
    }
    
    // Hard wins, warning should be emitted (tested separately in handler)
    const result = buildExitInfoArray(exits, metadata)
    
    assert.equal(result.length, 1)
    assert.equal(result[0].availability, 'hard')
})

test('edge case: pending exit becomes hard between requests', () => {
    // First state: pending
    const metadata1: ExitAvailabilityMetadata = {
        pending: { west: 'unexplored' }
    }
    const result1 = buildExitInfoArray(undefined, metadata1)
    assert.equal(result1[0].availability, 'pending')
    
    // Second state: hard (after generation)
    const exits2: Partial<Record<Direction, string>> = { west: 'loc-999' }
    const result2 = buildExitInfoArray(exits2, metadata1)
    assert.equal(result2.length, 1)
    assert.equal(result2[0].availability, 'hard') // Client should handle gracefully
})

// --- Serialization Tests ---

test('serialization: ExitInfo can be JSON stringified', () => {
    const exitInfo: ExitInfo = {
        direction: 'north',
        availability: 'hard',
        toLocationId: 'loc-123',
        description: 'A worn path leads north'
    }
    
    const json = JSON.stringify(exitInfo)
    const parsed = JSON.parse(json) as ExitInfo
    
    assert.equal(parsed.direction, 'north')
    assert.equal(parsed.availability, 'hard')
    assert.equal(parsed.toLocationId, 'loc-123')
    assert.equal(parsed.description, 'A worn path leads north')
})

test('serialization: ExitAvailabilityMetadata can be JSON stringified', () => {
    const metadata: ExitAvailabilityMetadata = {
        pending: { south: 'unexplored' },
        forbidden: { up: 'solid ceiling', down: 'solid floor' }
    }
    
    const json = JSON.stringify(metadata)
    const parsed = JSON.parse(json) as ExitAvailabilityMetadata
    
    assert.deepEqual(parsed.pending, { south: 'unexplored' })
    assert.deepEqual(parsed.forbidden, { up: 'solid ceiling', down: 'solid floor' })
})

test('serialization: array of ExitInfo can be JSON stringified', () => {
    const exits: Partial<Record<Direction, string>> = { north: 'loc-123', south: 'loc-456' }
    const metadata: ExitAvailabilityMetadata = {
        pending: { west: 'unexplored' },
        forbidden: { east: 'wall' }
    }
    
    const exitInfoArray = buildExitInfoArray(exits, metadata)
    const json = JSON.stringify(exitInfoArray)
    const parsed = JSON.parse(json) as ExitInfo[]
    
    assert.equal(parsed.length, 4)
    assert.ok(parsed.every(e => isExitAvailability(e.availability)))
})
