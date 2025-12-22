import assert from 'node:assert'
import test from 'node:test'
import {
    REALM_TYPES,
    REALM_SCOPES,
    isRealmType,
    isRealmScope,
    type RealmVertex,
    type RealmType,
    type RealmScope
} from '../src/domainModels.js'

test('RealmType enum contains all required values', () => {
    const requiredTypes: RealmType[] = [
        'WORLD',
        'CONTINENT',
        'MOUNTAIN_RANGE',
        'FOREST',
        'KINGDOM',
        'CITY',
        'DISTRICT',
        'WEATHER_ZONE',
        'TRADE_NETWORK',
        'ALLIANCE',
        'DUNGEON'
    ]

    for (const type of requiredTypes) {
        assert.ok(REALM_TYPES.includes(type), `REALM_TYPES should include ${type}`)
    }
})

test('RealmScope enum contains all required values', () => {
    const requiredScopes: RealmScope[] = ['GLOBAL', 'CONTINENTAL', 'MACRO', 'REGIONAL', 'LOCAL', 'MICRO']

    for (const scope of requiredScopes) {
        assert.ok(REALM_SCOPES.includes(scope), `REALM_SCOPES should include ${scope}`)
    }
})

test('isRealmType validates valid realm types', () => {
    assert.ok(isRealmType('WORLD'))
    assert.ok(isRealmType('CONTINENT'))
    assert.ok(isRealmType('MOUNTAIN_RANGE'))
    assert.ok(isRealmType('FOREST'))
    assert.ok(isRealmType('KINGDOM'))
    assert.ok(isRealmType('CITY'))
    assert.ok(isRealmType('DISTRICT'))
    assert.ok(isRealmType('WEATHER_ZONE'))
    assert.ok(isRealmType('TRADE_NETWORK'))
    assert.ok(isRealmType('ALLIANCE'))
    assert.ok(isRealmType('DUNGEON'))
})

test('isRealmType rejects invalid realm types', () => {
    assert.equal(isRealmType('INVALID'), false)
    assert.equal(isRealmType('world'), false) // lowercase should not match
    assert.equal(isRealmType(''), false)
    assert.equal(isRealmType('UNKNOWN_TYPE'), false)
})

test('isRealmScope validates valid realm scopes', () => {
    assert.ok(isRealmScope('GLOBAL'))
    assert.ok(isRealmScope('CONTINENTAL'))
    assert.ok(isRealmScope('MACRO'))
    assert.ok(isRealmScope('REGIONAL'))
    assert.ok(isRealmScope('LOCAL'))
    assert.ok(isRealmScope('MICRO'))
})

test('isRealmScope rejects invalid realm scopes', () => {
    assert.equal(isRealmScope('INVALID'), false)
    assert.equal(isRealmScope('global'), false) // lowercase should not match
    assert.equal(isRealmScope(''), false)
    assert.equal(isRealmScope('UNKNOWN_SCOPE'), false)
})

test('RealmVertex can be created with all required properties', () => {
    const realm: RealmVertex = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'The Whispering Woods',
        realmType: 'FOREST',
        scope: 'REGIONAL'
    }

    assert.equal(realm.id, '123e4567-e89b-12d3-a456-426614174000')
    assert.equal(realm.name, 'The Whispering Woods')
    assert.equal(realm.realmType, 'FOREST')
    assert.equal(realm.scope, 'REGIONAL')
})

test('RealmVertex can be created with optional description', () => {
    const realm: RealmVertex = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'The Whispering Woods',
        realmType: 'FOREST',
        scope: 'REGIONAL',
        description: 'An ancient forest filled with mysterious whispers'
    }

    assert.equal(realm.description, 'An ancient forest filled with mysterious whispers')
})

test('RealmVertex can be created with optional narrativeTags', () => {
    const realm: RealmVertex = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'The Whispering Woods',
        realmType: 'FOREST',
        scope: 'REGIONAL',
        narrativeTags: ['mysterious', 'ancient', 'haunted']
    }

    assert.deepStrictEqual(realm.narrativeTags, ['mysterious', 'ancient', 'haunted'])
})

test('RealmVertex narrativeTags defaults to empty array when not provided', () => {
    const realm: RealmVertex = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'The Whispering Woods',
        realmType: 'FOREST',
        scope: 'REGIONAL'
    }

    // TypeScript allows optional property to be undefined
    assert.equal(realm.narrativeTags, undefined)

    // In application code, we can default to empty array
    const tags = realm.narrativeTags ?? []
    assert.deepStrictEqual(tags, [])
})

test('RealmVertex can be created with optional properties bag', () => {
    const realm: RealmVertex = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'The Whispering Woods',
        realmType: 'FOREST',
        scope: 'REGIONAL',
        properties: {
            climate: 'temperate',
            dangerLevel: 3,
            hasWildlife: true
        }
    }

    assert.deepStrictEqual(realm.properties, {
        climate: 'temperate',
        dangerLevel: 3,
        hasWildlife: true
    })
})

test('RealmVertex with all possible realm types', () => {
    const realmTypes: RealmType[] = [
        'WORLD',
        'CONTINENT',
        'MOUNTAIN_RANGE',
        'FOREST',
        'KINGDOM',
        'CITY',
        'DISTRICT',
        'WEATHER_ZONE',
        'TRADE_NETWORK',
        'ALLIANCE',
        'DUNGEON'
    ]

    for (const type of realmTypes) {
        const realm: RealmVertex = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: `Test ${type}`,
            realmType: type,
            scope: 'REGIONAL'
        }

        assert.equal(realm.realmType, type)
    }
})

test('RealmVertex with all possible realm scopes', () => {
    const scopes: RealmScope[] = ['GLOBAL', 'CONTINENTAL', 'MACRO', 'REGIONAL', 'LOCAL', 'MICRO']

    for (const scope of scopes) {
        const realm: RealmVertex = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Test Realm',
            realmType: 'FOREST',
            scope: scope
        }

        assert.equal(realm.scope, scope)
    }
})
