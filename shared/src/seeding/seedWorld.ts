import starterLocationsData from '../data/villageLocations.json' with { type: 'json' }
import { Location } from '../location.js'
import { __resetLocationRepositoryForTests, getLocationRepository } from '../repos/locationRepository.js'
import { __resetPlayerRepositoryForTests, getPlayerRepository } from '../repos/playerRepository.js'

export interface SeedWorldOptions {
    demoPlayerId?: string
    blueprint?: Location[]
    log?: (...args: unknown[]) => void
}

export interface SeedWorldResult {
    locationsProcessed: number
    locationVerticesCreated: number
    exitsCreated: number
    playerCreated: boolean
    demoPlayerId: string
}

/**
 * Idempotent world seeding. Safe to run multiple times. Adds/updates locations and exits
 * and ensures a demo player record exists for early traversal & UI testing.
 */
export async function seedWorld(opts: SeedWorldOptions = {}): Promise<SeedWorldResult> {
    const blueprint: Location[] = (opts.blueprint || (starterLocationsData as Location[])).map((l) => ({ ...l }))
    const log = opts.log || (() => {})
    const locRepo = await getLocationRepository()
    const playerRepo = await getPlayerRepository()

    let locationVerticesCreated = 0
    let exitsCreated = 0

    for (const loc of blueprint) {
        const up = await locRepo.upsert(loc)
        if (up.created) locationVerticesCreated++
        if (loc.exits) {
            for (const ex of loc.exits) {
                if (!ex.to || !ex.direction) continue
                const ec = await locRepo.ensureExit(loc.id, ex.direction, ex.to, ex.description)
                if (ec.created) exitsCreated++
            }
        }
    }

    const demoPlayerId = opts.demoPlayerId || '00000000-0000-4000-8000-000000000001'
    const { record, created } = await playerRepo.getOrCreate(demoPlayerId)
    log('seedWorld: demoPlayer', record.id, created ? 'created' : 'existing')

    return {
        locationsProcessed: blueprint.length,
        locationVerticesCreated,
        exitsCreated,
        playerCreated: created,
        demoPlayerId: record.id
    }
}

// Test helpers (explicit export for test hygiene)
export function __resetSeedWorldTestState() {
    __resetLocationRepositoryForTests()
    __resetPlayerRepositoryForTests()
}
