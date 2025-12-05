/**
 * usePlayerLocation
 * Fetches player's current location using TanStack Query.
 *
 * Optimized pattern:
 * - Uses currentLocationId from PlayerContext (already fetched at bootstrap)
 * - Only fetches the compiled location description
 * - No redundant player state fetch
 *
 * Benefits:
 * - Single API call for location data
 * - Smart caching (2 minute stale time)
 * - Loading/error states handled
 * - Automatic deduplication via TanStack Query
 */
import type { LocationResponse } from '@piquet-h/shared'
import { useQuery } from '@tanstack/react-query'
import { buildCompiledLocationUrl, buildHeaders } from '../utils/apiClient'
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
 * @param currentLocationId - Current location ID from PlayerContext (null if not yet loaded)
 * @returns Location data with compiled description, loading state, and error
 */
export function usePlayerLocation(currentLocationId: string | null): UsePlayerLocationResult {
    // Fetch location details - no separate player fetch needed
    // currentLocationId comes from PlayerContext which already has it from bootstrap
    const {
        data: location,
        isLoading: locationLoading,
        isFetching,
        error: locationError,
        refetch
    } = useQuery({
        queryKey: ['location', currentLocationId || 'starter'],
        queryFn: () => fetchLocation(currentLocationId || undefined),
        enabled: !!currentLocationId,
        staleTime: 2 * 60 * 1000, // 2 minutes - locations can change more frequently
        retry: 1
    })

    // Consider loading if:
    // 1. currentLocationId is not yet available (context still loading)
    // 2. Query is loading or fetching
    const isLoading = !currentLocationId || locationLoading || isFetching

    return {
        location: location || null,
        isLoading,
        error: (locationError as Error)?.message || null,
        refetch
    }
}

export default usePlayerLocation
