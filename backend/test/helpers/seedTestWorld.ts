/**
 * Test World Seeding Helper
 *
 * Purpose:
 * - Provides test-specific wrapper around production seedWorld function
 * - Reduces duplication between integration and E2E test world setup
 * - Offers default test location blueprints
 *
 * Usage:
 * - Integration tests: Use with in-memory repositories for fast tests
 * - E2E tests: Use with real Cosmos repositories for production validation
 */

import type { Location } from '@piquet-h/shared'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { seedWorld } from '../../src/seeding/seedWorld.js'

export interface SeedTestWorldOptions {
    locationRepository: ILocationRepository
    playerRepository: IPlayerRepository
    blueprint?: Location[]
    demoPlayerId?: string
    log?: (...args: unknown[]) => void
}

export interface SeedTestWorldResult {
    locations: Location[]
    demoPlayerId: string
    locationsProcessed: number
    locationVerticesCreated: number
    exitsCreated: number
    playerCreated: boolean
}

/**
 * Default test location blueprint - 5-location graph for basic traversal testing
 *
 * Structure:
 * - Hub (center) with 4 exits (N/S/E/W)
 * - North room (1 exit back south)
 * - South room (1 exit back north)
 * - East room (2 exits: west to hub, north to north room)
 * - West room (1 exit back east)
 *
 * Enables testing:
 * - Multi-hop traversal
 * - Reciprocal exits
 * - Multiple paths to same destination
 * - Exit validation (missing exits)
 */
/**
 * Default test location blueprint used across all test layers
 *
 * Design:
 * - Hub location with 4 exits (north, south, east, west)
 * - Each direction leads to a unique location
 * - Locations have return paths to hub
 * - East location has additional path to north (multi-hop testing)
 *
 * ID Strategy:
 * - Integration tests: Use IDs as-is (in-memory, no cleanup needed)
 * - E2E tests: Use same structure with 'e2e-' prefix via getE2ETestLocations()
 *
 * This unified structure ensures consistent test behavior across layers.
 */
export function getDefaultTestLocations(): Location[] {
    return [
        {
            id: 'test-loc-hub',
            name: 'Test Hub',
            description: 'Central test location with multiple exits',
            exits: [
                { direction: 'north', to: 'test-loc-north', description: 'North passage' },
                { direction: 'south', to: 'test-loc-south', description: 'South passage' },
                { direction: 'east', to: 'test-loc-east', description: 'East passage' },
                { direction: 'west', to: 'test-loc-west', description: 'West passage' }
            ]
        },
        {
            id: 'test-loc-north',
            name: 'Test North',
            description: 'Northern test location',
            exits: [{ direction: 'south', to: 'test-loc-hub', description: 'Back south' }]
        },
        {
            id: 'test-loc-south',
            name: 'Test South',
            description: 'Southern test location',
            exits: [{ direction: 'north', to: 'test-loc-hub', description: 'Back north' }]
        },
        {
            id: 'test-loc-east',
            name: 'Test East',
            description: 'Eastern test location',
            exits: [
                { direction: 'west', to: 'test-loc-hub', description: 'Back west' },
                { direction: 'north', to: 'test-loc-north', description: 'To north room' }
            ]
        },
        {
            id: 'test-loc-west',
            name: 'Test West',
            description: 'Western test location',
            exits: [{ direction: 'east', to: 'test-loc-hub', description: 'Back east' }]
        }
    ]
}

/**
 * E2E-specific test location blueprint with unique IDs for cleanup
 *
 * **Unified Data Structure:** Uses the same blueprint as integration tests,
 * but with 'e2e-' prefixed IDs to enable automated cleanup in real Cosmos DB.
 *
 * This ensures E2E tests validate the exact same structure as integration tests,
 * just with real database infrastructure.
 */
export function getE2ETestLocations(): Location[] {
    // Get the default blueprint and transform IDs for E2E
    const defaultLocations = getDefaultTestLocations()

    return defaultLocations.map((loc) => ({
        ...loc,
        // Transform: test-loc-hub → e2e-test-loc-hub
        id: loc.id.replace('test-loc-', 'e2e-test-loc-'),
        // Update exit target IDs to match transformed format
        exits: loc.exits?.map((exit) => ({
            ...exit,
            to: exit.to?.replace('test-loc-', 'e2e-test-loc-')
        }))
    }))
}

/**
 * Seed test world with given blueprint (or default test locations)
 *
 * Returns both the seeding result and the blueprint used, for test assertions
 */
export async function seedTestWorld(options: SeedTestWorldOptions): Promise<SeedTestWorldResult> {
    const blueprint = options.blueprint || getDefaultTestLocations()

    const result = await seedWorld({
        locationRepository: options.locationRepository,
        playerRepository: options.playerRepository,
        blueprint,
        demoPlayerId: options.demoPlayerId,
        log: options.log,
        bulkMode: true // Use bulk mode for faster test seeding
    })

    return {
        locations: blueprint,
        demoPlayerId: result.demoPlayerId,
        locationsProcessed: result.locationsProcessed,
        locationVerticesCreated: result.locationVerticesCreated,
        exitsCreated: result.exitsCreated,
        playerCreated: result.playerCreated
    }
}
