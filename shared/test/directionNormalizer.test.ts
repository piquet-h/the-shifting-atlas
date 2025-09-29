import assert from 'node:assert/strict'
import test from 'node:test'
import {
    DirectionNormalizationResult,
    isRelativeDirection,
    normalizeDirection,
    resolveRelativeDirection
} from '../src/direction/directionNormalizer.js'

test('isRelativeDirection identifies relative direction tokens', () => {
    assert.ok(isRelativeDirection('left'))
    assert.ok(isRelativeDirection('right'))
    assert.ok(isRelativeDirection('forward'))
    assert.ok(isRelativeDirection('back'))
    assert.ok(isRelativeDirection('LEFT')) // case insensitive
    assert.ok(isRelativeDirection('Right'))
    
    assert.ok(!isRelativeDirection('north'))
    assert.ok(!isRelativeDirection('south'))
    assert.ok(!isRelativeDirection('invalid'))
    assert.ok(!isRelativeDirection(''))
})

test('resolveRelativeDirection: cardinal directions', () => {
    // North heading
    assert.equal(resolveRelativeDirection('forward', 'north'), 'north')
    assert.equal(resolveRelativeDirection('back', 'north'), 'south')
    assert.equal(resolveRelativeDirection('left', 'north'), 'west')
    assert.equal(resolveRelativeDirection('right', 'north'), 'east')
    
    // South heading
    assert.equal(resolveRelativeDirection('forward', 'south'), 'south')
    assert.equal(resolveRelativeDirection('back', 'south'), 'north')
    assert.equal(resolveRelativeDirection('left', 'south'), 'east')
    assert.equal(resolveRelativeDirection('right', 'south'), 'west')
    
    // East heading
    assert.equal(resolveRelativeDirection('forward', 'east'), 'east')
    assert.equal(resolveRelativeDirection('back', 'east'), 'west')
    assert.equal(resolveRelativeDirection('left', 'east'), 'north')
    assert.equal(resolveRelativeDirection('right', 'east'), 'south')
    
    // West heading
    assert.equal(resolveRelativeDirection('forward', 'west'), 'west')
    assert.equal(resolveRelativeDirection('back', 'west'), 'east')
    assert.equal(resolveRelativeDirection('left', 'west'), 'south')
    assert.equal(resolveRelativeDirection('right', 'west'), 'north')
})

test('resolveRelativeDirection: diagonal directions (heading wrap)', () => {
    // Northeast heading
    assert.equal(resolveRelativeDirection('forward', 'northeast'), 'northeast')
    assert.equal(resolveRelativeDirection('back', 'northeast'), 'southwest')
    assert.equal(resolveRelativeDirection('left', 'northeast'), 'northwest')
    assert.equal(resolveRelativeDirection('right', 'northeast'), 'southeast')
    
    // Southwest heading (test wrap around example: west + left → south mentioned in requirements)
    assert.equal(resolveRelativeDirection('forward', 'southwest'), 'southwest')
    assert.equal(resolveRelativeDirection('back', 'southwest'), 'northeast')
    assert.equal(resolveRelativeDirection('left', 'southwest'), 'southeast')
    assert.equal(resolveRelativeDirection('right', 'southwest'), 'northwest')
})

test('resolveRelativeDirection: vertical and portal directions', () => {
    // Up/down have limited relative meaning
    assert.equal(resolveRelativeDirection('forward', 'up'), 'up')
    assert.equal(resolveRelativeDirection('back', 'up'), 'down')
    
    // In/out have limited relative meaning  
    assert.equal(resolveRelativeDirection('forward', 'out'), 'out')
    assert.equal(resolveRelativeDirection('back', 'out'), 'in')
})

test('normalizeDirection: canonical directions pass through', () => {
    const result = normalizeDirection('north')
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north')
    assert.equal(result.clarification, undefined)
    
    // Case insensitive
    const resultUpper = normalizeDirection('SOUTH')
    assert.equal(resultUpper.status, 'ok')
    assert.equal(resultUpper.canonical, 'south')
})

test('normalizeDirection: relative direction with known heading', () => {
    const result = normalizeDirection('left', 'north')
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'west')
    assert.equal(result.clarification, undefined)
})

test('normalizeDirection: relative direction without heading (ambiguous)', () => {
    const result = normalizeDirection('left')
    assert.equal(result.status, 'ambiguous')
    assert.equal(result.canonical, undefined)
    assert.ok(result.clarification?.includes('requires a previous move'))
    assert.ok(result.clarification?.includes('north'))
})

test('normalizeDirection: unknown direction', () => {
    const result = normalizeDirection('invalid')
    assert.equal(result.status, 'unknown')
    assert.equal(result.canonical, undefined)
    assert.ok(result.clarification?.includes('not a recognized direction'))
})

test('normalizeDirection: whitespace handling', () => {
    const result = normalizeDirection('  north  ')
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'north')
})

test('normalizeDirection: heading wrap example from requirements', () => {
    // West + left → south (mentioned in acceptance criteria)
    const result = normalizeDirection('left', 'west')
    assert.equal(result.status, 'ok')
    assert.equal(result.canonical, 'south')
})

test('normalizeDirection: multi-token ambiguous (empty/whitespace)', () => {
    const result = normalizeDirection('')
    assert.equal(result.status, 'unknown')
    
    const resultWhitespace = normalizeDirection('   ')
    assert.equal(resultWhitespace.status, 'unknown')
})