import { Location } from '@piquet-h/shared'
// NOTE: In-memory implementation has been moved to `locationRepository.memory.ts`.
// Cosmos implementation remains in `locationRepository.cosmos.ts`.

// Repository contract isolates persistence (memory, cosmos, etc.) from handlers & AI tools.
export interface ILocationRepository {
    get(id: string): Promise<Location | undefined>
    move(fromId: string, direction: string): Promise<{ status: 'ok'; location: Location } | { status: 'error'; reason: string }>
    upsert(location: Location): Promise<{ created: boolean; id: string; updatedRevision?: number }>
    listAll(): Promise<Location[]>
    ensureExit(
        fromId: string,
        direction: string,
        toId: string,
        description?: string,
        opts?: { skipVertexCheck?: boolean; deferCacheRegen?: boolean }
    ): Promise<{ created: boolean }>
    ensureExitBidirectional(
        fromId: string,
        direction: string,
        toId: string,
        opts?: { reciprocal?: boolean; description?: string; reciprocalDescription?: string }
    ): Promise<{ created: boolean; reciprocalCreated?: boolean }>
    removeExit(fromId: string, direction: string): Promise<{ removed: boolean }>
    deleteLocation(id: string): Promise<{ deleted: boolean }>
    applyExits(
        exits: Array<{ fromId: string; direction: string; toId: string; description?: string; reciprocal?: boolean }>
    ): Promise<{ exitsCreated: number; exitsSkipped: number; reciprocalApplied: number }>
    updateExitsSummaryCache(locationId: string, cache: string): Promise<{ updated: boolean }>
    regenerateExitsSummaryCache(locationId: string): Promise<void>
}
