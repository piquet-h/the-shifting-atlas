import assert from 'node:assert/strict'
import test from 'node:test'

import { createBatchGenerationEvent, tryCreatePrefetchEvent } from '../../src/services/prefetchBatchGeneration.js'

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
