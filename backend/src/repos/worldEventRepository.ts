/**
 * World Event Repository interface and types.
 * Re-exports from shared package for backend use.
 */

export type {
    IWorldEventRepository,
    WorldEventRecord,
    EventStatus,
    TimelineQueryOptions,
    TimelineQueryResult
} from '@piquet-h/shared/types/worldEventRepository'

export { buildLocationScopeKey, buildPlayerScopeKey, buildGlobalScopeKey, parseScopeKey } from '@piquet-h/shared/types/worldEventRepository'
