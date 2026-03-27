/**
 * Unit tests for frontierContext — structural archetype inference and
 * PendingExitMetadata construction.
 *
 * Covers:
 *   - inferStructuralArchetype for all direction categories
 *   - Interior frontier (in/out)
 *   - Vertical frontier (up/down)
 *   - Waterfront frontier (cardinal with water context)
 *   - Overland frontier (cardinal without water context)
 *   - Edge: interior direction is always 'interior' regardless of waterContext
 *   - Edge: vertical direction is always 'vertical' regardless of waterContext
 */

import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { inferStructuralArchetype } from '../../src/services/frontierContext.js'

describe('inferStructuralArchetype', () => {
    describe('interior directions', () => {
        test('"in" yields interior archetype', () => {
            assert.equal(inferStructuralArchetype('in'), 'interior')
        })

        test('"out" yields interior archetype', () => {
            assert.equal(inferStructuralArchetype('out'), 'interior')
        })

        test('"in" with waterContext still yields interior (direction takes precedence)', () => {
            assert.equal(inferStructuralArchetype('in', 'fjord-sound-head'), 'interior')
        })

        test('"out" with waterContext still yields interior (direction takes precedence)', () => {
            assert.equal(inferStructuralArchetype('out', 'fjord-sound-head'), 'interior')
        })
    })

    describe('vertical directions', () => {
        test('"up" yields vertical archetype', () => {
            assert.equal(inferStructuralArchetype('up'), 'vertical')
        })

        test('"down" yields vertical archetype', () => {
            assert.equal(inferStructuralArchetype('down'), 'vertical')
        })

        test('"up" with waterContext still yields vertical (direction takes precedence)', () => {
            assert.equal(inferStructuralArchetype('up', 'fjord-sound-head'), 'vertical')
        })

        test('"down" with waterContext still yields vertical (direction takes precedence)', () => {
            assert.equal(inferStructuralArchetype('down', 'fjord-sound-head'), 'vertical')
        })
    })

    describe('waterfront directions', () => {
        test('"north" with waterContext yields waterfront archetype', () => {
            assert.equal(inferStructuralArchetype('north', 'fjord-sound-head'), 'waterfront')
        })

        test('"west" with waterContext yields waterfront archetype', () => {
            assert.equal(inferStructuralArchetype('west', 'fjord-sound-head'), 'waterfront')
        })

        test('"northeast" with waterContext yields waterfront archetype', () => {
            assert.equal(inferStructuralArchetype('northeast', 'coastal-inlet'), 'waterfront')
        })
    })

    describe('overland directions', () => {
        test('"north" without waterContext yields overland archetype', () => {
            assert.equal(inferStructuralArchetype('north'), 'overland')
        })

        test('"south" without waterContext yields overland archetype', () => {
            assert.equal(inferStructuralArchetype('south'), 'overland')
        })

        test('"east" without waterContext yields overland archetype', () => {
            assert.equal(inferStructuralArchetype('east'), 'overland')
        })

        test('"southwest" without waterContext yields overland archetype', () => {
            assert.equal(inferStructuralArchetype('southwest'), 'overland')
        })

        test('"north" with empty-string waterContext yields overland (falsy check)', () => {
            assert.equal(inferStructuralArchetype('north', ''), 'overland')
        })
    })
})
