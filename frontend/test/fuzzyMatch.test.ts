/**
 * Fuzzy Match Utility Tests
 *
 * Tests for Levenshtein distance calculation and fuzzy string matching.
 */
import { describe, expect, it } from 'vitest'
import { levenshteinDistance, findClosestMatch } from '../src/utils/fuzzyMatch'

describe('levenshteinDistance', () => {
    it('returns 0 for identical strings', () => {
        expect(levenshteinDistance('test', 'test')).toBe(0)
        expect(levenshteinDistance('', '')).toBe(0)
    })

    it('returns length for completely different strings', () => {
        expect(levenshteinDistance('', 'abc')).toBe(3)
        expect(levenshteinDistance('abc', '')).toBe(3)
    })

    it('calculates deletion distance', () => {
        expect(levenshteinDistance('north', 'nrth')).toBe(1)
        expect(levenshteinDistance('test', 'tst')).toBe(1)
    })

    it('calculates substitution distance', () => {
        expect(levenshteinDistance('ping', 'pong')).toBe(1)
        expect(levenshteinDistance('east', 'esst')).toBe(1)
    })

    it('calculates insertion distance', () => {
        expect(levenshteinDistance('tst', 'test')).toBe(1)
        expect(levenshteinDistance('est', 'east')).toBe(1)
    })

    it('handles case sensitivity', () => {
        expect(levenshteinDistance('NORTH', 'north')).toBeGreaterThan(0)
    })

    it('calculates complex transformations', () => {
        expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
        expect(levenshteinDistance('saturday', 'sunday')).toBe(3)
    })
})

describe('findClosestMatch', () => {
    const commands = ['ping', 'look', 'move', 'clear']
    const directions = ['north', 'south', 'east', 'west']

    it('returns exact match', () => {
        expect(findClosestMatch('ping', commands)).toBe('ping')
        expect(findClosestMatch('north', directions)).toBe('north')
    })

    it('finds closest match within threshold', () => {
        expect(findClosestMatch('pong', commands)).toBe('ping')
        expect(findClosestMatch('nrth', directions)).toBe('north')
    })

    it('returns null if no match within threshold', () => {
        expect(findClosestMatch('xyz', commands)).toBeNull()
        expect(findClosestMatch('abc', directions)).toBeNull()
    })

    it('handles case-insensitive matching', () => {
        expect(findClosestMatch('PING', commands)).toBe('ping')
        expect(findClosestMatch('North', directions)).toBe('north')
    })

    it('finds closest among multiple candidates', () => {
        expect(findClosestMatch('lok', commands)).toBe('look')
        expect(findClosestMatch('clar', commands)).toBe('clear')
    })

    it('respects custom maxDistance', () => {
        expect(findClosestMatch('xyz', commands, 3)).toBeNull() // distance is 4, exceeds threshold 3
        expect(findClosestMatch('pn', commands, 2)).toBe('ping') // within threshold
    })

    it('returns null for empty input', () => {
        expect(findClosestMatch('', commands)).toBeNull()
    })

    it('works with single character input', () => {
        expect(findClosestMatch('p', commands)).toBeNull() // distance 3, exceeds default threshold
        expect(findClosestMatch('p', commands, 5)).toBe('ping') // within higher threshold
    })
})
