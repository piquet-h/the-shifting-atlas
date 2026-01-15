/**
 * Unit tests for Hero-Prose Layer Convention
 *
 * Tests identification and selection logic for hero-prose layers.
 * Hero-prose layers use layerType='dynamic' with metadata.replacesBase=true and metadata.role='hero'.
 *
 * See: docs/architecture/hero-prose-layer-convention.md
 */

import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import { isHeroProse, isValidHeroProseContent, selectHeroProse } from '../../src/services/heroProse.js'

describe('Hero-Prose Layer Convention', () => {
    describe('isHeroProse', () => {
        test('should identify valid hero-prose layer', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'Hero prose content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'abc123'
                }
            }

            assert.strictEqual(isHeroProse(layer), true)
        })

        test('should reject layer with wrong layerType', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'ambient', // Wrong type
                value: 'Hero prose content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'abc123'
                }
            }

            assert.strictEqual(isHeroProse(layer), false)
        })

        test('should reject layer missing replacesBase flag', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'Hero prose content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    role: 'hero',
                    promptHash: 'abc123'
                    // Missing replacesBase
                }
            }

            assert.strictEqual(isHeroProse(layer), false)
        })

        test('should reject layer with replacesBase=false', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'Hero prose content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    replacesBase: false, // Explicitly false
                    role: 'hero',
                    promptHash: 'abc123'
                }
            }

            assert.strictEqual(isHeroProse(layer), false)
        })

        test('should reject layer missing role', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'Hero prose content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    replacesBase: true,
                    promptHash: 'abc123'
                    // Missing role
                }
            }

            assert.strictEqual(isHeroProse(layer), false)
        })

        test('should reject layer with wrong role', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'Hero prose content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    replacesBase: true,
                    role: 'villain', // Wrong role
                    promptHash: 'abc123'
                }
            }

            assert.strictEqual(isHeroProse(layer), false)
        })

        test('should reject layer missing promptHash', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'Hero prose content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    replacesBase: true,
                    role: 'hero'
                    // Missing promptHash
                }
            }

            assert.strictEqual(isHeroProse(layer), false)
        })

        test('should reject layer with empty promptHash', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'Hero prose content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString(),
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: '' // Empty string
                }
            }

            assert.strictEqual(isHeroProse(layer), false)
        })

        test('should reject layer with no metadata', () => {
            const layer: DescriptionLayer = {
                id: crypto.randomUUID(),
                scopeId: 'loc:test-location',
                layerType: 'dynamic',
                value: 'Hero prose content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: new Date().toISOString()
                // No metadata at all
            }

            assert.strictEqual(isHeroProse(layer), false)
        })
    })

    describe('selectHeroProse', () => {
        test('should return null when no layers exist', () => {
            const result = selectHeroProse([])
            assert.strictEqual(result, null)
        })

        test('should return null when no hero-prose layers exist', () => {
            const layers: DescriptionLayer[] = [
                {
                    id: crypto.randomUUID(),
                    scopeId: 'loc:test',
                    layerType: 'ambient',
                    value: 'Ambient content',
                    effectiveFromTick: 0,
                    effectiveToTick: null,
                    authoredAt: new Date().toISOString()
                }
            ]

            const result = selectHeroProse(layers)
            assert.strictEqual(result, null)
        })

        test('should return single valid hero-prose layer', () => {
            const heroLayer: DescriptionLayer = {
                id: 'hero-1',
                scopeId: 'loc:test',
                layerType: 'dynamic',
                value: 'Hero prose',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: '2026-01-15T10:00:00Z',
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'hash1'
                }
            }

            const layers = [heroLayer]
            const result = selectHeroProse(layers)

            assert.strictEqual(result?.id, 'hero-1')
        })

        test('should select most recent hero-prose layer', () => {
            const olderLayer: DescriptionLayer = {
                id: 'hero-old',
                scopeId: 'loc:test',
                layerType: 'dynamic',
                value: 'Old hero prose',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: '2026-01-10T10:00:00Z',
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'hash1'
                }
            }

            const newerLayer: DescriptionLayer = {
                id: 'hero-new',
                scopeId: 'loc:test',
                layerType: 'dynamic',
                value: 'New hero prose',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: '2026-01-15T10:00:00Z',
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'hash2'
                }
            }

            // Test with both orderings to ensure determinism
            const result1 = selectHeroProse([olderLayer, newerLayer])
            const result2 = selectHeroProse([newerLayer, olderLayer])

            assert.strictEqual(result1?.id, 'hero-new')
            assert.strictEqual(result2?.id, 'hero-new')
        })

        test('should use lexicographic tie-break when timestamps equal', () => {
            const timestamp = '2026-01-15T10:00:00Z'

            const layerB: DescriptionLayer = {
                id: 'bbb-222',
                scopeId: 'loc:test',
                layerType: 'dynamic',
                value: 'Hero prose B',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: timestamp,
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'hash1'
                }
            }

            const layerA: DescriptionLayer = {
                id: 'aaa-111',
                scopeId: 'loc:test',
                layerType: 'dynamic',
                value: 'Hero prose A',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: timestamp,
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'hash2'
                }
            }

            // Test with both orderings
            const result1 = selectHeroProse([layerB, layerA])
            const result2 = selectHeroProse([layerA, layerB])

            // Should select 'aaa-111' (lexicographically first)
            assert.strictEqual(result1?.id, 'aaa-111')
            assert.strictEqual(result2?.id, 'aaa-111')
        })

        test('should ignore non-hero layers when selecting', () => {
            const heroLayer: DescriptionLayer = {
                id: 'hero-1',
                scopeId: 'loc:test',
                layerType: 'dynamic',
                value: 'Hero prose',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: '2026-01-15T10:00:00Z',
                metadata: {
                    replacesBase: true,
                    role: 'hero',
                    promptHash: 'hash1'
                }
            }

            const ambientLayer: DescriptionLayer = {
                id: 'ambient-1',
                scopeId: 'loc:test',
                layerType: 'ambient',
                value: 'Ambient content',
                effectiveFromTick: 0,
                effectiveToTick: null,
                authoredAt: '2026-01-16T10:00:00Z' // More recent, but not hero
            }

            const result = selectHeroProse([heroLayer, ambientLayer])
            assert.strictEqual(result?.id, 'hero-1')
        })
    })

    describe('isValidHeroProseContent', () => {
        test('should accept valid content', () => {
            const content = 'The marketplace sprawls before you, vibrant and bustling.'
            assert.strictEqual(isValidHeroProseContent(content), true)
        })

        test('should accept content at length limit', () => {
            const content = 'x'.repeat(1200)
            assert.strictEqual(isValidHeroProseContent(content), true)
        })

        test('should reject empty string', () => {
            assert.strictEqual(isValidHeroProseContent(''), false)
        })

        test('should reject whitespace-only string', () => {
            assert.strictEqual(isValidHeroProseContent('   \n\t  '), false)
        })

        test('should reject content exceeding length limit', () => {
            const content = 'x'.repeat(1201)
            assert.strictEqual(isValidHeroProseContent(content), false)
        })
    })
})
