/**
 * Realm Service - Query realm containment hierarchy and assemble location context
 *
 * Provides methods to:
 * - Query ancestor realms via 'within' edge traversal
 * - Categorize realms by type (geographic, political, weather, functional)
 * - Assemble complete location context for AI narrative generation
 */

import type { RealmVertex, RealmType, Location } from '@piquet-h/shared'
import type { IRealmService, LocationContext } from '@piquet-h/shared/types/realmService'
import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import { inject, injectable } from 'inversify'
import type { ILocationRepository } from '../repos/locationRepository.js'
import type { IRealmRepository } from '../repos/realmRepository.js'
import type { ILayerRepository } from '../repos/layerRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'

/**
 * Implementation of IRealmService for querying realm hierarchy and
 * assembling location context for AI prompts.
 */
@injectable()
export class RealmService implements IRealmService {
    constructor(
        @inject('IRealmRepository') private realmRepository: IRealmRepository,
        @inject('ILocationRepository') private locationRepository: ILocationRepository,
        @inject('ILayerRepository') private layerRepository: ILayerRepository,
        @inject(TelemetryService) private telemetryService: TelemetryService
    ) {}

    /**
     * Get all ancestor realms for a location, optionally filtered by realm type.
     * Traverses the 'within' containment hierarchy upward from the location.
     */
    async getContainingRealms(locationId: string, realmTypes?: RealmType[]): Promise<RealmVertex[]> {
        const startTime = Date.now()

        try {
            // Query all ancestor realms via containment chain
            const allRealms = await this.realmRepository.getContainmentChain(locationId)

            // Filter by realm types if specified
            const filteredRealms = realmTypes ? allRealms.filter((realm) => realmTypes.includes(realm.realmType)) : allRealms

            this.telemetryService.trackGameEvent('Realm.Query.ContainingRealms', {
                locationId,
                totalRealms: allRealms.length,
                filteredRealms: filteredRealms.length,
                filterApplied: !!realmTypes,
                durationMs: Date.now() - startTime
            })

            return filteredRealms
        } catch (error) {
            this.telemetryService.trackException(error as Error, {
                locationId,
                operation: 'getContainingRealms'
            })
            throw error
        }
    }

    /**
     * Assemble full location context including realms, layers, and adjacent locations.
     * Categorizes realms by type and aggregates narrative tags.
     */
    async getLocationContext(locationId: string, tick: number): Promise<LocationContext> {
        const startTime = Date.now()

        try {
            // 1. Fetch location entity
            const location = await this.locationRepository.get(locationId)
            if (!location) {
                throw new Error(`Location not found: ${locationId}`)
            }

            // 2. Fetch all containing realms
            const allRealms = await this.realmRepository.getContainmentChain(locationId)

            // 3. Categorize realms by type
            const geographic: RealmVertex[] = []
            const political: RealmVertex[] = []
            const weather: RealmVertex[] = []
            const functional: RealmVertex[] = []

            for (const realm of allRealms) {
                switch (realm.realmType) {
                    case 'CONTINENT':
                    case 'MOUNTAIN_RANGE':
                    case 'FOREST':
                        geographic.push(realm)
                        break
                    case 'KINGDOM':
                    case 'CITY':
                    case 'DISTRICT':
                        political.push(realm)
                        break
                    case 'WEATHER_ZONE':
                        weather.push(realm)
                        break
                    case 'TRADE_NETWORK':
                    case 'ALLIANCE':
                    case 'DUNGEON':
                        functional.push(realm)
                        break
                    case 'WORLD':
                        // WORLD is a special case - could be added to geographic or kept separate
                        geographic.push(realm)
                        break
                }
            }

            // 4. Aggregate and deduplicate narrative tags
            const narrativeTags = this.aggregateNarrativeTags(allRealms)

            // 5. Fetch active description layers for the location at this tick
            const layers = await this.getActiveLayersForLocation(locationId, tick)

            // 6. Fetch adjacent locations (via exits)
            const nearby = await this.getAdjacentLocations(location)

            const context: LocationContext = {
                location,
                geographic,
                political,
                weather,
                functional,
                layers,
                nearby,
                narrativeTags
            }

            this.telemetryService.trackGameEvent('Realm.Query.LocationContext', {
                locationId,
                tick,
                totalRealms: allRealms.length,
                geographicCount: geographic.length,
                politicalCount: political.length,
                weatherCount: weather.length,
                functionalCount: functional.length,
                layerCount: layers.length,
                nearbyCount: nearby.length,
                narrativeTagCount: narrativeTags.length,
                durationMs: Date.now() - startTime
            })

            return context
        } catch (error) {
            this.telemetryService.trackException(error as Error, {
                locationId,
                tick,
                operation: 'getLocationContext'
            })
            throw error
        }
    }

    /**
     * Aggregate narrative tags from all realms and deduplicate.
     * @private
     */
    private aggregateNarrativeTags(realms: RealmVertex[]): string[] {
        const tagSet = new Set<string>()

        for (const realm of realms) {
            if (realm.narrativeTags) {
                for (const tag of realm.narrativeTags) {
                    tagSet.add(tag)
                }
            }
        }

        return Array.from(tagSet).sort()
    }

    /**
     * Get all active description layers for a location at a specific tick.
     * Queries layers for all layer types that might be active.
     * @private
     */
    private async getActiveLayersForLocation(locationId: string, tick: number): Promise<DescriptionLayer[]> {
        const layerTypes: Array<'base' | 'ambient' | 'dynamic' | 'weather' | 'lighting'> = [
            'base',
            'ambient',
            'dynamic',
            'weather',
            'lighting'
        ]

        const layers = await Promise.all(
            layerTypes.map((layerType) => this.layerRepository.getActiveLayerForLocation(locationId, layerType, tick))
        )

        // Filter out null results and return
        return layers.filter((layer): layer is DescriptionLayer => layer !== null)
    }

    /**
     * Get adjacent locations via exits.
     * @private
     */
    private async getAdjacentLocations(location: Location): Promise<Location[]> {
        const nearby: Location[] = []

        if (location.exits) {
            // Collect unique destination IDs
            const destinationIds = new Set<string>()
            for (const exit of location.exits) {
                if (exit.to) {
                    destinationIds.add(exit.to)
                }
            }

            // Fetch all adjacent locations
            for (const destId of destinationIds) {
                const adjacentLocation = await this.locationRepository.get(destId)
                if (adjacentLocation) {
                    nearby.push(adjacentLocation)
                }
            }
        }

        return nearby
    }
}
