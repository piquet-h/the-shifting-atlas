import assert from 'node:assert'
import { describe, test } from 'node:test'
import { enrichWorldEventAttributes, TELEMETRY_ATTRIBUTE_KEYS } from '@piquet-h/shared'

describe('World Event Attribute Enrichment', () => {
    test('enrichWorldEventAttributes adds game.event.type and game.event.actor.kind', () => {
        const props: Record<string, unknown> = {
            eventType: 'player.move',
            actorKind: 'player',
            correlationId: 'test-correlation-id'
        }

        enrichWorldEventAttributes(props, {
            eventType: 'player.move',
            actorKind: 'player'
        })

        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.EVENT_TYPE], 'player.move')
        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.EVENT_ACTOR_KIND], 'player')
        // Original properties should still be present
        assert.equal(props['eventType'], 'player.move')
        assert.equal(props['actorKind'], 'player')
    })

    test('enrichWorldEventAttributes handles targetLocationId', () => {
        const props: Record<string, unknown> = {}

        enrichWorldEventAttributes(props, {
            eventType: 'location.generate',
            actorKind: 'system',
            targetLocationId: 'loc-123'
        })

        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.EVENT_TYPE], 'location.generate')
        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.EVENT_ACTOR_KIND], 'system')
        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.LOCATION_ID], 'loc-123')
    })

    test('enrichWorldEventAttributes handles targetPlayerId', () => {
        const props: Record<string, unknown> = {}

        enrichWorldEventAttributes(props, {
            eventType: 'player.action',
            actorKind: 'npc',
            targetPlayerId: 'player-456'
        })

        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.EVENT_TYPE], 'player.action')
        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.EVENT_ACTOR_KIND], 'npc')
        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.PLAYER_ID], 'player-456')
    })

    test('enrichWorldEventAttributes omits attributes when null', () => {
        const props: Record<string, unknown> = {}

        enrichWorldEventAttributes(props, {
            eventType: null,
            actorKind: null
        })

        // game.* attributes should not be present
        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.EVENT_TYPE], undefined)
        assert.equal(props[TELEMETRY_ATTRIBUTE_KEYS.EVENT_ACTOR_KIND], undefined)
        assert.equal(Object.keys(props).length, 0)
    })
})
