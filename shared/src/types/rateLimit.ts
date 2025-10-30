/**
 * Rate limiting types and configuration
 */

/**
 * Rate limit configuration for different operations
 */
export interface RateLimitConfig {
    /**
     * Maximum number of requests allowed within the time window
     */
    maxRequests: number

    /**
     * Time window in milliseconds
     */
    windowMs: number

    /**
     * Optional: Identifier for this rate limit rule (for telemetry)
     */
    identifier?: string
}

/**
 * Rate limit violation information
 */
export interface RateLimitViolation {
    /**
     * Route or operation that was rate limited
     */
    route: string

    /**
     * Maximum requests allowed
     */
    limit: number

    /**
     * Time window in milliseconds
     */
    windowMs: number

    /**
     * Client identifier (IP or player ID)
     */
    clientId: string

    /**
     * Number of requests made in current window
     */
    requestCount: number

    /**
     * When the rate limit window will reset (timestamp)
     */
    resetAt: number
}
