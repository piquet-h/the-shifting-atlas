/**
 * Telemetry Correlation Utilities
 *
 * Generates and manages correlation IDs for frontend-to-backend request tracking.
 * Enables Application Insights join queries across client and server events.
 *
 * Usage:
 * - Generate unique correlationId per user action (move, look)
 * - Attach correlationId to x-correlation-id request header
 * - Track UI events with correlationId for backend correlation
 *
 * Feature gated by VITE_APPINSIGHTS_ENABLED (via existing telemetry init check)
 */

/**
 * Generate a unique correlation ID for a user action
 * Uses crypto.randomUUID() for uniqueness and standard format
 *
 * @returns A UUID string suitable for correlation tracking
 */
export function generateCorrelationId(): string {
    return crypto.randomUUID()
}

/**
 * Build correlation headers for API requests
 * Includes x-correlation-id if correlationId is provided
 *
 * @param correlationId - Optional correlation ID to include in headers
 * @returns Headers object with correlation ID if provided
 */
export function buildCorrelationHeaders(correlationId?: string): Record<string, string> {
    if (!correlationId) {
        return {}
    }
    return {
        'x-correlation-id': correlationId
    }
}
