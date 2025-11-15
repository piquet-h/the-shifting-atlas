#!/usr/bin/env tsx
/**
 * World Reconciliation Script
 *
 * Consolidated replacement for seed:production + anchor seeding with optional pruning.
 *
 * Features:
 *  - Idempotent creation / update of blueprint locations & exits
 *  - Optional pruning of exits no longer present in blueprint (direction-based)
 *  - Optional removal of locations not in blueprint (dangerous – requires --prune-locations)
 *  - Dry-run diff summary before applying
 *
 * Usage:
 *   tsx backend/scripts/reconcile-world.ts [--mode=memory|cosmos] [--dry-run] [--prune-exits] [--prune-locations]
 *
 * Notes:
 *  - Exit pruning removes any exit direction originating from a blueprint location that is not in blueprint.
 *    If a direction exists but points to a different target than blueprint, it is replaced (removed then added).
 *  - Location pruning never removes locations referenced by players (future enhancement – currently blind delete).
 *    Use cautiously; recommended only before first production launch.
 */
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import { Container } from 'inversify'
import 'reflect-metadata'
import starterLocationsData from '../src/data/villageLocations.json' with { type: 'json' }
import { setupContainer } from '../src/inversify.config.js'
import { ILocationRepository } from '../src/repos/locationRepository.js'
import { IPlayerRepository } from '../src/repos/playerRepository.js'
import { setupTestContainer } from '../test/helpers/testInversify.config.js'

interface Args {
    mode: 'memory' | 'cosmos'
    dryRun: boolean
    pruneExits: boolean
    pruneLocations: boolean
}

function parseArgs(): Args {
    const args = process.argv.slice(2)
    let mode: 'memory' | 'cosmos' = (process.env.PERSISTENCE_MODE as 'memory' | 'cosmos') || 'memory'
    let dryRun = false
    let pruneExits = false
    let pruneLocations = false
    for (const a of args) {
        if (a.startsWith('--mode=')) {
            const m = a.substring('--mode='.length)
            if (m === 'memory' || m === 'cosmos') mode = m
            else {
                console.error(`Invalid mode '${m}' (must be memory|cosmos)`)
                process.exit(1)
            }
        } else if (a === '--dry-run') dryRun = true
        else if (a === '--prune-exits') pruneExits = true
        else if (a === '--prune-locations') pruneLocations = true
    }
    process.env.PERSISTENCE_MODE = mode
    return { mode, dryRun, pruneExits, pruneLocations }
}

interface ReconcileOpts {
    /** Hook for tests to mutate container state (add locations / adjust players) before diff calculation. */
    beforeDiff?: (container: Container) => Promise<void>
}

async function reconcile(args: Args, opts?: ReconcileOpts) {
    // Use test config for memory mode, production config for cosmos
    const container = args.mode === 'memory' ? await setupTestContainer(new Container(), 'memory') : await setupContainer(new Container())
    const locRepo = container.get<ILocationRepository>('ILocationRepository')
    const playerRepo = container.get<IPlayerRepository>('IPlayerRepository')

    type BlueprintLocation = {
        id: string
        name: string
        description: string
        exits?: Array<{ direction: string; to?: string; description?: string }>
    }
    const blueprint: BlueprintLocation[] = (starterLocationsData as BlueprintLocation[]).map((l) => ({ ...l }))
    const blueprintIds = new Set<string>(blueprint.map((l) => l.id))

    // Gather existing locations
    const existing = await locRepo.listAll()
    const existingIds = new Set<string>(existing.map((l) => l.id))
    const extraLocationIds = [...existingIds].filter((id) => !blueprintIds.has(id))

    const exitRemovals: Array<{ locationId: string; direction: string }> = []
    const exitCreations: Array<{ fromId: string; direction: string; toId: string; description?: string }> = []

    // For each blueprint location ensure exits match
    for (const bp of blueprint) {
        const current = await locRepo.get(bp.id)
        // Upsert location (content changes only increment revision)
        await locRepo.upsert(bp)
        const bpExits: Array<{ direction: string; to?: string; description?: string }> = bp.exits || []
        const bpDirections = new Map<string, { direction: string; to?: string; description?: string }>(bpExits.map((e) => [e.direction, e]))
        const currentExits: Array<{ direction: string; to?: string; description?: string }> = current?.exits || []
        const currentDirections = new Map<string, { direction: string; to?: string; description?: string }>(
            currentExits.map((e) => [e.direction, e])
        )

        // Determine removals (direction absent from blueprint)
        if (args.pruneExits) {
            for (const dir of currentDirections.keys()) {
                if (!bpDirections.has(dir)) {
                    exitRemovals.push({ locationId: bp.id, direction: dir })
                }
            }
        }
        // Determine creations / replacements
        for (const bpExit of bpExits) {
            const cur = currentDirections.get(bpExit.direction)
            if (!cur) {
                if (bpExit.to) {
                    exitCreations.push({ fromId: bp.id, direction: bpExit.direction, toId: bpExit.to, description: bpExit.description })
                }
            } else if (cur.to !== bpExit.to) {
                // Replace mismatched target
                if (args.pruneExits) exitRemovals.push({ locationId: bp.id, direction: bpExit.direction })
                if (bpExit.to) {
                    exitCreations.push({ fromId: bp.id, direction: bpExit.direction, toId: bpExit.to, description: bpExit.description })
                }
            }
        }
    }

    let locationRemovals = args.pruneLocations ? extraLocationIds : []

    // Allow tests to pre-populate additional locations or adjust demo player location before guard evaluation.
    if (opts?.beforeDiff) {
        await opts.beforeDiff(container)
        // Recompute existing + removal set if mutations occurred
        const existingAfterHook = await locRepo.listAll()
        const existingIdsAfterHook = new Set<string>(existingAfterHook.map((l) => l.id))
        const extraAfterHook = [...existingIdsAfterHook].filter((id) => !blueprintIds.has(id))
        locationRemovals = args.pruneLocations ? extraAfterHook : []
    }

    // Dry-run summary
    console.log('World Reconciliation Summary')
    console.log('--------------------------------')
    console.log(`Blueprint locations: ${blueprint.length}`)
    console.log(`Existing locations:  ${existing.length}`)
    console.log(`Extra locations (candidates for removal): ${extraLocationIds.length}`)
    console.log(`Exit creations needed: ${exitCreations.length}`)
    console.log(`Exit removals needed: ${exitRemovals.length}`)
    console.log(`Location removals requested: ${locationRemovals.length}`)
    console.log()

    if (args.dryRun) {
        console.log('Dry-run mode: NO CHANGES APPLIED.')
        if (exitRemovals.length) console.log('Planned Exit Removals:', exitRemovals)
        if (exitCreations.length)
            console.log(
                'Planned Exit Creations:',
                exitCreations.map((e) => ({ fromId: e.fromId, direction: e.direction, toId: e.toId }))
            )
        if (locationRemovals.length) console.log('Planned Location Removals:', locationRemovals)
        return
    }

    // Guard: prevent deletion of starter location & any demo player current location (basic safety until full player enumeration available).
    const demoId = '00000000-0000-4000-8000-000000000001'
    // Ensure / load demo player early (so we can guard based on its current location before deletions)
    const { record: demoRecord } = await playerRepo.getOrCreate(demoId)
    const protectedLocationIds = new Set<string>([STARTER_LOCATION_ID])
    if (demoRecord.currentLocationId) protectedLocationIds.add(demoRecord.currentLocationId)
    const skippedLocationRemovals: string[] = []
    const appliedLocationRemovals: string[] = []

    // Filter removal list applying guard
    for (const lid of locationRemovals) {
        if (protectedLocationIds.has(lid)) {
            skippedLocationRemovals.push(lid)
        } else {
            appliedLocationRemovals.push(lid)
        }
    }

    // Apply removals first for clean replacement ordering
    for (const r of exitRemovals) {
        await locRepo.removeExit(r.locationId, r.direction)
    }
    for (const c of exitCreations) {
        await locRepo.ensureExit(c.fromId, c.direction, c.toId, c.description)
    }
    for (const lid of appliedLocationRemovals) {
        await locRepo.deleteLocation(lid)
    }
    console.log(`Demo player ${demoId}: ${demoRecord ? 'existing' : 'created'}`)

    console.log('\n✅ Reconciliation complete.')
    console.log(`Applied exit removals: ${exitRemovals.length}`)
    console.log(`Applied exit creations: ${exitCreations.length}`)
    console.log(`Applied location removals: ${appliedLocationRemovals.length}`)
    if (skippedLocationRemovals.length) {
        console.log(`Skipped protected location removals: ${skippedLocationRemovals.length}`)
        console.log('Protected IDs:', skippedLocationRemovals)
    }
}

async function main() {
    const args = parseArgs()
    console.log(`Mode: ${args.mode}  DryRun: ${args.dryRun}  PruneExits: ${args.pruneExits}  PruneLocations: ${args.pruneLocations}`)
    await reconcile(args)
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}

export { reconcile }
