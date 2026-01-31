/**
 * Fetch location via `currentLocationId` from PlayerContext to avoid a redundant player fetch.
 */
import type { LocationResponse } from '@piquet-h/shared'
import { useQuery } from '@tanstack/react-query'
import { getSessionId } from '../services/telemetry'
import { buildHeaders, buildLocationUrl } from '../utils/apiClient'
import { extractErrorMessage } from '../utils/apiResponse'
import { buildCorrelationHeaders, buildSessionHeaders, generateCorrelationId } from '../utils/correlation'
import { unwrapEnvelope } from '../utils/envelope'

async function fetchLocation(locationId?: string): Promise<LocationResponse> {
    if (!locationId) {
        throw new Error('Location ID is required')
    }

    const correlationId = generateCorrelationId()
    const url = buildLocationUrl(locationId)
    const res = await fetch(url, {
        headers: buildHeaders({
            ...buildCorrelationHeaders(correlationId),
            ...buildSessionHeaders(getSessionId())
        })
    })

    if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        const unwrapped = unwrapEnvelope(json)
        throw new Error(extractErrorMessage(res, json, unwrapped))
    }

    const json = await res.json()
    const unwrapped = unwrapEnvelope<LocationResponse>(json)

    if (!unwrapped.success || !unwrapped.data) {
        throw new Error('Invalid location response')
    }

    return unwrapped.data
}

export interface UsePlayerLocationResult {
    location: LocationResponse | null
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

    const isLoading = !currentLocationId || locationLoading || isFetching

    return {
        location: location || null,
        isLoading,
        error: (locationError as Error)?.message || null,
        refetch
    }
}

export default usePlayerLocation
