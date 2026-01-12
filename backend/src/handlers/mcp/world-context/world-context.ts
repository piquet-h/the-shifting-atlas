import type { InvocationContext } from '@azure/functions'
import type { RealmType, RealmVertex } from '@piquet-h/shared'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { DescriptionLayer, LayerType } from '@piquet-h/shared/types/layerRepository'
import { Container, inject, injectable } from 'inversify'
import type { IPlayerDocRepository } from '../../../repos/PlayerDocRepository.js'
import type { IExitRepository } from '../../../repos/exitRepository.js'
import type { IInventoryRepository } from '../../../repos/inventoryRepository.js'
import type { ILayerRepository } from '../../../repos/layerRepository.js'
import type { ILocationRepository } from '../../../repos/locationRepository.js'
import { buildLocationScopeKey, buildPlayerScopeKey, type IWorldEventRepository } from '../../../repos/worldEventRepository.js'
import { RealmService } from '../../../services/RealmService.js'
import { WorldClockService } from '../../../services/WorldClockService.js'

type ToolArgs<T> = { arguments?: T }

function parseOptionalNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value)
        if (Number.isFinite(n)) return n
    }
    return undefined
}

function buildLayerSummary(
    layerType: LayerType,
    layer: DescriptionLayer | null
): {
    present: boolean
    layerType: LayerType
    scopeId?: string
    authoredAt?: string
    effectiveFromTick?: number
    effectiveToTick?: number | null
    valuePreview?: string
    valueLength?: number
} {
    if (!layer) {
        return { present: false, layerType }
    }

    const value = layer.value ?? ''
    return {
        present: true,
        layerType,
        scopeId: layer.scopeId,
        authoredAt: layer.authoredAt,
        effectiveFromTick: layer.effectiveFromTick,
        effectiveToTick: layer.effectiveToTick,
        valuePreview: value.slice(0, 240),
        valueLength: value.length
    }
}

function buildLayerValueOrDefault(
    layerType: LayerType,
    layer: DescriptionLayer | null,
    defaultValue: string
): {
    present: boolean
    layerType: LayerType
    defaulted: boolean
    scopeId?: string
    authoredAt?: string
    effectiveFromTick?: number
    effectiveToTick?: number | null
    value: string
    valuePreview: string
    valueLength: number
} {
    if (!layer) {
        return {
            present: false,
            layerType,
            defaulted: true,
            value: defaultValue,
            valuePreview: defaultValue.slice(0, 240),
            valueLength: defaultValue.length
        }
    }

    const value = layer.value ?? ''
    return {
        present: true,
        layerType,
        defaulted: false,
        scopeId: layer.scopeId,
        authoredAt: layer.authoredAt,
        effectiveFromTick: layer.effectiveFromTick,
        effectiveToTick: layer.effectiveToTick,
        value,
        valuePreview: value.slice(0, 240),
        valueLength: value.length
    }
}

function inferTimeOfDayLabelFromTick(tick: number): string {
    // World tick is measured in milliseconds.
    const DAY_MS = 24 * 60 * 60 * 1000
    const normalized = ((tick % DAY_MS) + DAY_MS) % DAY_MS
    const hour = Math.floor(normalized / (60 * 60 * 1000))

    if (hour >= 5 && hour < 8) return 'dawn'
    if (hour >= 8 && hour < 12) return 'morning'
    if (hour >= 12 && hour < 17) return 'afternoon'
    if (hour >= 17 && hour < 20) return 'dusk'
    return 'night'
}

function categorizeRealms(realms: RealmVertex[]): {
    geographic: RealmVertex[]
    political: RealmVertex[]
    weather: RealmVertex[]
    functional: RealmVertex[]
} {
    const geographic: RealmVertex[] = []
    const political: RealmVertex[] = []
    const weather: RealmVertex[] = []
    const functional: RealmVertex[] = []

    for (const realm of realms) {
        switch (realm.realmType as RealmType) {
            case 'CONTINENT':
            case 'MOUNTAIN_RANGE':
            case 'FOREST':
            case 'WORLD':
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
        }
    }

    return { geographic, political, weather, functional }
}

function aggregateNarrativeTags(realms: RealmVertex[]): string[] {
    const tagSet = new Set<string>()
    for (const realm of realms) {
        for (const tag of realm.narrativeTags ?? []) {
            tagSet.add(tag)
        }
    }
    return Array.from(tagSet).sort()
}

/**
 * MCP-style handler class for world-context tools.
 *
 * Foundation-only in #514: provides a basic health tool so the surface is
 * discoverable/testable before adding real context operations in #515/#516.
 */
@injectable()
export class WorldContextHandler {
    constructor(
        @inject('ILocationRepository') private locationRepo: ILocationRepository,
        @inject('IExitRepository') private exitRepo: IExitRepository,
        @inject(RealmService) private realmService: RealmService,
        @inject('ILayerRepository') private layerRepo: ILayerRepository,
        @inject(WorldClockService) private worldClock: WorldClockService,
        @inject('IPlayerDocRepository') private playerDocRepo: IPlayerDocRepository,
        @inject('IInventoryRepository') private inventoryRepo: IInventoryRepository,
        @inject('IWorldEventRepository') private worldEventRepo: IWorldEventRepository
    ) {}

    async health(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void toolArguments
        void context // part of the MCP handler signature; intentionally unused

        return JSON.stringify({ ok: true, service: 'world-context' })
    }

    /**
     * Assemble a lightweight location context payload for agent prompts.
     *
     * Includes:
     * - location (from ILocationRepository)
     * - exits (from IExitRepository)
     * - containing realms (from RealmService)
     * - ambient layer summary at tick (from ILayerRepository)
     */
    async getLocationContext(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void context // part of the MCP handler signature; intentionally unused

        const toolArgs = toolArguments as ToolArgs<{ locationId?: string; tick?: number | string }>
        const locationId = toolArgs?.arguments?.locationId || STARTER_LOCATION_ID

        const explicitTick = parseOptionalNumber(toolArgs?.arguments?.tick)
        const tick = explicitTick ?? (await this.worldClock.getCurrentTick())

        const location = await this.locationRepo.get(locationId)
        if (!location) {
            return JSON.stringify(null)
        }

        const exits = await this.exitRepo.getExits(locationId)
        const realms = await this.realmService.getContainingRealms(locationId)
        const categorized = categorizeRealms(realms)
        const narrativeTags = aggregateNarrativeTags(realms)

        const ambientLayer = await this.layerRepo.getActiveLayerForLocation(locationId, 'ambient', tick)
        const ambient = buildLayerSummary('ambient', ambientLayer)

        // Nearby players: PlayerDoc container is partitioned by player ID, so this may be
        // a cross-partition query depending on repository implementation.
        const nearbyPlayers = (await this.playerDocRepo.listPlayersAtLocation(locationId, 20)).map((p) => ({ id: p.id }))

        // Recent events: single-partition timeline query via scopeKey = loc:<locationId>
        const timeline = await this.worldEventRepo.queryByScope(buildLocationScopeKey(locationId), { limit: 20 })
        const recentEvents = timeline.events.map((e) => ({
            id: e.id,
            eventType: e.eventType,
            status: e.status,
            occurredUtc: e.occurredUtc,
            actorKind: e.actorKind
        }))

        return JSON.stringify({
            tick,
            location,
            exits,
            realms: categorized,
            narrativeTags,
            ambient,
            nearbyPlayers,
            recentEvents
        })
    }

    /**
     * Assemble player-focused context for narrative generation.
     *
     * Includes:
     * - player document (SQL API PlayerDoc)
     * - location (best-effort)
     * - inventory items (SQL API inventory)
     * - recent player-scoped events (SQL API worldEvents, scopeKey=player:<id>)
     */
    async getPlayerContext(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void context // part of the MCP handler signature; intentionally unused

        const toolArgs = toolArguments as ToolArgs<{ playerId?: string; tick?: number | string }>
        const playerId = toolArgs?.arguments?.playerId
        if (!playerId || typeof playerId !== 'string') {
            return JSON.stringify(null)
        }

        const explicitTick = parseOptionalNumber(toolArgs?.arguments?.tick)
        const tick = explicitTick ?? (await this.worldClock.getCurrentTick())

        const player = await this.playerDocRepo.getPlayer(playerId)
        if (!player) {
            return JSON.stringify(null)
        }

        const warnings: string[] = []
        const locationId = player.currentLocationId

        let location: unknown = null
        if (!locationId) {
            warnings.push('player.currentLocationId is empty')
        } else {
            location = (await this.locationRepo.get(locationId)) ?? null
            if (!location) {
                warnings.push(`location not found: ${locationId}`)
            }
        }

        const inventory = await this.inventoryRepo.listItems(playerId)
        const timeline = await this.worldEventRepo.queryByScope(buildPlayerScopeKey(playerId), { limit: 20 })
        const recentEvents = timeline.events.map((e) => ({
            id: e.id,
            eventType: e.eventType,
            status: e.status,
            occurredUtc: e.occurredUtc,
            actorKind: e.actorKind
        }))

        return JSON.stringify({
            tick,
            player,
            location,
            inventory,
            recentEvents,
            warnings
        })
    }

    /**
     * Assemble atmosphere context for a location: weather, lighting, ambient conditions,
     * plus a basic time-of-day label.
     */
    async getAtmosphere(toolArguments: unknown, context: InvocationContext): Promise<string> {
        void context // part of the MCP handler signature; intentionally unused

        const toolArgs = toolArguments as ToolArgs<{ locationId?: string; tick?: number | string }>
        const locationId = toolArgs?.arguments?.locationId || STARTER_LOCATION_ID

        const explicitTick = parseOptionalNumber(toolArgs?.arguments?.tick)
        const tick = explicitTick ?? (await this.worldClock.getCurrentTick())

        // Defaults per #515 acceptance criteria
        const weatherLayer = await this.layerRepo.getActiveLayerForLocation(locationId, 'weather', tick)
        const ambientLayer = await this.layerRepo.getActiveLayerForLocation(locationId, 'ambient', tick)
        const lightingLayer = await this.layerRepo.getActiveLayerForLocation(locationId, 'lighting', tick)

        const weather = buildLayerValueOrDefault('weather', weatherLayer, 'clear')
        const ambient = buildLayerValueOrDefault('ambient', ambientLayer, 'calm')
        const lighting = buildLayerValueOrDefault('lighting', lightingLayer, 'daylight')

        // If the world clock is uninitialized, it reports 0; treat the time-of-day as a friendly default.
        const timeOfDay = explicitTick === undefined && tick === 0 ? 'noon' : inferTimeOfDayLabelFromTick(tick)

        return JSON.stringify({
            tick,
            locationId,
            timeOfDay,
            weather,
            lighting,
            ambient
        })
    }
}

export async function health(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(WorldContextHandler)
    return handler.health(toolArguments, context)
}

export async function getLocationContext(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(WorldContextHandler)
    return handler.getLocationContext(toolArguments, context)
}

export async function getPlayerContext(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(WorldContextHandler)
    return handler.getPlayerContext(toolArguments, context)
}

export async function getAtmosphere(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(WorldContextHandler)
    return handler.getAtmosphere(toolArguments, context)
}
