import type { LocationResponse } from '@piquet-h/shared'
import type { QueryClient } from '@tanstack/react-query'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { getSessionId, trackGameEventClient } from '../../services/telemetry'
import { buildHeaders, buildMoveRequest } from '../../utils/apiClient'
import { extractErrorMessage } from '../../utils/apiResponse'
import { buildCorrelationHeaders, buildSessionHeaders, generateCorrelationId } from '../../utils/correlation'
import { unwrapEnvelope } from '../../utils/envelope'
import type { GenerationHint } from '../SoftDenialOverlay'

export type Direction =
    | 'north'
    | 'south'
    | 'east'
    | 'west'
    | 'northeast'
    | 'northwest'
    | 'southeast'
    | 'southwest'
    | 'up'
    | 'down'
    | 'in'
    | 'out'

interface AppendCommandLogInput {
    command: string
    response?: string
    error?: string
    latencyMs?: number
}

interface UseGameNavigationFlowOptions {
    playerGuid?: string | null
    currentLocationId?: string | null
    location?: LocationResponse | null
    queryClient: QueryClient
    updateCurrentLocationId: (id: string) => void
    refetchLocation: () => void
    appendCommandLog: (input: AppendCommandLogInput) => void
    formatMoveResponse: (direction: string, loc: LocationResponse) => string
}

export function useGameNavigationFlow({
    playerGuid,
    currentLocationId,
    location,
    queryClient,
    updateCurrentLocationId,
    refetchLocation,
    appendCommandLog,
    formatMoveResponse
}: UseGameNavigationFlowOptions) {
    const [isNavigating, setIsNavigating] = useState(false)
    const [softDenial, setSoftDenial] = useState<{
        direction: Direction
        generationHint?: GenerationHint
        correlationId?: string
    } | null>(null)
    const [arrivalPause, setArrivalPause] = useState<{
        direction: Direction
        correlationId?: string
    } | null>(null)

    const navigateMutation = useMutation({
        mutationFn: async ({ direction, correlationId }: { direction: Direction; correlationId: string }) => {
            if (!playerGuid) throw new Error('No player GUID available')

            const moveRequest = buildMoveRequest(playerGuid, direction)
            const headers = buildHeaders({
                'Content-Type': 'application/json',
                ...buildCorrelationHeaders(correlationId),
                ...buildSessionHeaders(getSessionId())
            })

            trackGameEventClient('UI.Navigate.Button', {
                correlationId,
                direction,
                fromLocationId: location?.id || null
            })

            const res = await fetch(moveRequest.url, {
                method: moveRequest.method,
                headers,
                body: JSON.stringify(moveRequest.body)
            })

            const json = await res.json().catch(() => ({}))
            const unwrapped = unwrapEnvelope<LocationResponse>(json)

            if (!res.ok || (unwrapped.isEnvelope && !unwrapped.success)) {
                const jsonObj = json as Record<string, unknown>
                const errorObj = jsonObj?.error as Record<string, unknown> | undefined
                const errorCode = unwrapped.error?.code || errorObj?.code
                if (errorCode === 'ExitGenerationRequested') {
                    return {
                        __arrivalPause: true as const,
                        direction,
                        correlationId
                    }
                }

                const errorMsg = extractErrorMessage(res, json, unwrapped)
                trackGameEventClient('UI.Navigate.Error', {
                    correlationId,
                    direction,
                    error: errorMsg,
                    statusCode: res.status
                })
                throw new Error(errorMsg)
            }

            if (!unwrapped.data) {
                throw new Error('No location data in response')
            }

            return unwrapped.data
        },
        onMutate: async ({ direction }) => {
            await queryClient.cancelQueries({ queryKey: ['player', playerGuid] })
            await queryClient.cancelQueries({ queryKey: ['location', currentLocationId || 'starter'] })
            setIsNavigating(true)
            return { direction, startTime: performance.now() }
        },
        onSuccess: (result, variables, context) => {
            setIsNavigating(false)

            if (result && '__arrivalPause' in result && result.__arrivalPause) {
                const arrivalPauseResult = result as {
                    __arrivalPause: true
                    direction: Direction
                    correlationId: string
                }
                setArrivalPause({
                    direction: arrivalPauseResult.direction,
                    correlationId: arrivalPauseResult.correlationId
                })
                const softLatency = context?.startTime ? Math.round(performance.now() - context.startTime) : undefined
                const softDirection = context?.direction || variables.direction
                appendCommandLog({
                    command: `move ${softDirection}`,
                    response: 'The path is still being revealed. Please wait…',
                    latencyMs: softLatency
                })
                return
            }

            if (result && '__softDenial' in result && result.__softDenial) {
                const softDenialResult = result as {
                    __softDenial: true
                    direction: Direction
                    correlationId: string
                    generationHint?: GenerationHint
                }
                setSoftDenial({
                    direction: softDenialResult.direction,
                    generationHint: softDenialResult.generationHint,
                    correlationId: softDenialResult.correlationId
                })
                const softLatency = context?.startTime ? Math.round(performance.now() - context.startTime) : undefined
                const softDirection = context?.direction || variables.direction
                appendCommandLog({
                    command: `move ${softDirection}`,
                    response: 'The path is being charted. Try again in a moment.',
                    latencyMs: softLatency
                })
                return
            }

            const newLocation = result as LocationResponse
            queryClient.setQueryData(['location', newLocation.id], newLocation)
            updateCurrentLocationId(newLocation.id)

            const latencyMs = context?.startTime ? Math.round(performance.now() - context.startTime) : undefined
            const direction = context?.direction || variables.direction

            appendCommandLog({
                command: `move ${direction}`,
                response: formatMoveResponse(direction, newLocation),
                latencyMs
            })
        },
        onError: (err, { direction, correlationId }, context) => {
            setIsNavigating(false)
            trackGameEventClient('UI.Navigate.Exception', {
                correlationId,
                direction,
                error: err instanceof Error ? err.message : 'Unknown error'
            })

            appendCommandLog({
                command: `move ${direction}`,
                error: err instanceof Error ? err.message : 'Unknown error',
                latencyMs: context?.startTime ? Math.round(performance.now() - context.startTime) : undefined
            })
        }
    })

    const { mutate: navigateMutate } = navigateMutation

    const handleNavigate = useCallback(
        (direction: Direction) => {
            if (!playerGuid) return
            const correlationId = generateCorrelationId()
            navigateMutate({ direction, correlationId })
        },
        [playerGuid, navigateMutate]
    )

    const handleSoftDenialRetry = useCallback(() => {
        if (!softDenial) return
        setSoftDenial(null)
        handleNavigate(softDenial.direction)
    }, [softDenial, handleNavigate])

    const handleSoftDenialExplore = useCallback(() => {
        setSoftDenial(null)
    }, [])

    const handleSoftDenialDismiss = useCallback(() => {
        setSoftDenial(null)
    }, [])

    const handleArrivalPauseRefresh = useCallback(() => {
        refetchLocation()
    }, [refetchLocation])

    const handleArrivalPauseExhausted = useCallback(() => {
        if (!arrivalPause) return
        setSoftDenial({
            direction: arrivalPause.direction,
            correlationId: arrivalPause.correlationId
        })
        setArrivalPause(null)
    }, [arrivalPause])

    const handleArrivalPauseExplore = useCallback(() => {
        setArrivalPause(null)
    }, [])

    const handleArrivalPauseDismiss = useCallback(() => {
        setArrivalPause(null)
    }, [])

    return {
        isNavigating,
        softDenial,
        arrivalPause,
        navigatePending: navigateMutation.isPending,
        handleNavigate,
        setArrivalPause,
        handleSoftDenialRetry,
        handleSoftDenialExplore,
        handleSoftDenialDismiss,
        handleArrivalPauseRefresh,
        handleArrivalPauseExhausted,
        handleArrivalPauseExplore,
        handleArrivalPauseDismiss
    }
}
