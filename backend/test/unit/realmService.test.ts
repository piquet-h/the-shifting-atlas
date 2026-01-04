/**
 * Unit tests for RealmService - Query realm containment hierarchy
 *
 * Test coverage:
 * - Single realm containment
 * - Multi-tier hierarchy traversal
 * - Filter by realmType
 * - Aggregate and dedupe narrative tags
 * - Location context assembly
 * - Edge cases: no realms, type filtering, duplicate tags
 */

import assert from 'node:assert'
import { describe, it, beforeEach } from 'node:test'
import type { RealmVertex, Location } from '@piquet-h/shared'
import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import { RealmService } from '../../dist/src/services/RealmService.js'

// Mock repositories
class MockRealmRepository {
    private realms: Map<string, RealmVertex> = new Map()
    private containmentChains: Map<string, RealmVertex[]> = new Map()

    setRealm(realm: RealmVertex) {
        this.realms.set(realm.id, realm)
    }

    setContainmentChain(entityId: string, chain: RealmVertex[]) {
        this.containmentChains.set(entityId, chain)
    }

    async getContainmentChain(entityId: string): Promise<RealmVertex[]> {
        return this.containmentChains.get(entityId) || []
    }

    async get(id: string): Promise<RealmVertex | undefined> {
        return this.realms.get(id)
    }

    // Stub other methods required by interface
    async upsert(): Promise<{ created: boolean; id: string }> {
        return { created: false, id: '' }
    }
    async addWithinEdge(): Promise<{ created: boolean }> {
        return { created: false }
    }
    async addMembershipEdge(): Promise<{ created: boolean }> {
        return { created: false }
    }
    async addBorderEdge(): Promise<{ created: boolean; reciprocalCreated: boolean }> {
        return { created: false, reciprocalCreated: false }
    }
    async addRouteEdge(): Promise<{ created: boolean }> {
        return { created: false }
    }
    async addPoliticalEdge(): Promise<{ created: boolean }> {
        return { created: false }
    }
    async getMemberships(): Promise<RealmVertex[]> {
        return []
    }
    async getBorderingRealms(): Promise<RealmVertex[]> {
        return []
    }
    async deleteRealm(): Promise<{ deleted: boolean }> {
        return { deleted: false }
    }
    async getWeatherZoneForLocation(): Promise<RealmVertex | null> {
        return null
    }
}

class MockLocationRepository {
    private locations: Map<string, Location> = new Map()

    setLocation(location: Location) {
        this.locations.set(location.id, location)
    }

    async get(id: string): Promise<Location | undefined> {
        return this.locations.get(id)
    }

    // Stub other methods
    async upsert(): Promise<{ created: boolean; id: string; version: number }> {
        return { created: false, id: '', version: 1 }
    }
    async delete(): Promise<{ deleted: boolean }> {
        return { deleted: false }
    }
    async listAll(): Promise<Location[]> {
        return []
    }
    async updateExitsSummaryCache(): Promise<void> {}
    async regenerateExitsSummaryCache(): Promise<void> {}
}

class MockLayerRepository {
    private layers: Map<string, DescriptionLayer[]> = new Map()

    setLayersForLocation(locationId: string, layers: DescriptionLayer[]) {
        this.layers.set(locationId, layers)
    }

    async getActiveLayerForLocation(locationId: string, layerType: string, tick: number): Promise<DescriptionLayer | null> {
        const layers = this.layers.get(locationId) || []
        const layer = layers.find(
            (l) => l.layerType === layerType && l.effectiveFromTick <= tick && (l.effectiveToTick === null || l.effectiveToTick >= tick)
        )
        return layer || null
    }

    // Stub other methods
    async setLayerForRealm(): Promise<DescriptionLayer> {
        return {} as DescriptionLayer
    }
    async setLayerForLocation(): Promise<DescriptionLayer> {
        return {} as DescriptionLayer
    }
    async getActiveLayer(): Promise<DescriptionLayer | null> {
        return null
    }
    async setLayerInterval(): Promise<DescriptionLayer> {
        return {} as DescriptionLayer
    }
    async queryLayerHistory(): Promise<DescriptionLayer[]> {
        return []
    }
    async getLayersForLocation(): Promise<DescriptionLayer[]> {
        return []
    }
    async addLayer(): Promise<DescriptionLayer> {
        return {} as DescriptionLayer
    }
    async updateLayer(): Promise<DescriptionLayer | null> {
        return null
    }
    async deleteLayer(): Promise<boolean> {
        return false
    }
}

class MockTelemetryService {
    trackGameEvent() {}
    trackException() {}
}

describe('RealmService - Unit Tests', () => {
    let realmService: RealmService
    let mockRealmRepo: MockRealmRepository
    let mockLocationRepo: MockLocationRepository
    let mockLayerRepo: MockLayerRepository
    let mockTelemetry: MockTelemetryService

    beforeEach(() => {
        mockRealmRepo = new MockRealmRepository()
        mockLocationRepo = new MockLocationRepository()
        mockLayerRepo = new MockLayerRepository()
        mockTelemetry = new MockTelemetryService()

        realmService = new RealmService(mockRealmRepo as any, mockLocationRepo as any, mockLayerRepo as any, mockTelemetry as any)
    })

    describe('getContainingRealms', () => {
        it('should return single realm containment', async () => {
            const district: RealmVertex = {
                id: 'district-1',
                name: 'Market District',
                realmType: 'DISTRICT',
                scope: 'LOCAL',
                narrativeTags: ['bustling', 'commercial']
            }

            mockRealmRepo.setContainmentChain('location-1', [district])

            const result = await realmService.getContainingRealms('location-1')

            assert.strictEqual(result.length, 1)
            assert.strictEqual(result[0].id, 'district-1')
            assert.strictEqual(result[0].name, 'Market District')
        })

        it('should return multi-tier hierarchy', async () => {
            const district: RealmVertex = {
                id: 'district-1',
                name: 'Market District',
                realmType: 'DISTRICT',
                scope: 'LOCAL'
            }

            const city: RealmVertex = {
                id: 'city-1',
                name: 'Waterdeep',
                realmType: 'CITY',
                scope: 'REGIONAL'
            }

            const kingdom: RealmVertex = {
                id: 'kingdom-1',
                name: 'Sword Coast',
                realmType: 'KINGDOM',
                scope: 'MACRO'
            }

            const continent: RealmVertex = {
                id: 'continent-1',
                name: 'Faerûn',
                realmType: 'CONTINENT',
                scope: 'CONTINENTAL'
            }

            mockRealmRepo.setContainmentChain('location-1', [district, city, kingdom, continent])

            const result = await realmService.getContainingRealms('location-1')

            assert.strictEqual(result.length, 4)
            assert.strictEqual(result[0].name, 'Market District')
            assert.strictEqual(result[1].name, 'Waterdeep')
            assert.strictEqual(result[2].name, 'Sword Coast')
            assert.strictEqual(result[3].name, 'Faerûn')
        })

        it('should filter by realm type', async () => {
            const district: RealmVertex = {
                id: 'district-1',
                name: 'Market District',
                realmType: 'DISTRICT',
                scope: 'LOCAL'
            }

            const city: RealmVertex = {
                id: 'city-1',
                name: 'Waterdeep',
                realmType: 'CITY',
                scope: 'REGIONAL'
            }

            const kingdom: RealmVertex = {
                id: 'kingdom-1',
                name: 'Sword Coast',
                realmType: 'KINGDOM',
                scope: 'MACRO'
            }

            mockRealmRepo.setContainmentChain('location-1', [district, city, kingdom])

            const result = await realmService.getContainingRealms('location-1', ['CITY', 'KINGDOM'])

            assert.strictEqual(result.length, 2)
            assert.strictEqual(result[0].name, 'Waterdeep')
            assert.strictEqual(result[1].name, 'Sword Coast')
        })

        it('should return empty array when location has no realms', async () => {
            mockRealmRepo.setContainmentChain('location-1', [])

            const result = await realmService.getContainingRealms('location-1')

            assert.strictEqual(result.length, 0)
        })

        it('should return empty array when filtered type not found', async () => {
            const district: RealmVertex = {
                id: 'district-1',
                name: 'Market District',
                realmType: 'DISTRICT',
                scope: 'LOCAL'
            }

            mockRealmRepo.setContainmentChain('location-1', [district])

            const result = await realmService.getContainingRealms('location-1', ['WEATHER_ZONE'])

            assert.strictEqual(result.length, 0)
        })
    })

    describe('getLocationContext', () => {
        it('should assemble full location context', async () => {
            const location: Location = {
                id: 'location-1',
                name: 'Town Square',
                description: 'A bustling town square',
                exits: [
                    { direction: 'north', to: 'location-2' },
                    { direction: 'south', to: 'location-3' }
                ]
            }

            const adjacentLocation1: Location = {
                id: 'location-2',
                name: 'North Street',
                description: 'A quiet street',
                exits: []
            }

            const adjacentLocation2: Location = {
                id: 'location-3',
                name: 'South Market',
                description: 'A busy market',
                exits: []
            }

            const district: RealmVertex = {
                id: 'district-1',
                name: 'Market District',
                realmType: 'DISTRICT',
                scope: 'LOCAL',
                narrativeTags: ['bustling']
            }

            const city: RealmVertex = {
                id: 'city-1',
                name: 'Waterdeep',
                realmType: 'CITY',
                scope: 'REGIONAL',
                narrativeTags: ['coastal']
            }

            const weatherZone: RealmVertex = {
                id: 'weather-1',
                name: 'Temperate Zone',
                realmType: 'WEATHER_ZONE',
                scope: 'MACRO',
                narrativeTags: ['mild']
            }

            const forest: RealmVertex = {
                id: 'forest-1',
                name: 'Misty Forest',
                realmType: 'FOREST',
                scope: 'REGIONAL',
                narrativeTags: ['mysterious']
            }

            mockLocationRepo.setLocation(location)
            mockLocationRepo.setLocation(adjacentLocation1)
            mockLocationRepo.setLocation(adjacentLocation2)
            mockRealmRepo.setContainmentChain('location-1', [district, city, weatherZone, forest])

            const layer: DescriptionLayer = {
                id: 'layer-1',
                scopeId: 'loc:location-1',
                layerType: 'ambient',
                value: 'Fog rolls through',
                effectiveFromTick: 0,
                effectiveToTick: 100,
                authoredAt: '2024-01-01T00:00:00Z'
            }

            mockLayerRepo.setLayersForLocation('location-1', [layer])

            const context = await realmService.getLocationContext('location-1', 50)

            assert.strictEqual(context.location.id, 'location-1')
            assert.strictEqual(context.political.length, 2)
            assert.strictEqual(context.political[0].name, 'Market District')
            assert.strictEqual(context.political[1].name, 'Waterdeep')
            assert.strictEqual(context.weather.length, 1)
            assert.strictEqual(context.weather[0].name, 'Temperate Zone')
            assert.strictEqual(context.geographic.length, 1)
            assert.strictEqual(context.geographic[0].name, 'Misty Forest')
            assert.strictEqual(context.functional.length, 0)
            assert.strictEqual(context.nearby.length, 2)
            assert.strictEqual(context.narrativeTags.length, 4)
            assert.deepStrictEqual(context.narrativeTags, ['bustling', 'coastal', 'mild', 'mysterious'])
        })

        it('should deduplicate narrative tags', async () => {
            const location: Location = {
                id: 'location-1',
                name: 'Town Square',
                description: 'A bustling town square',
                exits: []
            }

            const district: RealmVertex = {
                id: 'district-1',
                name: 'Market District',
                realmType: 'DISTRICT',
                scope: 'LOCAL',
                narrativeTags: ['bustling', 'ancient']
            }

            const city: RealmVertex = {
                id: 'city-1',
                name: 'Waterdeep',
                realmType: 'CITY',
                scope: 'REGIONAL',
                narrativeTags: ['bustling', 'coastal'] // duplicate 'bustling'
            }

            mockLocationRepo.setLocation(location)
            mockRealmRepo.setContainmentChain('location-1', [district, city])

            const context = await realmService.getLocationContext('location-1', 50)

            assert.strictEqual(context.narrativeTags.length, 3)
            assert.deepStrictEqual(context.narrativeTags, ['ancient', 'bustling', 'coastal'])
        })

        it('should handle location with no realms', async () => {
            const location: Location = {
                id: 'location-1',
                name: 'Isolated Cave',
                description: 'A lonely cave',
                exits: []
            }

            mockLocationRepo.setLocation(location)
            mockRealmRepo.setContainmentChain('location-1', [])

            const context = await realmService.getLocationContext('location-1', 50)

            assert.strictEqual(context.location.id, 'location-1')
            assert.strictEqual(context.geographic.length, 0)
            assert.strictEqual(context.political.length, 0)
            assert.strictEqual(context.weather.length, 0)
            assert.strictEqual(context.functional.length, 0)
            assert.strictEqual(context.narrativeTags.length, 0)
        })

        it('should throw error when location not found', async () => {
            await assert.rejects(async () => {
                await realmService.getLocationContext('nonexistent-location', 50)
            }, /Location not found/)
        })
    })
})
