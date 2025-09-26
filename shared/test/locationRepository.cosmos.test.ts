import assert from 'node:assert'
import {test} from 'node:test'
import {CosmosLocationRepository} from '../src/repos/locationRepository.cosmos.js'

type VertexMap = Record<string, Record<string, unknown>>
type ExitArray = Array<Record<string, unknown>>

class FakeGremlinClient {
    constructor(private data: {locations: VertexMap; exits: Record<string, ExitArray>}) {}
    async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        if (query.startsWith('g.V') && query.includes('valueMap(true)')) {
            const id = bindings?.locationId as string
            const r = this.data.locations[id]
            return r ? [r as T] : []
        }
        if (query.includes("outE('exit')")) {
            const id = bindings?.locationId as string
            return (this.data.exits[id] || []) as unknown as T[]
        }
        throw new Error('Unexpected query: ' + query)
    }
}

test('cosmos location repository get + move', async () => {
    const locA: Record<string, unknown> = {id: 'A', name: ['Alpha'], description: ['Location A']}
    const locB: Record<string, unknown> = {id: 'B', name: ['Beta'], description: ['Location B']}
    const exitsA = [{direction: 'north', to: 'B', description: 'to beta'}]
    const fake = new FakeGremlinClient({locations: {A: locA, B: locB}, exits: {A: exitsA as ExitArray, B: []}})
    const repo = new CosmosLocationRepository(fake as unknown as {submit: <T>(q: string, b?: Record<string, unknown>) => Promise<T[]>})
    const gotA = await repo.get('A')
    assert.ok(gotA)
    assert.equal(gotA?.exits?.length, 1)
    const move = await repo.move('A', 'north')
    assert.equal(move.status, 'ok')
    assert.equal((move as {status: string; location: {id: string}}).location.id, 'B')
    const bad = await repo.move('A', 'south')
    assert.equal(bad.status, 'error')
})
