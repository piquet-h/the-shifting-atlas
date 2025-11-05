import { Location } from '@piquet-h/shared'
// Using local backend seed copy (shared consolidation deferred until shared package export is published)
import starterLocationsData from '../data/villageLocations.json' with { type: 'json' }
import { ILocationRepository } from '../repos/locationRepository.js'
import { IPlayerRepository } from '../repos/playerRepository.js'

export interface SeedWorldOptions {
    demoPlayerId?: string
    blueprint?: Location[]
    log?: (...args: unknown[]) => void
    locationRepository: ILocationRepository
    playerRepository: IPlayerRepository
    bulkMode?: boolean // Skip redundant checks and defer cache regen for faster bulk seeding
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
 *
 * Use bulkMode=true for faster initial seeding (skips redundant vertex checks and defers cache regen).
 */
export async function seedWorld(opts: SeedWorldOptions): Promise<SeedWorldResult> {
    const blueprint: Location[] = (opts.blueprint || (starterLocationsData as Location[])).map((l) => ({ ...l }))
    const log = opts.log || (() => {})
    const locRepo = opts.locationRepository
    const playerRepo = opts.playerRepository
    const bulkMode = opts.bulkMode ?? false

    let locationVerticesCreated = 0
    let exitsCreated = 0
    const locationsWithExits = new Set<string>()

    if (bulkMode) {
        // Phase 1: Upsert all vertices first so exit creation is guaranteed to succeed
        for (const loc of blueprint) {
            const up = await locRepo.upsert(loc)
            if (up.created) locationVerticesCreated++
        }
        // Phase 2: Apply exits once all vertices exist (skip vertex checks & defer cache regen)
        for (const loc of blueprint) {
            if (!loc.exits) continue
            for (const ex of loc.exits) {
                if (!ex.to || !ex.direction) continue
                const ec = await locRepo.ensureExit(loc.id, ex.direction, ex.to, ex.description, {
                    skipVertexCheck: true,
                    deferCacheRegen: true
                })
                if (ec.created) {
                    exitsCreated++
                    locationsWithExits.add(loc.id)
                }
            }
        }
        // Regenerate exit summary caches once at end
        if (locationsWithExits.size > 0) {
            log(`seedWorld: regenerating exit caches for ${locationsWithExits.size} locations`)
            for (const locId of locationsWithExits) {
                await locRepo.regenerateExitsSummaryCache(locId)
            }
        }
    } else {
        // Non-bulk mode: original one-pass behavior (simpler & fine for small blueprints)
        for (const loc of blueprint) {
            const up = await locRepo.upsert(loc)
            if (up.created) locationVerticesCreated++
            if (!loc.exits) continue
            for (const ex of loc.exits) {
                if (!ex.to || !ex.direction) continue
                const ec = await locRepo.ensureExit(loc.id, ex.direction, ex.to, ex.description, {
                    skipVertexCheck: false,
                    deferCacheRegen: false
                })
                if (ec.created) {
                    exitsCreated++
                    locationsWithExits.add(loc.id)
                }
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
