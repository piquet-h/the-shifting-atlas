/**
 * In-memory rate limiter for Azure Functions
 * Provides simple per-client request throttling with configurable thresholds
 */

import type { RateLimitConfig, RateLimitViolation } from '@piquet-h/shared'

/**
 * Client tracking information
 */
interface ClientRecord {
    requestCount: number
    windowStart: number
}

/**
 * In-memory rate limiter with sliding window
 * Thread-safe for single-instance scenarios (Azure Functions consumption plan)
 */
export class RateLimiter {
    private readonly clients = new Map<string, ClientRecord>()
    private readonly config: Required<RateLimitConfig>
    private cleanupInterval: NodeJS.Timeout | null = null

    constructor(config: RateLimitConfig) {
        this.config = {
            maxRequests: config.maxRequests,
            windowMs: config.windowMs,
            identifier: config.identifier || 'default'
        }

        // Start periodic cleanup of expired entries
        this.startCleanup()
    }

    /**
     * Check if a request should be allowed for the given client
     * @param clientId - Client identifier (IP address or player ID)
     * @returns true if request is allowed, false if rate limit exceeded
     */
    check(clientId: string): boolean {
        const now = Date.now()
        const record = this.clients.get(clientId)

        // No previous record - allow request
        if (!record) {
            this.clients.set(clientId, {
                requestCount: 1,
                windowStart: now
            })
            return true
        }

        // Window expired - reset counter
        if (now - record.windowStart >= this.config.windowMs) {
            record.requestCount = 1
            record.windowStart = now
            return true
        }

        // Within window - check limit
        if (record.requestCount < this.config.maxRequests) {
            record.requestCount++
            return true
        }

        // Rate limit exceeded
        return false
    }

    /**
     * Get violation information for a client (for telemetry)
     * @param clientId - Client identifier
     * @param route - Route that was rate limited
     * @returns Rate limit violation information
     */
    getViolation(clientId: string, route: string): RateLimitViolation {
        const record = this.clients.get(clientId)
        const now = Date.now()

        return {
            route,
            limit: this.config.maxRequests,
            windowMs: this.config.windowMs,
            clientId,
            requestCount: record?.requestCount || 0,
            resetAt: record ? record.windowStart + this.config.windowMs : now + this.config.windowMs
        }
    }

    /**
     * Get time until rate limit resets for a client (in seconds)
     * @param clientId - Client identifier
     * @returns Seconds until reset, or 0 if no active limit
     */
    getResetTime(clientId: string): number {
        const record = this.clients.get(clientId)
        if (!record) return 0

        const now = Date.now()
        const resetAt = record.windowStart + this.config.windowMs
        const msUntilReset = Math.max(0, resetAt - now)
        return Math.ceil(msUntilReset / 1000)
    }

    /**
     * Clear all rate limit data (for testing)
     */
    clear(): void {
        this.clients.clear()
    }

    /**
     * Stop the cleanup interval (call when shutting down)
     */
    stop(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval)
            this.cleanupInterval = null
        }
    }

    /**
     * Start periodic cleanup of expired client records
     * Runs every minute to prevent memory growth
     * Skipped in test mode to avoid keeping Node process alive
     */
    private startCleanup(): void {
        // Skip cleanup interval in test mode
        if (process.env.NODE_ENV === 'test') {
            return
        }

        // Run cleanup every minute
        this.cleanupInterval = setInterval(() => {
            const now = Date.now()
            for (const [clientId, record] of this.clients.entries()) {
                // Remove records older than 2x the window
                if (now - record.windowStart > this.config.windowMs * 2) {
                    this.clients.delete(clientId)
                }
            }
        }, 60000)

        // Don't keep the process alive for cleanup
        this.cleanupInterval.unref()
    }
}

/**
 * Global rate limiters for different operations
 * Configurable via environment variables
 */
export const rateLimiters = {
    /**
     * Rate limiter for movement commands
     * Default: 30 requests per minute per client
     */
    movement: new RateLimiter({
        maxRequests: parseInt(process.env.RATE_LIMIT_MOVEMENT_MAX || '30', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_MOVEMENT_WINDOW_MS || '60000', 10),
        identifier: 'movement'
    }),

    /**
     * Rate limiter for look/location commands
     * Default: 60 requests per minute per client
     */
    look: new RateLimiter({
        maxRequests: parseInt(process.env.RATE_LIMIT_LOOK_MAX || '60', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_LOOK_WINDOW_MS || '60000', 10),
        identifier: 'look'
    })
}
