import assert from 'node:assert/strict'
import test, { describe } from 'node:test'

import { getDebounceTracker, createBatchGenerationEvent, tryCreatePrefetchEvent } from '../../src/services/prefetchBatchGeneration.js'

test('createBatchGenerationEvent: prefers macro area tag as realmKey when available', () => {
    const event = createBatchGenerationEvent('root-id', 'open-plain', 'south', 3, 'corr-id', undefined, [
        'settlement:mosswell',
        'macro:area:lr-area-mosswell-fiordhead',
        'macro:route:mw-route-harbor-to-northgate'
    ])

    assert.equal(event.payload.realmKey, 'macro:area:lr-area-mosswell-fiordhead')
})

test('tryCreatePrefetchEvent: includes settlement realmKey when macro area tag is absent', () => {
    const result = tryCreatePrefetchEvent(
        'root-id',
        'open-plain',
        'south',
        {
            pending: {
                north: 'unexplored'
            }
        },
        'corr-id',
        undefined,
        ['settlement:mosswell', 'frontier:boundary']
    )

    assert.ok(result.event)
    assert.equal(result.event?.payload.realmKey, 'settlement:mosswell')
})

describe('tryCreatePrefetchEvent: atlas-constrained batch shaping', () => {
    test('forbidden pending directions are excluded from batch size', () => {
        // south is in BOTH pending and forbidden → only north and east are eligible
        const result = tryCreatePrefetchEvent(
            'loc-forbidden-overlap',
            'open-plain',
            'west',
            {
                pending: { north: 'Wilderness', south: 'Blocked sea', east: 'Coastal shelf' },
                forbidden: { south: { reason: 'Open sea bars passage', motif: 'sea', reveal: 'onTryMove' } }
            },
            'corr-id'
        )

        assert.ok(result.event, 'event should be created since eligible exits exist')
        assert.equal(result.event!.payload.batchSize, 2, 'batch size must not include the forbidden south direction')
    })

    test('all pending directions forbidden → no event emitted', () => {
        const result = tryCreatePrefetchEvent(
            'loc-all-forbidden',
            'open-plain',
            'west',
            {
                pending: { south: 'Blocked' },
                forbidden: { south: { reason: 'Wall', motif: 'cliff', reveal: 'onTryMove' } }
            },
            'corr-id'
        )

        assert.equal(result.event, undefined, 'no event when all pending exits are forbidden')
        assert.equal(result.pendingExitCount, 0, 'pendingExitCount must be 0')
        assert.equal(result.debounced, false, 'should not be flagged as debounced')
    })

    test('selectedDirections is returned and reflects eligible atlas-scored directions', () => {
        getDebounceTracker().clear()

        const result = tryCreatePrefetchEvent(
            'loc-with-pending',
            'open-plain',
            'south',
            {
                pending: { north: 'Plains ahead', east: 'Forest edge' }
            },
            'corr-id'
        )

        assert.ok(result.event, 'event should be created')
        assert.ok(Array.isArray(result.selectedDirections), 'selectedDirections should be an array')
        assert.ok(result.selectedDirections!.includes('north'), 'north should be in selectedDirections')
        assert.ok(result.selectedDirections!.includes('east'), 'east should be in selectedDirections')
    })

    test('Mosswell atlas tags: route-continuity direction selected first when cap applies', () => {
        getDebounceTracker().clear()

        // north has route-continuity trend → highest score
        // northeast and northwest have no trend → score=0
        const result = tryCreatePrefetchEvent(
            'loc-northgate-style',
            'open-plain',
            'south',
            {
                pending: {
                    northeast: 'Into the uplands',
                    northwest: 'Toward hills',
                    north: 'Road continues north'
                }
            },
            'corr-id',
            { maxBatchSize: 1, debounceWindowMs: 0 },
            ['frontier:boundary', 'macro:area:lr-area-mosswell-fiordhead', 'macro:route:mw-route-harbor-to-northgate']
        )

        assert.ok(result.event, 'event should be created')
        assert.equal(result.event!.payload.batchSize, 1)
        assert.deepEqual(result.selectedDirections, ['north'], 'north should be chosen for its route-continuity atlas signal')
    })

    test('debounce still fires correctly after atlas-constrained selection', () => {
        getDebounceTracker().clear()

        const locId = 'loc-debounce-atlas'
        const params = [
            locId,
            'open-plain',
            'south',
            { pending: { north: 'Wilderness', east: 'Forest' } },
            'corr-id',
            { maxBatchSize: 20, debounceWindowMs: 60_000 }
        ] as const

        const first = tryCreatePrefetchEvent(...params)
        assert.ok(first.event, 'first call should create event')

        const second = tryCreatePrefetchEvent(...params)
        assert.equal(second.event, undefined, 'second call within debounce window should be suppressed')
        assert.equal(second.debounced, true, 'second call must be flagged as debounced')
    })
})
