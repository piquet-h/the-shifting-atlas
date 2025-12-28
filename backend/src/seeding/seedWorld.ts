import { Location } from '@piquet-h/shared'
// Using local backend seed copy (shared consolidation deferred until shared package export is published)
import starterLocationsData from '../data/villageLocations.json' with { type: 'json' }
import { ILocationRepository } from '../repos/locationRepository.js'

export interface SeedWorldOptions {
    blueprint?: Location[]
    log?: (...args: unknown[]) => void
    locationRepository: ILocationRepository
    bulkMode?: boolean // Skip redundant checks and defer cache regen for faster bulk seeding
}

export interface SeedWorldResult {
    locationsProcessed: number
    locationVerticesCreated: number
    exitsCreated: number
    exitsRemoved: number
}

/**
 * Idempotent world seeding. Safe to run multiple times. Adds/updates locations and exits.
 *
 * Use bulkMode=true for faster initial seeding (skips redundant vertex checks and defers cache regen).
 */
export async function seedWorld(opts: SeedWorldOptions): Promise<SeedWorldResult> {
    const blueprint: Location[] = (opts.blueprint || (starterLocationsData as Location[])).map((l) => ({ ...l }))
    const log = opts.log || (() => {})
    const locRepo = opts.locationRepository
    const bulkMode = opts.bulkMode ?? false

    let locationVerticesCreated = 0
    let exitsCreated = 0
    let exitsRemoved = 0
    const locationsWithExits = new Set<string>()

    if (bulkMode) {
        // Phase 1: Upsert all vertices first so exit creation is guaranteed to succeed
        for (const loc of blueprint) {
            const up = await locRepo.upsert(loc)
            if (up.created) locationVerticesCreated++
        }
        // Phase 2: Remove exits that are no longer in the blueprint
        for (const loc of blueprint) {
            const existing = await locRepo.get(loc.id)
            if (!existing?.exits) continue

            // Build set of blueprint exit keys (direction+destination)
            const blueprintExitKeys = new Set((loc.exits || []).map((ex) => `${ex.direction}:${ex.to}`))
            for (const existingExit of existing.exits) {
                const existingKey = `${existingExit.direction}:${existingExit.to}`
                if (!blueprintExitKeys.has(existingKey)) {
                    log(`seedWorld: removing stale exit ${loc.id} ${existingExit.direction} → ${existingExit.to} (no longer in blueprint)`)
                    const removed = await locRepo.removeExit(loc.id, existingExit.direction)
                    if (removed.removed) {
                        exitsRemoved++
                        locationsWithExits.add(loc.id)
                    }
                }
            }
        }
        // Phase 3: Apply exits once all vertices exist (skip vertex checks & defer cache regen)
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

            // Remove exits that are no longer in the blueprint
            const existing = await locRepo.get(loc.id)
            if (existing?.exits) {
                const blueprintExitKeys = new Set((loc.exits || []).map((ex) => `${ex.direction}:${ex.to}`))
                for (const existingExit of existing.exits) {
                    const existingKey = `${existingExit.direction}:${existingExit.to}`
                    if (!blueprintExitKeys.has(existingKey)) {
                        log(`seedWorld: removing stale exit ${loc.id} ${existingExit.direction} → ${existingExit.to}`)
                        const removed = await locRepo.removeExit(loc.id, existingExit.direction)
                        if (removed.removed) {
                            exitsRemoved++
                            locationsWithExits.add(loc.id)
                        }
                    }
                }
            }

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

    return {
        locationsProcessed: blueprint.length,
        locationVerticesCreated,
        exitsCreated,
        exitsRemoved
    }
}
