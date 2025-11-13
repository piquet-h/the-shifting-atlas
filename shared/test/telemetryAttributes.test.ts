import assert from 'node:assert'
import { describe, test } from 'node:test'
import {
    enrichErrorAttributes,
    enrichHumorAttributes,
    enrichMovementAttributes,
    enrichPlayerAttributes,
    enrichWorldEventAttributes,
    TELEMETRY_ATTRIBUTE_KEYS
} from '../src/telemetryAttributes.js'

describe('Telemetry Attributes', () => {
    describe('TELEMETRY_ATTRIBUTE_KEYS', () => {
        test('defines all required attribute keys', () => {
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.PLAYER_ID, 'game.player.id')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.LOCATION_ID, 'game.location.id')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.LOCATION_FROM, 'game.location.from')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.LOCATION_TO, 'game.location.to')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.EXIT_DIRECTION, 'game.world.exit.direction')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.EVENT_TYPE, 'game.event.type')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.EVENT_ACTOR_KIND, 'game.event.actor.kind')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.ERROR_CODE, 'game.error.code')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.HUMOR_QUIP_ID, 'game.humor.quip.id')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.HUMOR_ACTION_TYPE, 'game.humor.action.type')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.HUMOR_PROBABILITY_USED, 'game.humor.probability.used')
            assert.equal(TELEMETRY_ATTRIBUTE_KEYS.HUMOR_SUPPRESSION_REASON, 'game.humor.suppression.reason')
        })

        test('uses lowercase dot-separated naming', () => {
            const keys = Object.values(TELEMETRY_ATTRIBUTE_KEYS)
            for (const key of keys) {
                assert.ok(key.startsWith('game.'), `Key ${key} should start with game.`)
                assert.ok(!key.match(/[A-Z]/), `Key ${key} should be lowercase`)
            }
        })
    })

    describe('enrichPlayerAttributes', () => {
        test('adds player ID when provided', () => {
            const props = {}
            enrichPlayerAttributes(props, { playerId: 'player-123' })
            assert.equal(props['game.player.id'], 'player-123')
        })

        test('omits player ID when null', () => {
            const props = {}
            enrichPlayerAttributes(props, { playerId: null })
            assert.equal(props['game.player.id'], undefined)
        })

        test('omits player ID when undefined', () => {
            const props = {}
            enrichPlayerAttributes(props, {})
            assert.equal(props['game.player.id'], undefined)
        })

        test('returns properties object for chaining', () => {
            const props = { existing: 'value' }
            const result = enrichPlayerAttributes(props, { playerId: 'player-123' })
            assert.strictEqual(result, props)
            assert.equal(result['existing'], 'value')
        })
    })

    describe('enrichMovementAttributes', () => {
        test('adds all movement attributes when provided', () => {
            const props = {}
            enrichMovementAttributes(props, {
                playerId: 'player-123',
                fromLocationId: 'loc-from',
                toLocationId: 'loc-to',
                exitDirection: 'north'
            })
            assert.equal(props['game.player.id'], 'player-123')
            assert.equal(props['game.location.from'], 'loc-from')
            assert.equal(props['game.location.to'], 'loc-to')
            assert.equal(props['game.world.exit.direction'], 'north')
        })

        test('adds partial attributes (success case with from/to/direction)', () => {
            const props = {}
            enrichMovementAttributes(props, {
                fromLocationId: 'loc-from',
                toLocationId: 'loc-to',
                exitDirection: 'south'
            })
            assert.equal(props['game.player.id'], undefined)
            assert.equal(props['game.location.from'], 'loc-from')
            assert.equal(props['game.location.to'], 'loc-to')
            assert.equal(props['game.world.exit.direction'], 'south')
        })

        test('omits toLocationId on blocked movement', () => {
            const props = {}
            enrichMovementAttributes(props, {
                playerId: 'player-123',
                fromLocationId: 'loc-from',
                exitDirection: 'west',
                toLocationId: null
            })
            assert.equal(props['game.player.id'], 'player-123')
            assert.equal(props['game.location.from'], 'loc-from')
            assert.equal(props['game.location.to'], undefined)
            assert.equal(props['game.world.exit.direction'], 'west')
        })

        test('handles empty attributes', () => {
            const props = {}
            enrichMovementAttributes(props, {})
            assert.equal(Object.keys(props).length, 0)
        })
    })

    describe('enrichWorldEventAttributes', () => {
        test('adds event type and actor kind', () => {
            const props = {}
            enrichWorldEventAttributes(props, {
                eventType: 'player.move',
                actorKind: 'player'
            })
            assert.equal(props['game.event.type'], 'player.move')
            assert.equal(props['game.event.actor.kind'], 'player')
        })

        test('adds target location ID', () => {
            const props = {}
            enrichWorldEventAttributes(props, {
                eventType: 'location.generate',
                actorKind: 'system',
                targetLocationId: 'loc-123'
            })
            assert.equal(props['game.location.id'], 'loc-123')
        })

        test('adds target player ID', () => {
            const props = {}
            enrichWorldEventAttributes(props, {
                eventType: 'player.action',
                actorKind: 'player',
                targetPlayerId: 'player-456'
            })
            assert.equal(props['game.player.id'], 'player-456')
        })

        test('prefers targetPlayerId when both target IDs provided', () => {
            const props = {}
            enrichWorldEventAttributes(props, {
                eventType: 'mixed.event',
                actorKind: 'system',
                targetLocationId: 'loc-123',
                targetPlayerId: 'player-456'
            })
            // targetPlayerId should overwrite if set last
            assert.equal(props['game.player.id'], 'player-456')
            assert.equal(props['game.location.id'], 'loc-123')
        })

        test('omits attributes when null', () => {
            const props = {}
            enrichWorldEventAttributes(props, {
                eventType: null,
                actorKind: null
            })
            assert.equal(Object.keys(props).length, 0)
        })
    })

    describe('enrichErrorAttributes', () => {
        test('adds error code when provided', () => {
            const props = {}
            enrichErrorAttributes(props, { errorCode: 'no-exit' })
            assert.equal(props['game.error.code'], 'no-exit')
        })

        test('omits error code when null', () => {
            const props = {}
            enrichErrorAttributes(props, { errorCode: null })
            assert.equal(props['game.error.code'], undefined)
        })

        test('returns properties object for chaining', () => {
            const props = { status: 400 }
            const result = enrichErrorAttributes(props, { errorCode: 'invalid-direction' })
            assert.strictEqual(result, props)
            assert.equal(result['status'], 400)
            assert.equal(result['game.error.code'], 'invalid-direction')
        })
    })

    describe('Chaining enrichment functions', () => {
        test('can chain multiple enrichment calls', () => {
            const props = { eventName: 'Navigation.Move.Blocked' }
            enrichMovementAttributes(props, {
                playerId: 'player-123',
                fromLocationId: 'loc-from',
                exitDirection: 'north'
            })
            enrichErrorAttributes(props, { errorCode: 'no-exit' })

            assert.equal(props['game.player.id'], 'player-123')
            assert.equal(props['game.location.from'], 'loc-from')
            assert.equal(props['game.world.exit.direction'], 'north')
            assert.equal(props['game.error.code'], 'no-exit')
            assert.equal(props['eventName'], 'Navigation.Move.Blocked')
        })
    })

    describe('enrichHumorAttributes', () => {
        test('adds all humor attributes when provided', () => {
            const props = {}
            enrichHumorAttributes(props, {
                quipId: 'quip-123',
                actionType: 'move',
                probabilityUsed: 0.75,
                suppressionReason: null
            })
            assert.equal(props['game.humor.quip.id'], 'quip-123')
            assert.equal(props['game.humor.action.type'], 'move')
            assert.equal(props['game.humor.probability.used'], 0.75)
            assert.equal(props['game.humor.suppression.reason'], undefined)
        })

        test('adds suppression reason when quip is suppressed', () => {
            const props = {}
            enrichHumorAttributes(props, {
                suppressionReason: 'serious'
            })
            assert.equal(props['game.humor.suppression.reason'], 'serious')
            assert.equal(props['game.humor.quip.id'], undefined)
        })

        test('handles probability value of 0', () => {
            const props = {}
            enrichHumorAttributes(props, {
                probabilityUsed: 0
            })
            assert.equal(props['game.humor.probability.used'], 0)
        })

        test('handles probability value of 1', () => {
            const props = {}
            enrichHumorAttributes(props, {
                probabilityUsed: 1
            })
            assert.equal(props['game.humor.probability.used'], 1)
        })

        test('omits attributes when null', () => {
            const props = {}
            enrichHumorAttributes(props, {
                quipId: null,
                actionType: null,
                suppressionReason: null
            })
            assert.equal(Object.keys(props).length, 0)
        })

        test('returns properties object for chaining', () => {
            const props = { eventName: 'DM.Humor.QuipShown' }
            const result = enrichHumorAttributes(props, {
                quipId: 'quip-456',
                actionType: 'look',
                probabilityUsed: 0.5
            })
            assert.strictEqual(result, props)
            assert.equal(result['eventName'], 'DM.Humor.QuipShown')
            assert.equal(result['game.humor.quip.id'], 'quip-456')
        })
    })
})
