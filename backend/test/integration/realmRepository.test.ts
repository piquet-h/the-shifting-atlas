import { RealmVertex, RealmScope, RealmType } from '@piquet-h/shared'
import assert from 'node:assert'
import { afterEach, beforeEach, test } from 'node:test'
import { describeForBothModes } from '../helpers/describeForBothModes.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

describeForBothModes('Realm Repository', (mode) => {
    let fixture: IntegrationTestFixture

    beforeEach(async () => {
        fixture = new IntegrationTestFixture(mode)
        await fixture.setup()
    })

    afterEach(async () => {
        await fixture.teardown()
    })

    // --- Realm CRUD Operations ---

    test('upsert creates new realm', async () => {
        const repo = await fixture.getRealmRepository()
        const realm: RealmVertex = {
            id: 'test-realm-001',
            name: 'The Whispering Woods',
            realmType: 'FOREST' as RealmType,
            scope: 'REGIONAL' as RealmScope,
            description: 'An ancient forest filled with mysterious whispers'
        }

        const result = await repo.upsert(realm)

        assert.strictEqual(result.created, true)
        assert.strictEqual(result.id, 'test-realm-001')

        const retrieved = await repo.get('test-realm-001')
        assert.ok(retrieved)
        assert.strictEqual(retrieved.name, 'The Whispering Woods')
        assert.strictEqual(retrieved.realmType, 'FOREST')
        assert.strictEqual(retrieved.scope, 'REGIONAL')
    })

    test('get returns realm with all properties', async () => {
        const repo = await fixture.getRealmRepository()
        const realm: RealmVertex = {
            id: 'test-realm-002',
            name: 'Storm Coast',
            realmType: 'WEATHER_ZONE' as RealmType,
            scope: 'MACRO' as RealmScope,
            description: 'A coastal region with frequent storms',
            narrativeTags: ['dangerous', 'tempestuous'],
            properties: { climate: 'maritime', rainfall: 'high' }
        }

        await repo.upsert(realm)

        const retrieved = await repo.get('test-realm-002')
        assert.ok(retrieved)
        assert.strictEqual(retrieved.name, 'Storm Coast')
        assert.deepStrictEqual(retrieved.narrativeTags, ['dangerous', 'tempestuous'])
        assert.deepStrictEqual(retrieved.properties, { climate: 'maritime', rainfall: 'high' })
    })

    test('get returns undefined for non-existent realm', async () => {
        const repo = await fixture.getRealmRepository()
        const retrieved = await repo.get('non-existent-realm')
        assert.strictEqual(retrieved, undefined)
    })

    test('deleteRealm removes realm vertex', async () => {
        const repo = await fixture.getRealmRepository()
        const realm: RealmVertex = {
            id: 'test-realm-delete',
            name: 'Temporary Realm',
            realmType: 'DISTRICT' as RealmType,
            scope: 'LOCAL' as RealmScope
        }

        await repo.upsert(realm)
        const deleted = await repo.deleteRealm('test-realm-delete')
        assert.strictEqual(deleted.deleted, true)

        const retrieved = await repo.get('test-realm-delete')
        assert.strictEqual(retrieved, undefined)
    })

    // --- Within Edge (Containment Hierarchy) ---

    test('addWithinEdge creates containment relationship', async () => {
        const repo = await fixture.getRealmRepository()

        // Create parent and child realms
        const parent: RealmVertex = {
            id: 'parent-realm',
            name: 'Kingdom of Eldoria',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const child: RealmVertex = {
            id: 'child-realm',
            name: 'Duchy of Silverwood',
            realmType: 'DUCHY' as RealmType,
            scope: 'REGIONAL' as RealmScope
        }

        await repo.upsert(parent)
        await repo.upsert(child)

        const result = await repo.addWithinEdge('child-realm', 'parent-realm')
        assert.strictEqual(result.created, true)

        // Verify containment chain
        const chain = await repo.getContainmentChain('child-realm')
        assert.strictEqual(chain.length, 1)
        assert.strictEqual(chain[0].id, 'parent-realm')
    })

    test('addWithinEdge is idempotent (duplicate edge not created)', async () => {
        const repo = await fixture.getRealmRepository()

        const parent: RealmVertex = {
            id: 'parent-realm-2',
            name: 'Kingdom',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const child: RealmVertex = {
            id: 'child-realm-2',
            name: 'Duchy',
            realmType: 'DUCHY' as RealmType,
            scope: 'REGIONAL' as RealmScope
        }

        await repo.upsert(parent)
        await repo.upsert(child)

        const result1 = await repo.addWithinEdge('child-realm-2', 'parent-realm-2')
        assert.strictEqual(result1.created, true)

        const result2 = await repo.addWithinEdge('child-realm-2', 'parent-realm-2')
        assert.strictEqual(result2.created, false)
    })

    test('addWithinEdge rejects cycle creation', async () => {
        const repo = await fixture.getRealmRepository()

        const realm1: RealmVertex = {
            id: 'cycle-realm-1',
            name: 'Realm A',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const realm2: RealmVertex = {
            id: 'cycle-realm-2',
            name: 'Realm B',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }

        await repo.upsert(realm1)
        await repo.upsert(realm2)

        // Create A within B
        await repo.addWithinEdge('cycle-realm-1', 'cycle-realm-2')

        // Attempt to create B within A (would create cycle)
        await assert.rejects(
            async () => await repo.addWithinEdge('cycle-realm-2', 'cycle-realm-1'),
            (err: Error) => {
                assert.ok(err.message.includes('cycle'))
                return true
            }
        )
    })

    test('getContainmentChain returns multi-level hierarchy', async () => {
        const repo = await fixture.getRealmRepository()

        const world: RealmVertex = {
            id: 'world',
            name: 'The World',
            realmType: 'WORLD' as RealmType,
            scope: 'GLOBAL' as RealmScope
        }
        const continent: RealmVertex = {
            id: 'continent',
            name: 'Continent',
            realmType: 'CONTINENT' as RealmType,
            scope: 'CONTINENTAL' as RealmScope
        }
        const kingdom: RealmVertex = {
            id: 'kingdom',
            name: 'Kingdom',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }

        await repo.upsert(world)
        await repo.upsert(continent)
        await repo.upsert(kingdom)

        await repo.addWithinEdge('continent', 'world')
        await repo.addWithinEdge('kingdom', 'continent')

        const chain = await repo.getContainmentChain('kingdom')
        assert.strictEqual(chain.length, 2)
        assert.strictEqual(chain[0].id, 'continent')
        assert.strictEqual(chain[1].id, 'world')
    })

    // --- Member_of Edge (Overlapping Classification) ---

    test('addMembershipEdge creates membership relationship', async () => {
        const repo = await fixture.getRealmRepository()

        const tradeNetwork: RealmVertex = {
            id: 'trade-network',
            name: 'Merchant Guild Network',
            realmType: 'TRADE_NETWORK' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const city: RealmVertex = {
            id: 'city-member',
            name: 'Port City',
            realmType: 'CITY' as RealmType,
            scope: 'LOCAL' as RealmScope
        }

        await repo.upsert(tradeNetwork)
        await repo.upsert(city)

        const result = await repo.addMembershipEdge('city-member', 'trade-network')
        assert.strictEqual(result.created, true)

        const memberships = await repo.getMemberships('city-member')
        assert.strictEqual(memberships.length, 1)
        assert.strictEqual(memberships[0].id, 'trade-network')
    })

    test('getMemberships returns multiple memberships', async () => {
        const repo = await fixture.getRealmRepository()

        const network1: RealmVertex = {
            id: 'network-1',
            name: 'Trade Network 1',
            realmType: 'TRADE_NETWORK' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const network2: RealmVertex = {
            id: 'network-2',
            name: 'Alliance 1',
            realmType: 'ALLIANCE' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const city: RealmVertex = {
            id: 'multi-member-city',
            name: 'Hub City',
            realmType: 'CITY' as RealmType,
            scope: 'LOCAL' as RealmScope
        }

        await repo.upsert(network1)
        await repo.upsert(network2)
        await repo.upsert(city)

        await repo.addMembershipEdge('multi-member-city', 'network-1')
        await repo.addMembershipEdge('multi-member-city', 'network-2')

        const memberships = await repo.getMemberships('multi-member-city')
        assert.strictEqual(memberships.length, 2)
        const ids = memberships.map((m) => m.id).sort()
        assert.deepStrictEqual(ids, ['network-1', 'network-2'])
    })

    // --- Borders Edge (Adjacency) ---

    test('addBorderEdge creates bidirectional adjacency', async () => {
        const repo = await fixture.getRealmRepository()

        const realm1: RealmVertex = {
            id: 'border-realm-1',
            name: 'Kingdom A',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const realm2: RealmVertex = {
            id: 'border-realm-2',
            name: 'Kingdom B',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }

        await repo.upsert(realm1)
        await repo.upsert(realm2)

        const result = await repo.addBorderEdge('border-realm-1', 'border-realm-2')
        assert.strictEqual(result.created, true)
        assert.strictEqual(result.reciprocalCreated, true)

        // Check both directions
        const borders1 = await repo.getBorderingRealms('border-realm-1')
        assert.strictEqual(borders1.length, 1)
        assert.strictEqual(borders1[0].id, 'border-realm-2')

        const borders2 = await repo.getBorderingRealms('border-realm-2')
        assert.strictEqual(borders2.length, 1)
        assert.strictEqual(borders2[0].id, 'border-realm-1')
    })

    test('addBorderEdge rejects self-loop', async () => {
        const repo = await fixture.getRealmRepository()

        const realm: RealmVertex = {
            id: 'self-border-realm',
            name: 'Kingdom',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }

        await repo.upsert(realm)

        await assert.rejects(
            async () => await repo.addBorderEdge('self-border-realm', 'self-border-realm'),
            (err: Error) => {
                assert.ok(err.message.includes('self'))
                return true
            }
        )
    })

    // --- Route Edge (Infrastructure) ---

    test('addRouteEdge creates route with name property', async () => {
        const repo = await fixture.getRealmRepository()
        const locationRepo = await fixture.getLocationRepository()

        // Use existing locations from world seed
        const loc1Id = 'a4d1c3f1-5b2a-4f7d-9d4b-8f0c2a6b7e21' // Mosswell River Jetty
        const loc2Id = '8e6b4d2f-9a3c-4e1b-8f7d-2c5a9b6e3f01' // North Road

        const result = await repo.addRouteEdge(loc1Id, loc2Id, "The King's Road")
        assert.strictEqual(result.created, true)

        // Note: Querying route edge properties requires specific Gremlin query
        // This test verifies edge creation; property retrieval tested separately
    })

    // --- Political Edges ---

    test('addPoliticalEdge creates vassal relationship', async () => {
        const repo = await fixture.getRealmRepository()

        const empire: RealmVertex = {
            id: 'empire',
            name: 'Empire',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const vassal: RealmVertex = {
            id: 'vassal-kingdom',
            name: 'Vassal Kingdom',
            realmType: 'KINGDOM' as RealmType,
            scope: 'REGIONAL' as RealmScope
        }

        await repo.upsert(empire)
        await repo.upsert(vassal)

        const result = await repo.addPoliticalEdge('vassal-kingdom', 'empire', 'vassal_of')
        assert.strictEqual(result.created, true)
    })

    test('addPoliticalEdge creates alliance relationship', async () => {
        const repo = await fixture.getRealmRepository()

        const kingdom1: RealmVertex = {
            id: 'allied-kingdom-1',
            name: 'Kingdom 1',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const kingdom2: RealmVertex = {
            id: 'allied-kingdom-2',
            name: 'Kingdom 2',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }

        await repo.upsert(kingdom1)
        await repo.upsert(kingdom2)

        const result = await repo.addPoliticalEdge('allied-kingdom-1', 'allied-kingdom-2', 'allied_with')
        assert.strictEqual(result.created, true)
    })

    test('addPoliticalEdge creates war relationship', async () => {
        const repo = await fixture.getRealmRepository()

        const kingdom1: RealmVertex = {
            id: 'war-kingdom-1',
            name: 'Kingdom 1',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }
        const kingdom2: RealmVertex = {
            id: 'war-kingdom-2',
            name: 'Kingdom 2',
            realmType: 'KINGDOM' as RealmType,
            scope: 'MACRO' as RealmScope
        }

        await repo.upsert(kingdom1)
        await repo.upsert(kingdom2)

        const result = await repo.addPoliticalEdge('war-kingdom-1', 'war-kingdom-2', 'at_war_with')
        assert.strictEqual(result.created, true)
    })
})
