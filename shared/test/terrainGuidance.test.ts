import assert from 'node:assert'
import test from 'node:test'
import { TERRAIN_GUIDANCE, type TerrainType, TERRAIN_TYPES } from '../src/config/terrainGuidance.js'
import { type Direction } from '../src/domainModels.js'

test('TERRAIN_GUIDANCE contains all required terrain types', () => {
    const requiredTerrains: TerrainType[] = ['open-plain', 'dense-forest', 'hilltop', 'riverbank', 'narrow-corridor']

    for (const terrain of requiredTerrains) {
        assert.ok(TERRAIN_GUIDANCE[terrain], `TERRAIN_GUIDANCE should include ${terrain}`)
    }
})

test('open-plain terrain has correct configuration', () => {
    const config = TERRAIN_GUIDANCE['open-plain']

    assert.equal(config.typicalExitCount, 4)
    assert.equal(config.exitPattern, 'cardinal')
    assert.ok(config.promptHint.length > 0)
    assert.ok(config.promptHint.length <= 500, 'Prompt hint should be <= 500 characters')
    assert.deepStrictEqual(config.defaultDirections, ['north', 'south', 'east', 'west'])
})

test('dense-forest terrain has correct configuration', () => {
    const config = TERRAIN_GUIDANCE['dense-forest']

    assert.equal(config.typicalExitCount, 2)
    assert.equal(config.exitPattern, 'linear')
    assert.ok(config.promptHint.length > 0)
    assert.ok(config.promptHint.length <= 500, 'Prompt hint should be <= 500 characters')
    assert.deepStrictEqual(config.defaultDirections, [])
})

test('hilltop terrain has correct configuration', () => {
    const config = TERRAIN_GUIDANCE['hilltop']

    assert.equal(config.typicalExitCount, 5)
    assert.equal(config.exitPattern, 'radial')
    assert.ok(config.promptHint.length > 0)
    assert.ok(config.promptHint.length <= 500, 'Prompt hint should be <= 500 characters')

    const expectedDirections: Direction[] = ['north', 'south', 'east', 'west', 'down']
    assert.deepStrictEqual(config.defaultDirections, expectedDirections)
})

test('riverbank terrain has correct configuration', () => {
    const config = TERRAIN_GUIDANCE['riverbank']

    assert.equal(config.typicalExitCount, 3)
    assert.equal(config.exitPattern, 'custom')
    assert.ok(config.promptHint.length > 0)
    assert.ok(config.promptHint.length <= 500, 'Prompt hint should be <= 500 characters')
    // Riverbank has custom pattern, defaultDirections may vary but should have 3 entries or be empty for AI to decide
    assert.ok(Array.isArray(config.defaultDirections))
})

test('narrow-corridor terrain has correct configuration', () => {
    const config = TERRAIN_GUIDANCE['narrow-corridor']

    assert.equal(config.typicalExitCount, 2)
    assert.equal(config.exitPattern, 'linear')
    assert.ok(config.promptHint.length > 0)
    assert.ok(config.promptHint.length <= 500, 'Prompt hint should be <= 500 characters')
    assert.deepStrictEqual(config.defaultDirections, [])
})

test('all terrain guidance configs have valid schema structure', () => {
    for (const [terrain, config] of Object.entries(TERRAIN_GUIDANCE)) {
        assert.ok(typeof config.typicalExitCount === 'number', `${terrain}: typicalExitCount should be number`)
        assert.ok(config.typicalExitCount >= 0, `${terrain}: typicalExitCount should be >= 0`)

        assert.ok(
            ['cardinal', 'linear', 'radial', 'custom'].includes(config.exitPattern),
            `${terrain}: exitPattern should be one of cardinal, linear, radial, custom`
        )

        assert.ok(typeof config.promptHint === 'string', `${terrain}: promptHint should be string`)
        assert.ok(config.promptHint.length > 0, `${terrain}: promptHint should not be empty`)
        assert.ok(config.promptHint.length <= 500, `${terrain}: promptHint should be <= 500 characters`)

        assert.ok(Array.isArray(config.defaultDirections), `${terrain}: defaultDirections should be array`)
    }
})

test('all prompt hints meet length constraint', () => {
    for (const [terrain, config] of Object.entries(TERRAIN_GUIDANCE)) {
        assert.ok(
            config.promptHint.length <= 500,
            `${terrain}: promptHint length (${config.promptHint.length}) exceeds 500 character limit`
        )
    }
})

test('defaultDirections contain only valid Direction values', () => {
    const validDirections: Direction[] = [
        'north',
        'south',
        'east',
        'west',
        'northeast',
        'northwest',
        'southeast',
        'southwest',
        'up',
        'down',
        'in',
        'out'
    ]

    for (const [terrain, config] of Object.entries(TERRAIN_GUIDANCE)) {
        for (const direction of config.defaultDirections) {
            assert.ok(validDirections.includes(direction), `${terrain}: defaultDirections contains invalid direction ${direction}`)
        }
    }
})

test('TERRAIN_TYPES array contains all terrain types', () => {
    const expectedTerrains: TerrainType[] = ['open-plain', 'dense-forest', 'hilltop', 'riverbank', 'narrow-corridor']

    assert.equal(TERRAIN_TYPES.length, expectedTerrains.length)
    for (const terrain of expectedTerrains) {
        assert.ok(TERRAIN_TYPES.includes(terrain), `TERRAIN_TYPES should include ${terrain}`)
    }
})

test('open-plain prompt hint matches expected guidance', () => {
    const config = TERRAIN_GUIDANCE['open-plain']
    assert.ok(
        config.promptHint.includes('multiple directions') || config.promptHint.includes('narrative obstacles'),
        'open-plain promptHint should mention multiple directions or narrative obstacles'
    )
})

test('dense-forest prompt hint matches expected guidance', () => {
    const config = TERRAIN_GUIDANCE['dense-forest']
    assert.ok(
        config.promptHint.includes('forest') || config.promptHint.includes('clearings') || config.promptHint.includes('paths'),
        'dense-forest promptHint should mention forest-specific guidance'
    )
})

test('hilltop prompt hint matches expected guidance', () => {
    const config = TERRAIN_GUIDANCE['hilltop']
    assert.ok(
        config.promptHint.includes('hilltop') || config.promptHint.includes('descent') || config.promptHint.includes('views'),
        'hilltop promptHint should mention hilltop-specific guidance'
    )
})

test('empty defaultDirections array is valid (AI must justify)', () => {
    const config = TERRAIN_GUIDANCE['dense-forest']
    assert.deepStrictEqual(config.defaultDirections, [], 'dense-forest should have empty defaultDirections')

    const config2 = TERRAIN_GUIDANCE['narrow-corridor']
    assert.deepStrictEqual(config2.defaultDirections, [], 'narrow-corridor should have empty defaultDirections')
})
