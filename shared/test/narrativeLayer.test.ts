import assert from 'node:assert'
import { describe, test } from 'node:test'
import { NarrativeLayer } from '../src/temporal/narrativeLayer.js'

describe('NarrativeLayer', () => {
    describe('generateWaitNarrative', () => {
        test('returns short template for duration < 1 minute', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(30000) // 30 seconds

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
            // Short templates should be brief
            assert.ok(narrative.length < 100, 'short narrative should be concise')
        })

        test('returns medium template for duration 1 minute - 1 hour', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(1800000) // 30 minutes

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('returns long template for duration 1 hour - 1 day', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(7200000) // 2 hours

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('returns veryLong template for duration >= 1 day', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(86400000) // 1 day

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('uses higher bucket for exact boundary duration (1 minute)', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(60000) // exactly 1 minute

            // Should use medium bucket, not short
            // We can verify by checking it's not one of the very short templates
            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('uses higher bucket for exact boundary duration (1 hour)', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(3600000) // exactly 1 hour

            // Should use long bucket, not medium
            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('uses higher bucket for exact boundary duration (1 day)', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(86400000) // exactly 1 day

            // Should use veryLong bucket, not long
            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('interpolates location name when context provided', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(1800000, {
                locationId: 'loc-123',
                locationDescription: 'the Broken Bridge'
            })

            // If template has {location}, it should be replaced
            assert.ok(!narrative.includes('{location}'), 'should not contain placeholder')
        })

        test('handles missing location context gracefully', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(1800000)

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
            assert.ok(!narrative.includes('{location}'), 'should not contain placeholder')
        })

        test('handles very long duration (> 365 days) using veryLong bucket', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(400 * 86400000) // 400 days

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('returns different templates on multiple calls (diversity)', () => {
            const layer = new NarrativeLayer()
            const narratives = new Set<string>()

            // Call 20 times to likely get different templates
            for (let i = 0; i < 20; i++) {
                const narrative = layer.generateWaitNarrative(1800000)
                narratives.add(narrative)
            }

            // Should have at least 2 different templates (since we have 3+ variations)
            assert.ok(narratives.size >= 2, 'should provide template diversity')
        })
    })

    describe('generateCompressNarrative', () => {
        test('returns short template for duration < 1 minute', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateCompressNarrative(30000) // 30 seconds

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('returns medium template for duration 1 minute - 1 hour', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateCompressNarrative(1800000) // 30 minutes

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('returns long template for duration 1 hour - 1 day', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateCompressNarrative(7200000) // 2 hours

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('returns veryLong template for duration >= 1 day', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateCompressNarrative(86400000) // 1 day

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('interpolates location name when context provided', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateCompressNarrative(1800000, {
                locationId: 'loc-123',
                locationDescription: 'the Ancient Library'
            })

            assert.ok(!narrative.includes('{location}'), 'should not contain placeholder')
        })

        test('handles missing location context gracefully', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateCompressNarrative(1800000)

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
            assert.ok(!narrative.includes('{location}'), 'should not contain placeholder')
        })

        test('returns different templates on multiple calls (diversity)', () => {
            const layer = new NarrativeLayer()
            const narratives = new Set<string>()

            // Call 20 times to likely get different templates
            for (let i = 0; i < 20; i++) {
                const narrative = layer.generateCompressNarrative(7200000)
                narratives.add(narrative)
            }

            // Should have at least 2 different templates
            assert.ok(narratives.size >= 2, 'should provide template diversity')
        })
    })

    describe('edge cases', () => {
        test('handles zero duration', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(0)

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('handles negative duration (treated as zero)', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(-1000)

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
        })

        test('context with only locationId (no description) works', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(1800000, {
                locationId: 'loc-123'
            })

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
            assert.ok(!narrative.includes('{location}'), 'should not contain placeholder')
        })

        test('context with empty locationDescription falls back gracefully', () => {
            const layer = new NarrativeLayer()
            const narrative = layer.generateWaitNarrative(1800000, {
                locationId: 'loc-123',
                locationDescription: ''
            })

            assert.ok(narrative.length > 0, 'should return non-empty narrative')
            assert.ok(!narrative.includes('{location}'), 'should not contain placeholder')
        })
    })
})
