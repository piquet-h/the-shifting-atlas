/**
 * Unit tests for exit availability edge cases and forbidden direction logic.
 *
 * These tests validate the contract and behavior of exit availability
 * representation, including data integrity issues.
 */
import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { Direction } from '../src/domainModels.js'
import { buildExitInfoArray, determineExitAvailability, type ExitAvailabilityMetadata } from '../src/exitAvailability.js'

describe('Exit Availability Edge Cases', () => {
    describe('Forbidden directions never generate', () => {
        test('forbidden direction returns forbidden availability', () => {
            const metadata: ExitAvailabilityMetadata = {
                forbidden: { north: { reason: 'solid wall' } }
            }

            const availability = determineExitAvailability('north', undefined, metadata)
            assert.equal(availability, 'forbidden')
        })

        test('forbidden with reason', () => {
            const metadata: ExitAvailabilityMetadata = {
                forbidden: {
                    up: { reason: 'ceiling' },
                    down: { reason: 'solid floor' },
                    out: { reason: 'no visible exit' }
                }
            }

            const exitInfo = buildExitInfoArray(undefined, metadata)

            const up = exitInfo.find((e) => e.direction === 'up')
            assert.ok(up)
            assert.equal(up.availability, 'forbidden')
            assert.equal(up.reason, 'ceiling')

            const down = exitInfo.find((e) => e.direction === 'down')
            assert.ok(down)
            assert.equal(down.availability, 'forbidden')
            assert.equal(down.reason, 'solid floor')
        })

        test('buildExitInfoArray does not include forbidden in pending', () => {
            const metadata: ExitAvailabilityMetadata = {
                pending: { south: 'unexplored' },
                forbidden: { north: { reason: 'wall' } }
            }

            const exitInfo = buildExitInfoArray(undefined, metadata)

            assert.equal(exitInfo.length, 2)
            assert.ok(exitInfo.some((e) => e.direction === 'south' && e.availability === 'pending'))
            assert.ok(exitInfo.some((e) => e.direction === 'north' && e.availability === 'forbidden'))
        })
    })

    describe('Data integrity errors', () => {
        test('hard exit overrides forbidden (data error)', () => {
            // This is a data integrity error - a direction cannot be both hard and forbidden
            // Hard exit takes precedence
            const exits: Partial<Record<Direction, string>> = { north: 'loc-123' }
            const metadata: ExitAvailabilityMetadata = {
                forbidden: { north: { reason: 'should be ignored' } }
            }

            const availability = determineExitAvailability('north', exits, metadata)
            assert.equal(availability, 'hard', 'Hard exit should win over forbidden')

            const exitInfo = buildExitInfoArray(exits, metadata)
            const north = exitInfo.find((e) => e.direction === 'north')
            assert.ok(north)
            assert.equal(north.availability, 'hard')
            assert.equal(north.toLocationId, 'loc-123')
        })

        test('hard exit overrides pending (data error)', () => {
            const exits: Partial<Record<Direction, string>> = { east: 'loc-456' }
            const metadata: ExitAvailabilityMetadata = {
                pending: { east: 'should be ignored' }
            }

            const availability = determineExitAvailability('east', exits, metadata)
            assert.equal(availability, 'hard', 'Hard exit should win over pending')
        })

        test('forbidden overrides pending (data error)', () => {
            // If a direction is both forbidden and pending, forbidden wins
            const metadata: ExitAvailabilityMetadata = {
                pending: { west: 'should be ignored' },
                forbidden: { west: { reason: 'permanent wall' } }
            }

            const availability = determineExitAvailability('west', undefined, metadata)
            assert.equal(availability, 'forbidden', 'Forbidden should win over pending')
        })
    })

    describe('Backward compatibility', () => {
        test('location with no exitAvailability metadata', () => {
            const exits: Partial<Record<Direction, string>> = {
                north: 'loc-1',
                south: 'loc-2'
            }

            // No metadata provided - should only return hard exits
            const exitInfo = buildExitInfoArray(exits, undefined)

            assert.equal(exitInfo.length, 2)
            assert.ok(exitInfo.every((e) => e.availability === 'hard'))
        })

        test('location with empty exitAvailability metadata', () => {
            const exits: Partial<Record<Direction, string>> = {
                north: 'loc-1'
            }
            const metadata: ExitAvailabilityMetadata = {
                pending: {},
                forbidden: {}
            }

            const exitInfo = buildExitInfoArray(exits, metadata)

            assert.equal(exitInfo.length, 1)
            assert.equal(exitInfo[0].availability, 'hard')
        })

        test('location with no exits field at all', () => {
            // undefined exits should be treated as "unknown/none visible"
            const exitInfo = buildExitInfoArray(undefined, undefined)

            assert.equal(exitInfo.length, 0, 'No pending implied for missing exits')
        })
    })

    describe('State transitions', () => {
        test('pending becomes hard after generation', () => {
            // Initial state: pending
            const metadata1: ExitAvailabilityMetadata = {
                pending: { west: 'unexplored' }
            }
            const exitInfo1 = buildExitInfoArray(undefined, metadata1)
            assert.equal(exitInfo1[0].availability, 'pending')

            // After generation: hard
            const exits2: Partial<Record<Direction, string>> = { west: 'loc-new' }
            // Metadata may still have pending entry (not yet cleaned up)
            const exitInfo2 = buildExitInfoArray(exits2, metadata1)

            const west = exitInfo2.find((e) => e.direction === 'west')
            assert.ok(west)
            assert.equal(west.availability, 'hard', 'Should transition to hard')
            assert.equal(west.toLocationId, 'loc-new')
        })

        test('client handles gracefully when pending becomes hard', () => {
            // Client sees pending
            const metadata: ExitAvailabilityMetadata = {
                pending: { north: 'generating' }
            }
            const exitInfo1 = buildExitInfoArray(undefined, metadata)
            assert.equal(exitInfo1[0].availability, 'pending')

            // Next request, it's hard
            const exits: Partial<Record<Direction, string>> = { north: 'loc-123' }
            const exitInfo2 = buildExitInfoArray(exits, metadata)
            assert.equal(exitInfo2[0].availability, 'hard')

            // No error, client should handle the state change
            assert.ok(true, 'State transition should be transparent')
        })
    })

    describe('Telemetry warning scenarios', () => {
        test('should emit warning when hard exit conflicts with forbidden', () => {
            // This test documents that we should emit warning telemetry
            // when a hard exit exists but the direction is also marked forbidden
            const exits: Partial<Record<Direction, string>> = { north: 'loc-123' }
            const metadata: ExitAvailabilityMetadata = {
                forbidden: { north: { reason: 'wall' } }
            }

            // Detection logic
            const hasHardExit = exits['north'] !== undefined
            const isForbidden = metadata.forbidden?.['north'] !== undefined
            const shouldWarn = hasHardExit && isForbidden

            assert.equal(shouldWarn, true, 'Should detect data integrity issue')

            // Actual warning emission would happen in handler
            // This test just validates the detection logic
        })
    })
})
