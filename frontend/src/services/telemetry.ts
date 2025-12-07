/*
 * Frontend Telemetry (Application Insights Web SDK)
 * Initializes client with connection string provided via Vite env (VITE_APPINSIGHTS_CONNECTION_STRING).
 * Gracefully no-ops if not supplied (e.g., local dev without telemetry).
 *
 * Features:
 * - Session tracking (Session.Start, Session.End)
 * - Automatic error tracking (unhandled exceptions and promise rejections)
 * - Page view tracking (route changes)
 * - Correlation with backend (operationId propagation)
 * - Debounce utility for high-frequency events
 *
 * Edge cases handled:
 * - Ad blocker present → telemetry fails silently (no user impact)
 * - Offline mode → SDK handles offline queuing automatically
 * - High-frequency events → use debounce wrapper
 */
/* global localStorage window document navigator */
import { ApplicationInsights } from '@microsoft/applicationinsights-web'
import { GAME_EVENT_NAMES } from '@piquet-h/shared'

// Truncation limits for telemetry payloads
const MAX_ERROR_STACK_LENGTH = 1000
const MAX_COMMAND_LENGTH = 100

// Telemetry attribute keys (local copy for frontend use)
// NOTE: These align with shared/src/telemetryAttributes.ts but are defined locally
// because the shared package on npm hasn't been republished yet with the new exports.
// Once shared@0.3.78+ is published, this can be replaced with:
// import { TELEMETRY_ATTRIBUTE_KEYS } from '@piquet-h/shared'
const FRONTEND_ATTRIBUTE_KEYS = {
    SESSION_ID: 'game.session.id',
    USER_ID: 'game.user.id',
    ACTION_TYPE: 'game.action.type',
    LATENCY_MS: 'game.latency.ms',
    CORRELATION_ID: 'game.event.correlation.id',
    ERROR_CODE: 'game.error.code',
    EXIT_DIRECTION: 'game.world.exit.direction'
} as const

let appInsights: ApplicationInsights | undefined
let sessionId: string | undefined
let userId: string | undefined

/**
 * Generate a unique session ID for this browser session
 * Uses crypto.randomUUID() for uniqueness
 */
function generateSessionId(): string {
    return crypto.randomUUID()
}

/**
 * Get the current session ID (generates one if not already created)
 */
export function getSessionId(): string | undefined {
    return sessionId
}

/**
 * Set the authenticated user ID (Microsoft Account ID from SWA auth)
 * Call this when user authentication state changes
 */
export function setUserId(id: string | undefined): void {
    userId = id
    // Set authenticated user context in App Insights for correlation
    if (appInsights && id) {
        appInsights.setAuthenticatedUserContext(id, undefined, true)
    } else if (appInsights && !id) {
        appInsights.clearAuthenticatedUserContext()
    }
}

/**
 * Get the current authenticated user ID
 */
export function getUserId(): string | undefined {
    return userId
}

/**
 * Initialize Application Insights telemetry
 * Automatically handles:
 * - Connection string from environment
 * - Session ID generation
 * - Automatic error tracking
 * - Page view tracking
 */
export function initTelemetry(): ApplicationInsights | undefined {
    if (appInsights) return appInsights
    const connectionString = import.meta.env.VITE_APPINSIGHTS_CONNECTION_STRING
    if (!connectionString) return undefined

    // Generate session ID
    sessionId = generateSessionId()

    appInsights = new ApplicationInsights({
        config: {
            connectionString,
            enableAutoRouteTracking: true,
            enableCorsCorrelation: true,
            disableFetchTracking: false,
            disableAjaxTracking: false,
            // Enable automatic error tracking
            autoTrackPageVisitTime: true,
            // Correlation settings for backend propagation
            enableRequestHeaderTracking: true,
            enableResponseHeaderTracking: true
        }
    })

    appInsights.loadAppInsights()

    // Track initial page view
    appInsights.trackPageView()

    // Set up automatic error tracking
    setupErrorTracking()

    // Set up session end tracking (page unload)
    setupSessionEndTracking()

    // Track session start
    trackSessionStart()

    return appInsights
}

/**
 * Set up automatic error tracking for unhandled exceptions and promise rejections
 */
function setupErrorTracking(): void {
    // Track unhandled errors
    window.addEventListener('error', (event: ErrorEvent) => {
        trackUIError(event.error || new Error(event.message), {
            source: 'window.onerror',
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        })
    })

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason))
        trackUIError(error, {
            source: 'unhandledrejection'
        })
    })
}

/**
 * Set up session end tracking on page unload
 */
function setupSessionEndTracking(): void {
    // Use visibilitychange for more reliable tracking (pagehide/unload are deprecated for telemetry)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            trackSessionEnd()
        }
    })

    // Fallback for browsers that don't fully support visibilitychange
    window.addEventListener('pagehide', () => {
        trackSessionEnd()
    })
}

/**
 * Track Session.Start event
 */
function trackSessionStart(): void {
    if (!appInsights || !sessionId) return

    const properties: Record<string, unknown> = {
        service: 'frontend-web',
        userAgent: navigator.userAgent,
        screenWidth: window.screen?.width,
        screenHeight: window.screen?.height,
        language: navigator.language,
        [FRONTEND_ATTRIBUTE_KEYS.SESSION_ID]: sessionId
    }
    if (userId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.USER_ID] = userId
    }

    // Session events use direct tracking (no playerGuid context)
    trackEventDirect('Session.Start', properties)
}

/**
 * Track Session.End event (called on page unload/visibility change)
 * Uses sendBeacon API via App Insights for reliability during page unload
 */
function trackSessionEnd(): void {
    if (!appInsights || !sessionId) return

    const properties: Record<string, unknown> = {
        service: 'frontend-web',
        [FRONTEND_ATTRIBUTE_KEYS.SESSION_ID]: sessionId
    }
    if (userId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.USER_ID] = userId
    }

    // Session events use direct tracking (no playerGuid context)
    trackEventDirect('Session.End', properties)
    appInsights.flush()
}

/**
 * Internal helper: direct SDK event tracking (telemetry module only)
 * Only for events that don't need game context enrichment
 */
function trackEventDirect(name: string, properties?: Record<string, unknown>): void {
    if (!appInsights) return
    appInsights.trackEvent({ name }, properties as Record<string, unknown> | undefined)
}

/**
 * Higher-level game event wrapper (frontend)
 * Automatically injects: service, playerGuid, sessionId, userId, persistenceMode
 */
export function trackGameEventClient(name: string, properties?: Record<string, unknown>): void {
    if (!appInsights) return
    if (!(GAME_EVENT_NAMES as readonly string[]).includes(name)) {
        // Surface invalid event names explicitly for later cleanup / dashboards
        trackEventDirect('Telemetry.EventName.Invalid', { requested: name })
        return
    }
    let playerGuid: string | undefined
    try {
        const g = localStorage.getItem('tsa.playerGuid')
        if (g && /^[0-9a-fA-F-]{8}/.test(g)) playerGuid = g
    } catch {
        /* ignore */
    }
    const persistenceMode = import.meta.env.VITE_PERSISTENCE_MODE || undefined
    const service = 'frontend-web'
    const merged: Record<string, unknown> = {
        service,
        ...(persistenceMode ? { persistenceMode } : {}),
        ...(playerGuid ? { playerGuid } : {}),
        ...properties
    }

    // Enrich with session attributes
    if (sessionId) {
        merged[FRONTEND_ATTRIBUTE_KEYS.SESSION_ID] = sessionId
    }
    if (userId) {
        merged[FRONTEND_ATTRIBUTE_KEYS.USER_ID] = userId
    }

    trackEventDirect(name, merged)
}

/**
 * Track UI.Error event with frontend error attributes
 * Call this for handled errors that should be reported
 */
export function trackUIError(error: Error, properties?: Record<string, unknown>): void {
    if (!appInsights) return

    const errorCode = error.name || 'UnknownError'
    const merged: Record<string, unknown> = {
        service: 'frontend-web',
        errorMessage: error.message,
        errorStack: error.stack?.substring(0, MAX_ERROR_STACK_LENGTH),
        [FRONTEND_ATTRIBUTE_KEYS.ERROR_CODE]: errorCode,
        ...properties
    }

    if (sessionId) {
        merged[FRONTEND_ATTRIBUTE_KEYS.SESSION_ID] = sessionId
    }
    if (userId) {
        merged[FRONTEND_ATTRIBUTE_KEYS.USER_ID] = userId
    }

    // Track as UI.Error custom event (direct, no playerGuid context)
    trackEventDirect('UI.Error', merged)

    // Also track as exception for App Insights exception tracking
    appInsights.trackException({ error, properties: merged })
}

/**
 * Track error (legacy function for backward compatibility)
 */
export function trackError(error: Error, properties?: Record<string, unknown>): void {
    appInsights?.trackException({ error, properties })
}

/**
 * Track player navigation action
 * @param direction - The direction of navigation (north, south, etc.)
 * @param latencyMs - Optional latency in milliseconds for the navigation action
 * @param correlationId - Optional correlation ID for backend tracking
 */
export function trackPlayerNavigate(direction: string, latencyMs?: number, correlationId?: string): void {
    if (!appInsights) return

    const properties: Record<string, unknown> = {
        service: 'frontend-web',
        [FRONTEND_ATTRIBUTE_KEYS.EXIT_DIRECTION]: direction,
        [FRONTEND_ATTRIBUTE_KEYS.ACTION_TYPE]: 'navigate'
    }

    if (sessionId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.SESSION_ID] = sessionId
    }
    if (userId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.USER_ID] = userId
    }
    if (latencyMs !== undefined) {
        properties[FRONTEND_ATTRIBUTE_KEYS.LATENCY_MS] = latencyMs
    }
    if (correlationId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.CORRELATION_ID] = correlationId
    }

    trackGameEventClient('Player.Navigate', properties)
}

/**
 * Track player command input
 * @param command - The command string entered by the player
 * @param actionType - The type of action (e.g., 'move', 'look', 'inventory')
 * @param latencyMs - Optional latency in milliseconds for command processing
 * @param correlationId - Optional correlation ID for backend tracking
 */
export function trackPlayerCommand(command: string, actionType: string, latencyMs?: number, correlationId?: string): void {
    if (!appInsights) return

    const properties: Record<string, unknown> = {
        service: 'frontend-web',
        command: command.substring(0, MAX_COMMAND_LENGTH),
        [FRONTEND_ATTRIBUTE_KEYS.ACTION_TYPE]: actionType
    }

    if (sessionId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.SESSION_ID] = sessionId
    }
    if (userId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.USER_ID] = userId
    }
    if (latencyMs !== undefined) {
        properties[FRONTEND_ATTRIBUTE_KEYS.LATENCY_MS] = latencyMs
    }
    if (correlationId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.CORRELATION_ID] = correlationId
    }

    trackGameEventClient('Player.Command', properties)
}

/**
 * Create a debounced version of a telemetry tracking function
 * Useful for high-frequency events like typing
 *
 * @param fn - The function to debounce
 * @param waitMs - The debounce delay in milliseconds
 * @returns A debounced version of the function
 */
export function debounceTrack<T extends (...args: Parameters<T>) => void>(fn: T, waitMs: number): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    return (...args: Parameters<T>): void => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId)
        }
        timeoutId = setTimeout(() => {
            fn(...args)
            timeoutId = undefined
        }, waitMs)
    }
}

/**
 * Track page view with explicit correlation IDs
 * Emits PageView event with operationId and sessionId for frontend-backend correlation
 *
 * @param pageName - Name of the page/route (e.g., '/game', '/profile')
 * @param pageUrl - Full URL of the page (optional)
 */
export function trackPageView(pageName?: string, pageUrl?: string): void {
    if (!appInsights) return

    const properties: Record<string, unknown> = {
        service: 'frontend-web'
    }

    // Add session correlation
    if (sessionId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.SESSION_ID] = sessionId
    }
    if (userId) {
        properties[FRONTEND_ATTRIBUTE_KEYS.USER_ID] = userId
    }

    // Generate operation ID for this page view
    const operationId = crypto.randomUUID()
    properties['operationId'] = operationId

    appInsights.trackPageView({
        name: pageName,
        uri: pageUrl,
        properties
    })
}

/**
 * Get the Application Insights instance (for advanced usage)
 */
export function getAppInsights(): ApplicationInsights | undefined {
    return appInsights
}

/**
 * Check if telemetry is enabled
 */
export function isTelemetryEnabled(): boolean {
    return appInsights !== undefined
}

export default appInsights
