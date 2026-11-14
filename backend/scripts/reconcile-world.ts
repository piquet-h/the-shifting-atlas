#!/usr/bin/env tsx
/**
 * World Reconciliation & Clean-Start Reset Script
 *
 * Consolidated Mosswell reconciliation, frontier pruning, and character location reset.
 *
 * Features:
 *  - Idempotent creation / update of blueprint locations & exits (with macro-atlas tag bindings)
 *  - Optional pruning of exits no longer present in blueprint (direction-based)
 *  - Optional removal of generated locations outside the Mosswell blueprint (--prune-locations)
 *  - Automatic relocation of orphaned players (or all players via --reset-players / --clean-start) to STARTER_LOCATION_ID
 *  - Optional purge of generated location description layers (--purge-layers / --clean-start)
 *  - Read-only dry-run diff summary before applying
 *
 * Usage:
 *   tsx backend/scripts/reconcile-world.ts [--mode=memory|cosmos] [--dry-run] [--prune-exits] [--prune-locations] [--reset-players[=all|orphaned|none]] [--purge-layers] [--clean-start]
 */

import { STARTER_LOCATION_ID, type Location } from '@piquet-h/shared'
import type { LayerType } from '@piquet-h/shared/types/layerRepository'
import { readFileSync } from 'fs'
import { Container } from 'inversify'
import { dirname, join, resolve } from 'path'
import 'reflect-metadata'
import { fileURLToPath, pathToFileURL } from 'url'
import starterLocationsData from '../src/data/villageLocations.json' with { type: 'json' }
import { TOKENS } from '../src/di/tokens.js'
import type { GremlinClientConfig, IGremlinClient } from '../src/gremlin/gremlinClient.js'
import { setupContainer } from '../src/inversify.config.js'
import type { ILayerRepository } from '../src/repos/layerRepository.js'
import type { ILocationClockRepository } from '../src/repos/locationClockRepository.js'
import { ILocationRepository } from '../src/repos/locationRepository.js'
import type { IPlayerDocRepository } from '../src/repos/PlayerDocRepository.js'
import { IPlayerRepository } from '../src/repos/playerRepository.js'
import { applyMacroAtlasBindings } from '../src/seeding/macroAtlasBindings.js'
import { setupTestContainer } from '../test/helpers/testInversify.config.js'

export type ResetPlayersPolicy = 'none' | 'orphaned' | 'all'

export interface Args {
    mode: 'memory' | 'cosmos'
    dryRun: boolean
    pruneExits: boolean
    pruneLocations: boolean
    resetPlayers?: ResetPlayersPolicy
    purgeLayers?: boolean
}

export interface ReconcileResult {
    dryRun: boolean
    blueprintLocations: number
    existingLocations: number
    extraLocations: number
    exitCreationsApplied: number
    exitRemovalsApplied: number
    locationRemovalsApplied: number
    playersRelocated: number
    layersPurged: number
}

const LAYER_TYPES: LayerType[] = ['base', 'dynamic', 'ambient']

function parseArgs(): Args {
    const args = process.argv.slice(2)
    let mode: 'memory' | 'cosmos' = (process.env.PERSISTENCE_MODE as 'memory' | 'cosmos') || 'memory'
    let dryRun = false
    let pruneExits = false
    let pruneLocations = false
    let resetPlayers: ResetPlayersPolicy | undefined
    let purgeLayers = false

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
        else if (a === '--reset-players' || a === '--reset-players=all') resetPlayers = 'all'
        else if (a === '--reset-players=orphaned') resetPlayers = 'orphaned'
        else if (a === '--reset-players=none') resetPlayers = 'none'
        else if (a === '--purge-layers') purgeLayers = true
        else if (a === '--clean-start') {
            pruneExits = true
            pruneLocations = true
            resetPlayers = 'all'
            purgeLayers = true
        }
    }
    process.env.PERSISTENCE_MODE = mode
    return { mode, dryRun, pruneExits, pruneLocations, resetPlayers, purgeLayers }
}

interface ReconcileOpts {
    /** Hook for tests to mutate container state (add locations / adjust players) before diff calculation. */
    beforeDiff?: (container: Container) => Promise<void>
}

async function reconcile(args: Args, opts?: ReconcileOpts): Promise<ReconcileResult> {
    const container = args.mode === 'memory' ? await setupTestContainer(new Container(), 'memory') : await setupContainer(new Container())

    if (args.mode === 'cosmos') {
        const existingConfig = container.get<GremlinClientConfig>('GremlinConfig')
        container.unbind('GremlinConfig')
        container.bind<GremlinClientConfig>('GremlinConfig').toConstantValue({
            ...existingConfig,
            connectionTimeoutMs: 30000
        })
    }

    try {
        // Allow callers/tests to populate state BEFORE diff calculation
        if (opts?.beforeDiff) {
            await opts.beforeDiff(container)
        }

        const locRepo = container.get<ILocationRepository>('ILocationRepository')
        const playerRepo = container.get<IPlayerRepository>('IPlayerRepository')
        const playerDocRepo = container.isBound(TOKENS.PlayerDocRepository)
            ? container.get<IPlayerDocRepository>(TOKENS.PlayerDocRepository)
            : undefined
        const layerRepo = container.isBound(TOKENS.LayerRepository) ? container.get<ILayerRepository>(TOKENS.LayerRepository) : undefined
        const clockRepo = container.isBound(TOKENS.LocationClockRepository)
            ? container.get<ILocationClockRepository>(TOKENS.LocationClockRepository)
            : undefined

        const blueprint: Location[] = applyMacroAtlasBindings((starterLocationsData as Location[]).map((l) => ({ ...l })))
        const blueprintIds = new Set<string>(blueprint.map((l) => l.id))

        const existing = await locRepo.listAll()
        const existingIds = new Set<string>(existing.map((l) => l.id))
        const extraLocationIds = [...existingIds].filter((id) => !blueprintIds.has(id))

        const exitRemovals: Array<{ locationId: string; direction: string }> = []
        const exitCreations: Array<{
            fromId: string
            direction: string
            toId: string
            description?: string
            travelDurationMs?: number
        }> = []

        for (const bp of blueprint) {
            const current = await locRepo.get(bp.id)
            const bpExits = (bp.exits || []) as Array<{
                direction: string
                to?: string
                description?: string
                travelDurationMs?: number
            }>
            const bpDirections = new Map(bpExits.map((e) => [e.direction, e]))
            const currentExits = current?.exits || []
            const currentDirections = new Map(currentExits.map((e) => [e.direction, e]))

            if (args.pruneExits) {
                for (const dir of currentDirections.keys()) {
                    if (!bpDirections.has(dir)) {
                        exitRemovals.push({ locationId: bp.id, direction: dir })
                    }
                }
            }

            for (const bpExit of bpExits) {
                const cur = currentDirections.get(bpExit.direction)
                if (!cur) {
                    if (bpExit.to) {
                        exitCreations.push({
                            fromId: bp.id,
                            direction: bpExit.direction,
                            toId: bpExit.to,
                            description: bpExit.description,
                            travelDurationMs: bpExit.travelDurationMs
                        })
                    }
                } else if (cur.to !== bpExit.to) {
                    if (args.pruneExits) exitRemovals.push({ locationId: bp.id, direction: bpExit.direction })
                    if (bpExit.to) {
                        exitCreations.push({
                            fromId: bp.id,
                            direction: bpExit.direction,
                            toId: bpExit.to,
                            description: bpExit.description,
                            travelDurationMs: bpExit.travelDurationMs
                        })
                    }
                }
            }
        }

        const protectedLocationIds = new Set<string>([STARTER_LOCATION_ID])
        const skippedLocationRemovals: string[] = []
        const plannedLocationRemovals: string[] = []
        if (args.pruneLocations) {
            for (const lid of extraLocationIds) {
                if (protectedLocationIds.has(lid)) skippedLocationRemovals.push(lid)
                else plannedLocationRemovals.push(lid)
            }
        }

        // Determine character location reset policy:
        // - 'all': move every character not already at STARTER_LOCATION_ID back to Mosswell River Jetty
        // - 'orphaned' (default whenever pruning locations): move characters on missing/pruned rooms to STARTER_LOCATION_ID
        // - 'none': leave player locations untouched
        const effectivePlayerPolicy: ResetPlayersPolicy = args.resetPlayers ?? (args.pruneLocations ? 'orphaned' : 'none')
        const allPlayers = effectivePlayerPolicy === 'none' ? [] : await playerRepo.listAll()
        const playersToRelocate = allPlayers.filter((player) => {
            if (effectivePlayerPolicy === 'all') {
                return player.currentLocationId !== STARTER_LOCATION_ID
            }
            return !player.currentLocationId || !blueprintIds.has(player.currentLocationId)
        })

        // Determine description layer scopes to purge
        const layerTargetLocationIds = args.purgeLayers
            ? [...new Set([...blueprintIds, ...plannedLocationRemovals])]
            : plannedLocationRemovals
        const layersToPurge: Array<{ id: string; scopeId: string }> = []
        if (layerRepo && layerTargetLocationIds.length > 0) {
            for (const locationId of layerTargetLocationIds) {
                const scopeId = `loc:${locationId}`
                for (const layerType of LAYER_TYPES) {
                    const history = await layerRepo.queryLayerHistory(scopeId, layerType)
                    for (const layer of history) {
                        layersToPurge.push({ id: layer.id, scopeId: layer.scopeId || scopeId })
                    }
                }
            }
        }

        console.log('World Reconciliation Summary')
        console.log('--------------------------------')
        console.log(`Blueprint locations: ${blueprint.length}`)
        console.log(`Existing locations:  ${existing.length}`)
        console.log(`Extra locations (candidates for removal): ${extraLocationIds.length}`)
        console.log(`Exit creations needed: ${exitCreations.length}`)
        console.log(`Exit removals needed: ${exitRemovals.length}`)
        console.log(`Location removals requested: ${plannedLocationRemovals.length}`)
        console.log(
            `Players to relocate to Mosswell River Jetty (${effectivePlayerPolicy}): ${playersToRelocate.length} / ${allPlayers.length}`
        )
        console.log(`Location description layers to purge: ${layersToPurge.length}`)
        console.log()

        if (args.dryRun) {
            console.log('Dry-run mode: NO CHANGES APPLIED.')
            if (exitRemovals.length) console.log('Planned Exit Removals:', exitRemovals)
            if (exitCreations.length) {
                console.log(
                    'Planned Exit Creations:',
                    exitCreations.map((e) => ({ fromId: e.fromId, direction: e.direction, toId: e.toId }))
                )
            }
            if (plannedLocationRemovals.length) console.log('Planned Location Removals:', plannedLocationRemovals)
            if (playersToRelocate.length) {
                console.log(
                    'Planned Player Relocations:',
                    playersToRelocate.map((p) => ({
                        playerId: p.id,
                        fromLocationId: p.currentLocationId ?? null,
                        toLocationId: STARTER_LOCATION_ID
                    }))
                )
            }
            return {
                dryRun: true,
                blueprintLocations: blueprint.length,
                existingLocations: existing.length,
                extraLocations: extraLocationIds.length,
                exitCreationsApplied: exitCreations.length,
                exitRemovalsApplied: exitRemovals.length,
                locationRemovalsApplied: plannedLocationRemovals.length,
                playersRelocated: playersToRelocate.length,
                layersPurged: layersToPurge.length
            }
        }

        // 1. Upsert canonical Mosswell blueprint vertices (with macro-atlas tags + pending/forbidden exitAvailability)
        for (const bp of blueprint) {
            await locRepo.upsert(bp)
        }

        // 2. Relocate players BEFORE deleting extra locations so no player ever points at a deleted vertex
        const nowIso = new Date().toISOString()
        for (const player of playersToRelocate) {
            await playerRepo.update({
                ...player,
                currentLocationId: STARTER_LOCATION_ID
            })
            if (args.mode === 'memory' && playerDocRepo) {
                const existingDoc = await playerDocRepo.getPlayer(player.id)
                if (existingDoc && existingDoc.currentLocationId !== STARTER_LOCATION_ID) {
                    await playerDocRepo.upsertPlayer({
                        ...existingDoc,
                        currentLocationId: STARTER_LOCATION_ID,
                        updatedUtc: nowIso
                    })
                }
            }
        }

        // 3. Apply exit removals, exit creations (+ travelDurationMs), and extra location removals
        const touchedExitLocationIds = new Set<string>()
        for (const r of exitRemovals) {
            await locRepo.removeExit(r.locationId, r.direction)
            touchedExitLocationIds.add(r.locationId)
        }
        for (const c of exitCreations) {
            await locRepo.ensureExit(c.fromId, c.direction, c.toId, c.description)
            if (typeof c.travelDurationMs === 'number' && Number.isFinite(c.travelDurationMs) && c.travelDurationMs > 0) {
                await locRepo.setExitTravelDuration(c.fromId, c.direction, c.travelDurationMs)
            }
            touchedExitLocationIds.add(c.fromId)
        }
        for (const lid of plannedLocationRemovals) {
            await locRepo.deleteLocation(lid)
            if (clockRepo) {
                await clockRepo.deleteClock(lid)
            }
        }
        for (const lid of touchedExitLocationIds) {
            if (blueprintIds.has(lid)) {
                await locRepo.regenerateExitsSummaryCache(lid)
            }
        }

        // 4. Purge stale location description layers
        let purgedCount = 0
        if (layerRepo && layersToPurge.length > 0) {
            for (const layer of layersToPurge) {
                const deleted = await layerRepo.deleteLayer(layer.id, layer.scopeId)
                if (deleted) purgedCount++
            }
        }

        console.log('\n✅ Reconciliation complete.')
        console.log(`Applied exit removals: ${exitRemovals.length}`)
        console.log(`Applied exit creations: ${exitCreations.length}`)
        console.log(`Applied location removals: ${plannedLocationRemovals.length}`)
        console.log(`Relocated players to Mosswell River Jetty: ${playersToRelocate.length}`)
        console.log(`Purged location description layers: ${purgedCount}`)
        if (skippedLocationRemovals.length) {
            console.log(`Skipped protected location removals: ${skippedLocationRemovals.length}`)
            console.log('Protected IDs:', skippedLocationRemovals)
        }

        return {
            dryRun: false,
            blueprintLocations: blueprint.length,
            existingLocations: existing.length,
            extraLocations: extraLocationIds.length,
            exitCreationsApplied: exitCreations.length,
            exitRemovalsApplied: exitRemovals.length,
            locationRemovalsApplied: plannedLocationRemovals.length,
            playersRelocated: playersToRelocate.length,
            layersPurged: purgedCount
        }
    } finally {
        if (args.mode === 'cosmos' && container.isBound(TOKENS.GremlinClient)) {
            try {
                const gremlin = container.get<IGremlinClient>(TOKENS.GremlinClient)
                await gremlin.close()
            } catch (err) {
                console.warn('⚠️  Warning: failed to close Gremlin client (best-effort):', err)
            }
        }
    }
}

async function main() {
    const __scriptDir = dirname(fileURLToPath(import.meta.url))
    const _localSettingsCosmosPath = join(__scriptDir, '../local.settings.cosmos.json')
    try {
        const _cosmosSettings = JSON.parse(readFileSync(_localSettingsCosmosPath, 'utf8'))
        for (const [key, value] of Object.entries(_cosmosSettings.Values ?? {})) {
            if (process.env[key] === undefined && typeof value === 'string') {
                process.env[key] = value
            }
        }
    } catch {
        // Silently ignore if file not present; env vars may already be set externally
    }

    const args = parseArgs()
    console.log(
        `Mode: ${args.mode}  DryRun: ${args.dryRun}  PruneExits: ${args.pruneExits}  PruneLocations: ${args.pruneLocations}  ResetPlayers: ${args.resetPlayers ?? 'auto'}  PurgeLayers: ${Boolean(args.purgeLayers)}`
    )
    await reconcile(args)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    main().catch((err) => {
        console.error(err)
        process.exit(1)
    })
}

export { reconcile }
