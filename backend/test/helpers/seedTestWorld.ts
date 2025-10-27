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
 * Uses `e2e-` prefix for all IDs to enable automated cleanup in real Cosmos DB
 */
export function getE2ETestLocations(): Location[] {
    return [
        {
            id: 'e2e-test-loc-1',
            name: 'E2E Test Hub',
            description: 'Central test location with multiple exits',
            exits: [
                { direction: 'north', to: 'e2e-test-loc-2', description: 'North passage' },
                { direction: 'south', to: 'e2e-test-loc-3', description: 'South passage' },
                { direction: 'east', to: 'e2e-test-loc-4', description: 'East passage' },
                { direction: 'west', to: 'e2e-test-loc-5', description: 'West passage' }
            ]
        },
        {
            id: 'e2e-test-loc-2',
            name: 'E2E Test North',
            description: 'Northern test location',
            exits: [{ direction: 'south', to: 'e2e-test-loc-1', description: 'Back south' }]
        },
        {
            id: 'e2e-test-loc-3',
            name: 'E2E Test South',
            description: 'Southern test location',
            exits: [{ direction: 'north', to: 'e2e-test-loc-1', description: 'Back north' }]
        },
        {
            id: 'e2e-test-loc-4',
            name: 'E2E Test East',
            description: 'Eastern test location',
            exits: [
                { direction: 'west', to: 'e2e-test-loc-1', description: 'Back west' },
                { direction: 'north', to: 'e2e-test-loc-2', description: 'To north room' }
            ]
        },
        {
            id: 'e2e-test-loc-5',
            name: 'E2E Test West',
            description: 'Western test location',
            exits: [{ direction: 'east', to: 'e2e-test-loc-1', description: 'Back east' }]
        }
    ]
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
        log: options.log
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
