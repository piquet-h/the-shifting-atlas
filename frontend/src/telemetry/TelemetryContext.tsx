import React, { createContext, useContext, useEffect, useMemo } from 'react'
import {
    initTelemetry,
    isTelemetryEnabled,
    trackError,
    trackGameEventClient,
    trackPageView,
    trackPlayerCommand,
    trackPlayerNavigate,
    trackUIError
} from '../services/telemetry'

export interface ITelemetryClient {
    trackGameEvent: (name: string, props?: Record<string, unknown>) => void
    trackUIError: (error: Error, props?: Record<string, unknown>) => void
    trackError: (error: Error, props?: Record<string, unknown>) => void
    trackPlayerNavigate: (direction: string, latencyMs?: number, correlationId?: string) => void
    trackPlayerCommand: (command: string, actionType: string, latencyMs?: number, correlationId?: string) => void
    trackPageView: (pageName?: string, pageUrl?: string) => void
    isEnabled: () => boolean
}

// No-op implementation used before provider mounts or in tests
const noopClient: ITelemetryClient = {
    trackGameEvent: () => void 0,
    trackUIError: () => void 0,
    trackError: () => void 0,
    trackPlayerNavigate: () => void 0,
    trackPlayerCommand: () => void 0,
    trackPageView: () => void 0,
    isEnabled: () => false
}

const TelemetryContext = createContext<ITelemetryClient>(noopClient)

export const useTelemetry = (): ITelemetryClient => {
    return useContext(TelemetryContext)
}

interface TelemetryProviderProps {
    children: React.ReactNode
    /** Set true to force-disable telemetry (e.g. in tests) */
    disabled?: boolean
}

export const TelemetryProvider: React.FC<TelemetryProviderProps> = ({ children, disabled }) => {
    useEffect(() => {
        if (!disabled) {
            // Lazy init; safe to call multiple times
            initTelemetry()
        }
    }, [disabled])

    const client = useMemo<ITelemetryClient>(() => {
        if (disabled) return noopClient
        return {
            trackGameEvent: trackGameEventClient,
            trackUIError,
            trackError,
            trackPlayerNavigate,
            trackPlayerCommand,
            trackPageView,
            isEnabled: isTelemetryEnabled
        }
    }, [disabled])

    return <TelemetryContext.Provider value={client}>{children}</TelemetryContext.Provider>
}

export default TelemetryContext
