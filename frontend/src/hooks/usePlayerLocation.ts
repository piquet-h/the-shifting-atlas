/**
 * usePlayerLocation
 * Fetches player's current location using TanStack Query.
 *
 * Handles the pattern:
 * 1. Fetch player state to get currentLocationId
 * 2. Fetch compiled location description with layers for that locationId
 * 3. Cache both for optimal performance
 *
 * Benefits over manual useEffect:
 * - Automatic deduplication (multiple components can call safely)
 * - Smart caching (5 minute stale time)
 * - Loading/error states handled
 * - No manual ref guards needed
 */
import type { LocationResponse } from '@piquet-h/shared'
import { useQuery } from '@tanstack/react-query'
import { buildCompiledLocationUrl, buildHeaders, buildPlayerUrl } from '../utils/apiClient'
import { extractErrorMessage } from '../utils/apiResponse'
import { buildCorrelationHeaders, generateCorrelationId } from '../utils/correlation'
import { unwrapEnvelope } from '../utils/envelope'

/**
 * Extended location response with compiled description and provenance
 */
export interface CompiledLocationResponse extends Omit<LocationResponse, 'description'> {
    locationId: string
    compiledDescription: string
    compiledDescriptionHtml: string
    provenance: {
        compiledAt: string
        layersApplied: string[]
        supersededSentences: number
    }
}

interface PlayerState {
    currentLocationId?: string
}

/**
 * Fetch player state from API
 */
async function fetchPlayerState(playerGuid: string): Promise<PlayerState> {
    const correlationId = generateCorrelationId()
    const res = await fetch(buildPlayerUrl(playerGuid), {
        headers: buildHeaders({
            ...buildCorrelationHeaders(correlationId)
        })
    })

    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        const unwrapped = unwrapEnvelope(json)
        throw new Error(extractErrorMessage(res, json, unwrapped))
    }

    const json = await res.json()
    const unwrapped = unwrapEnvelope<PlayerState>(json)

    if (!unwrapped.success || !unwrapped.data) {
        throw new Error('Invalid player state response')
    }

    return unwrapped.data
}

/**
 * Fetch compiled location details from API
 * Uses the /compiled endpoint which returns pre-composed description layers
 */
async function fetchLocation(locationId?: string): Promise<CompiledLocationResponse> {
    if (!locationId) {
        throw new Error('Location ID is required for compiled endpoint')
    }

    const correlationId = generateCorrelationId()
    const url = buildCompiledLocationUrl(locationId)
    const res = await fetch(url, {
        headers: buildHeaders({
            ...buildCorrelationHeaders(correlationId)
        })
    })

    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        const unwrapped = unwrapEnvelope(json)
        throw new Error(extractErrorMessage(res, json, unwrapped))
    }

    const json = await res.json()
    const unwrapped = unwrapEnvelope<CompiledLocationResponse>(json)

    if (!unwrapped.success || !unwrapped.data) {
        throw new Error('Invalid location response')
    }

    return unwrapped.data
}

export interface UsePlayerLocationResult {
    location: CompiledLocationResponse | null
    isLoading: boolean
    error: string | null
    refetch: () => void
}

/**
 * Hook to fetch player's current location with compiled description
 * @param playerGuid - Player GUID (null if not authenticated)
 * @returns Location data with compiled description, loading state, and error
 */
export function usePlayerLocation(playerGuid: string | null): UsePlayerLocationResult {
    // Step 1: Fetch player state to get currentLocationId
    const {
        data: playerState,
        isLoading: playerLoading,
        error: playerError
    } = useQuery({
        queryKey: ['player', playerGuid],
        queryFn: () => fetchPlayerState(playerGuid!),
        enabled: !!playerGuid,
        staleTime: 5 * 60 * 1000, // 5 minutes - player state doesn't change often
        retry: 1,
        refetchOnMount: false, // Don't refetch on component remount
        refetchOnWindowFocus: false // Don't refetch when tab gains focus
    })

    // Step 2: Fetch location details (depends on player state)
    const {
        data: location,
        isLoading: locationLoading,
        error: locationError,
        refetch
    } = useQuery({
        queryKey: ['location', playerState?.currentLocationId || 'starter'],
        queryFn: () => fetchLocation(playerState?.currentLocationId),
        enabled: !playerLoading && !playerError, // Only fetch after player state loads
        staleTime: 2 * 60 * 1000, // 2 minutes - locations can change more frequently
        retry: 1
    })

    return {
        location: location || null,
        isLoading: playerLoading || locationLoading,
        error: (playerError as Error)?.message || (locationError as Error)?.message || null,
        refetch
    }
}

export default usePlayerLocation
