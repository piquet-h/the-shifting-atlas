import assert from 'node:assert'
import {test} from 'node:test'
import {CosmosRoomRepository} from '../src/repos/roomRepository.cosmos.js'

class FakeGremlinClient {
    constructor(private data: {rooms: Record<string, any>; exits: Record<string, any[]>}) {}
    async submit<T>(query: string, bindings?: Record<string, unknown>): Promise<T[]> {
        if (query.startsWith('g.V') && query.includes('valueMap(true)')) {
            const id = bindings?.roomId as string
            const r = this.data.rooms[id]
            return r ? [r as T] : []
        }
        if (query.includes("outE('exit')")) {
            const id = bindings?.roomId as string
            return (this.data.exits[id] || []) as unknown as T[]
        }
        throw new Error('Unexpected query: ' + query)
    }
}

test('cosmos room repository get + move', async () => {
    const roomA: any = {id: 'A', name: ['Alpha'], description: ['Room A']}
    const roomB: any = {id: 'B', name: ['Beta'], description: ['Room B']}
    const exitsA = [{direction: 'north', to: 'B', description: 'to beta'}]
    const fake = new FakeGremlinClient({rooms: {A: roomA, B: roomB}, exits: {A: exitsA, B: []}})
    const repo = new CosmosRoomRepository(fake as any)
    const gotA = await repo.get('A')
    assert.ok(gotA)
    assert.equal(gotA?.exits?.length, 1)
    const move = await repo.move('A', 'north')
    assert.equal(move.status, 'ok')
    assert.equal((move as any).room.id, 'B')
    const bad = await repo.move('A', 'south')
    assert.equal(bad.status, 'error')
})
