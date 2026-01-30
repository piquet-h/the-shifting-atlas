import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { buildFindActiveLayerQuerySpec, buildLayerHistoryQuerySpec } from '../../src/repos/sqlQueries/layerQueries.js'

describe('Cosmos SQL layer query specs', () => {
    it('buildFindActiveLayerQuerySpec uses Cosmos-supported null checks (no IS NULL)', () => {
        const { query, parameters } = buildFindActiveLayerQuerySpec({
            scopeId: 'loc:abc',
            layerType: 'ambient',
            tick: 0
        })

        assert.ok(query.includes('NOT IS_DEFINED(c.effectiveToTick)'))
        assert.ok(query.includes('c.effectiveToTick = null'))
        assert.equal(query.includes('IS NULL'), false)

        const tickParam = parameters.find((p) => p.name === '@tick')
        assert.deepEqual(tickParam, { name: '@tick', value: 0 })
    })

    it('buildLayerHistoryQuerySpec uses Cosmos-supported null checks for endTick (no IS NULL)', () => {
        const { query, parameters } = buildLayerHistoryQuerySpec({
            scopeId: 'loc:abc',
            layerType: 'ambient',
            startTick: 10,
            endTick: 20
        })

        assert.ok(query.includes('NOT IS_DEFINED(c.effectiveToTick)'))
        assert.ok(query.includes('c.effectiveToTick = null'))
        assert.equal(query.includes('IS NULL'), false)

        assert.deepEqual(parameters, [
            { name: '@scopeId', value: 'loc:abc' },
            { name: '@layerType', value: 'ambient' },
            { name: '@startTick', value: 10 },
            { name: '@endTick', value: 20 }
        ])
    })
})
