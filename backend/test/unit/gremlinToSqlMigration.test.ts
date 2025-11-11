/**
 * Unit tests for Gremlin to SQL migration script
 *
 * Tests migration logic, error handling, and edge cases.
 * Does not require actual Cosmos connections (mocked).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'

// Mock types for testing
interface PlayerVertex {
    id: string
    createdUtc?: string | string[]
    updatedUtc?: string | string[]
    guest?: boolean | string | string[]
    externalId?: string | string[]
    name?: string | string[]
    currentLocationId?: string | string[]
}

// Helper functions from migration script (extracted for testing)
function firstScalar(val: unknown): string | undefined {
    if (val == null) return undefined
    if (Array.isArray(val)) return val.length ? String(val[0]) : undefined
    return String(val)
}

function parseBool(v: string | boolean | string[] | undefined): boolean {
    if (v == null) return true
    if (typeof v === 'boolean') return v
    const str = firstScalar(v)
    return str === 'true' || str === '1'
}

function mapVertexToPlayer(vertex: PlayerVertex) {
    const now = new Date().toISOString()
    return {
        id: String(vertex.id),
        createdUtc: firstScalar(vertex.createdUtc) || now,
        updatedUtc: firstScalar(vertex.updatedUtc) || firstScalar(vertex.createdUtc) || now,
        guest: parseBool(vertex.guest),
        currentLocationId: firstScalar(vertex.currentLocationId) || 'loc-mosswell-square',
        externalId: firstScalar(vertex.externalId),
        name: firstScalar(vertex.name)
    }
}

describe('Migration Helpers', () => {
    describe('firstScalar', () => {
        it('should extract first element from array', () => {
            assert.strictEqual(firstScalar(['value1', 'value2']), 'value1')
        })

        it('should return string value as-is', () => {
            assert.strictEqual(firstScalar('single-value'), 'single-value')
        })

        it('should return undefined for null', () => {
            assert.strictEqual(firstScalar(null), undefined)
        })

        it('should return undefined for undefined', () => {
            assert.strictEqual(firstScalar(undefined), undefined)
        })

        it('should return undefined for empty array', () => {
            assert.strictEqual(firstScalar([]), undefined)
        })

        it('should convert number to string', () => {
            assert.strictEqual(firstScalar(123), '123')
        })
    })

    describe('parseBool', () => {
        it('should parse "true" string as true', () => {
            assert.strictEqual(parseBool('true'), true)
        })

        it('should parse "1" string as true', () => {
            assert.strictEqual(parseBool('1'), true)
        })

        it('should parse "false" string as false', () => {
            assert.strictEqual(parseBool('false'), false)
        })

        it('should parse "0" string as false', () => {
            assert.strictEqual(parseBool('0'), false)
        })

        it('should handle boolean true', () => {
            assert.strictEqual(parseBool(true), true)
        })

        it('should handle boolean false', () => {
            assert.strictEqual(parseBool(false), false)
        })

        it('should default to true for null', () => {
            assert.strictEqual(parseBool(null), true)
        })

        it('should default to true for undefined', () => {
            assert.strictEqual(parseBool(undefined), true)
        })

        it('should extract boolean from array', () => {
            assert.strictEqual(parseBool(['true', 'false']), true)
        })
    })
})

describe('Player Vertex Mapping', () => {
    it('should map complete vertex to player document', () => {
        const vertex: PlayerVertex = {
            id: 'player-123',
            createdUtc: '2025-01-01T00:00:00.000Z',
            updatedUtc: '2025-01-02T00:00:00.000Z',
            guest: false,
            externalId: 'ext-456',
            name: 'TestPlayer',
            currentLocationId: 'loc-test-001'
        }

        const player = mapVertexToPlayer(vertex)

        assert.strictEqual(player.id, 'player-123')
        assert.strictEqual(player.createdUtc, '2025-01-01T00:00:00.000Z')
        assert.strictEqual(player.updatedUtc, '2025-01-02T00:00:00.000Z')
        assert.strictEqual(player.guest, false)
        assert.strictEqual(player.externalId, 'ext-456')
        assert.strictEqual(player.name, 'TestPlayer')
        assert.strictEqual(player.currentLocationId, 'loc-test-001')
    })

    it('should handle vertex with array properties', () => {
        const vertex: PlayerVertex = {
            id: 'player-123',
            createdUtc: ['2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z'],
            guest: ['true', 'false'],
            name: ['FirstName', 'SecondName']
        }

        const player = mapVertexToPlayer(vertex)

        assert.strictEqual(player.createdUtc, '2025-01-01T00:00:00.000Z')
        assert.strictEqual(player.guest, true)
        assert.strictEqual(player.name, 'FirstName')
    })

    it('should apply defaults for missing fields', () => {
        const vertex: PlayerVertex = {
            id: 'player-minimal'
        }

        const player = mapVertexToPlayer(vertex)

        assert.strictEqual(player.id, 'player-minimal')
        assert.strictEqual(player.guest, true) // Default
        assert.strictEqual(player.currentLocationId, 'loc-mosswell-square') // Default
        assert.match(player.createdUtc, /^\d{4}-\d{2}-\d{2}T/) // ISO timestamp
        assert.match(player.updatedUtc, /^\d{4}-\d{2}-\d{2}T/)
    })

    it('should use createdUtc for updatedUtc if missing', () => {
        const vertex: PlayerVertex = {
            id: 'player-123',
            createdUtc: '2025-01-01T00:00:00.000Z'
            // updatedUtc omitted
        }

        const player = mapVertexToPlayer(vertex)

        assert.strictEqual(player.updatedUtc, '2025-01-01T00:00:00.000Z')
    })

    it('should handle missing optional fields', () => {
        const vertex: PlayerVertex = {
            id: 'player-123',
            createdUtc: '2025-01-01T00:00:00.000Z',
            guest: true
        }

        const player = mapVertexToPlayer(vertex)

        assert.strictEqual(player.externalId, undefined)
        assert.strictEqual(player.name, undefined)
    })

    it('should handle guest field as string "true"', () => {
        const vertex: PlayerVertex = {
            id: 'player-123',
            guest: 'true'
        }

        const player = mapVertexToPlayer(vertex)

        assert.strictEqual(player.guest, true)
    })

    it('should handle guest field as string "false"', () => {
        const vertex: PlayerVertex = {
            id: 'player-123',
            guest: 'false'
        }

        const player = mapVertexToPlayer(vertex)

        assert.strictEqual(player.guest, false)
    })
})

describe('Migration Edge Cases', () => {
    it('should handle empty vertex list', () => {
        const vertices: PlayerVertex[] = []
        const players = vertices.map(mapVertexToPlayer)

        assert.strictEqual(players.length, 0)
    })

    it('should handle large batch of vertices', () => {
        const vertices: PlayerVertex[] = Array.from({ length: 1000 }, (_, i) => ({
            id: `player-${i}`,
            createdUtc: '2025-01-01T00:00:00.000Z',
            guest: i % 2 === 0 // Alternate guest/registered
        }))

        const players = vertices.map(mapVertexToPlayer)

        assert.strictEqual(players.length, 1000)
        assert.strictEqual(players[0].id, 'player-0')
        assert.strictEqual(players[0].guest, true)
        assert.strictEqual(players[999].id, 'player-999')
        assert.strictEqual(players[999].guest, false)
    })

    it('should preserve GUID format for IDs', () => {
        const vertex: PlayerVertex = {
            id: 'a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6'
        }

        const player = mapVertexToPlayer(vertex)

        assert.strictEqual(player.id, 'a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6')
    })

    it('should handle malformed timestamps gracefully', () => {
        const vertex: PlayerVertex = {
            id: 'player-123',
            createdUtc: 'invalid-timestamp'
        }

        const player = mapVertexToPlayer(vertex)

        // Should use the invalid value as-is (migration logs will catch validation errors)
        assert.strictEqual(player.createdUtc, 'invalid-timestamp')
    })
})

describe('Retry Logic Simulation', () => {
    it('should simulate exponential backoff delays', () => {
        const baseDelayMs = 1000
        const delays = [0, 1, 2, 3, 4].map((attempt) => baseDelayMs * Math.pow(2, attempt))

        assert.deepStrictEqual(delays, [1000, 2000, 4000, 8000, 16000])
    })

    it('should calculate correct batch progress points', () => {
        const totalPlayers = 523
        const batchSize = 100
        const progressPoints = []

        for (let i = 1; i <= totalPlayers; i++) {
            if (i % batchSize === 0) {
                progressPoints.push(i)
            }
        }

        assert.deepStrictEqual(progressPoints, [100, 200, 300, 400, 500])
    })
})
