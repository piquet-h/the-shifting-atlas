/**
 * Realm Service interfaces for querying realm containment hierarchy
 * and assembling location context for AI prompts.
 */

import type { RealmVertex, RealmType } from '../domainModels.js'
import type { Location } from '../location.js'
import type { DescriptionLayer } from './layerRepository.js'

/**
 * Location context assembled for AI narrative generation.
 * Provides rich contextual data including geographic, political, weather,
 * and functional realms, along with active description layers and nearby locations.
 */
export interface LocationContext {
    /** The location being described */
    location: Location

    /** Geographic realms (CONTINENT, MOUNTAIN_RANGE, FOREST, etc.) */
    geographic: RealmVertex[]

    /** Political realms (KINGDOM, CITY, DISTRICT) */
    political: RealmVertex[]

    /** Weather realms (WEATHER_ZONE) */
    weather: RealmVertex[]

    /** Functional realms (TRADE_NETWORK, ALLIANCE, etc.) */
    functional: RealmVertex[]

    /** Active description layers at the given tick */
    layers: DescriptionLayer[]

    /** Adjacent locations (via exits) */
    nearby: Location[]

    /** Aggregated narrative tags from all realms (deduplicated) */
    narrativeTags: string[]
}

/**
 * Service contract for querying realm containment hierarchy and
 * assembling location context for AI prompts.
 */
export interface IRealmService {
    /**
     * Get all ancestor realms for a location, optionally filtered by realm type.
     * Traverses the 'within' containment hierarchy upward from the location.
     *
     * @param locationId - Location GUID to query
     * @param realmTypes - Optional array of realm types to filter results
     * @returns Array of containing realms, ordered from nearest to farthest
     */
    getContainingRealms(locationId: string, realmTypes?: RealmType[]): Promise<RealmVertex[]>

    /**
     * Assemble full location context including realms, layers, and adjacent locations.
     * Categorizes realms by type and aggregates narrative tags.
     *
     * @param locationId - Location GUID to assemble context for
     * @param tick - World clock tick for temporal layer filtering
     * @returns Complete location context for AI narrative generation
     */
    getLocationContext(locationId: string, tick: number): Promise<LocationContext>
}
