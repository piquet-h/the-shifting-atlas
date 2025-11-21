/**
 * Unit tests for ILocationRepository interface contract
 * Tests interface methods exist with expected signatures and return types
 */

import type { Location, MoveResult } from '@piquet-h/shared'
import assert from 'node:assert'
import { describe, test } from 'node:test'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'

describe('ILocationRepository Interface Contract', () => {
    // Mock implementation for testing interface contract
    class MockLocationRepository implements ILocationRepository {
        async get(id: string): Promise<Location | undefined> {
            return {
                id,
                name: 'Mock Location',
                description: 'Mock description',
                exits: []
            }
        }

        // Parameters intentionally unused in mock implementation; underscore prefixes silence lint
        async move(): Promise<MoveResult> {
            return {
                status: 'ok',
                location: {
                    id: 'new-loc',
                    name: 'New Location',
                    description: 'New description',
                    exits: []
                }
            }
        }

        async listAll(): Promise<Location[]> {
            return []
        }

        async upsert(location: Location): Promise<{ created: boolean; id: string; updatedRevision?: number }> {
            return { created: true, id: location.id }
        }

        async ensureExit(): Promise<{ created: boolean }> {
            return { created: true }
        }

        async ensureExitBidirectional(
            _fromId: string,
            _direction: string,
            _toId: string,
            options?: { reciprocal?: boolean }
        ): Promise<{ created: boolean; reciprocalCreated?: boolean }> {
            // Explicitly return boolean flags to satisfy interface contract regardless of parameters
            return { created: true, reciprocalCreated: options?.reciprocal === true }
        }

        async removeExit(): Promise<{ removed: boolean }> {
            return { removed: true }
        }

        async deleteLocation(): Promise<{ deleted: boolean }> {
            return { deleted: true }
        }
    }

    test('get method returns Location or undefined', async () => {
        const repo: ILocationRepository = new MockLocationRepository()
        const result = await repo.get('test-id')

        assert.ok(typeof result === 'object' || result === undefined)
        if (result) {
            assert.ok('id' in result)
            assert.ok('name' in result)
            assert.ok('description' in result)
            assert.ok('exits' in result)
        }
    })

    test('move method returns MoveResult with status', async () => {
        const repo: ILocationRepository = new MockLocationRepository()
        const result = await repo.move('from-id', 'north')

        assert.ok(typeof result === 'object')
        assert.ok('status' in result)
        assert.ok(result.status === 'ok' || result.status === 'error')
    })

    test('listAll method returns array of Locations', async () => {
        const repo: ILocationRepository = new MockLocationRepository()
        const result = await repo.listAll()

        assert.ok(Array.isArray(result))
    })

    test('upsert method returns created flag and id', async () => {
        const repo: ILocationRepository = new MockLocationRepository()
        const location: Location = {
            id: 'test-id',
            name: 'Test',
            description: 'Test location',
            exits: []
        }
        const result = await repo.upsert(location)

        assert.ok(typeof result === 'object')
        assert.ok('created' in result)
        assert.ok('id' in result)
        assert.strictEqual(typeof result.created, 'boolean')
        assert.strictEqual(typeof result.id, 'string')
    })

    test('ensureExit method returns created flag', async () => {
        const repo: ILocationRepository = new MockLocationRepository()
        const result = await repo.ensureExit('from-id', 'north', 'to-id')

        assert.ok(typeof result === 'object')
        assert.ok('created' in result)
        assert.strictEqual(typeof result.created, 'boolean')
    })

    test('ensureExitBidirectional method returns created flags', async () => {
        const repo: ILocationRepository = new MockLocationRepository()
        const result = await repo.ensureExitBidirectional('from-id', 'north', 'to-id', { reciprocal: true })

        assert.ok(typeof result === 'object')
        assert.ok('created' in result)
        assert.strictEqual(typeof result.created, 'boolean')
        if ('reciprocalCreated' in result) {
            assert.strictEqual(typeof result.reciprocalCreated, 'boolean')
        }
    })

    test('removeExit method returns removed flag', async () => {
        const repo: ILocationRepository = new MockLocationRepository()
        const result = await repo.removeExit('from-id', 'north')

        assert.ok(typeof result === 'object')
        assert.ok('removed' in result)
        assert.strictEqual(typeof result.removed, 'boolean')
    })

    test('deleteLocation method returns deleted flag', async () => {
        const repo: ILocationRepository = new MockLocationRepository()
        const result = await repo.deleteLocation('loc-id')

        assert.ok(typeof result === 'object')
        assert.ok('deleted' in result)
        assert.strictEqual(typeof result.deleted, 'boolean')
    })
})
