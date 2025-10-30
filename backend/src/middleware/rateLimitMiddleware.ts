/**
 * Rate limiting middleware for Azure Functions handlers
 */

import type { HttpRequest, HttpResponseInit } from '@azure/functions'
import { err } from '@piquet-h/shared'
import type { RateLimiter } from './rateLimiter.js'
import { trackGameEventStrict, extractCorrelationId, extractPlayerGuid } from '../telemetry.js'

/**
 * Extract client identifier from request
 * Priority: player GUID > IP address > fallback
 */
export function extractClientId(req: HttpRequest): string {
    // Try player GUID first (most specific)
    const playerGuid = extractPlayerGuid(req.headers)
    if (playerGuid) {
        return `player:${playerGuid}`
    }

    // Fall back to IP address
    const forwardedFor = req.headers.get('x-forwarded-for')
    if (forwardedFor) {
        // Use first IP in the chain
        const firstIp = forwardedFor.split(',')[0].trim()
        return `ip:${firstIp}`
    }

    // Fallback for local development
    return 'anonymous'
}

/**
 * Check rate limit and return 429 response if exceeded
 * @param req - HTTP request
 * @param limiter - Rate limiter instance
 * @param route - Route name for telemetry
 * @returns null if allowed, 429 response if rate limited
 */
export function checkRateLimit(req: HttpRequest, limiter: RateLimiter, route: string): HttpResponseInit | null {
    const clientId = extractClientId(req)
    const allowed = limiter.check(clientId)

    if (!allowed) {
        const correlationId = extractCorrelationId(req.headers)
        const violation = limiter.getViolation(clientId, route)
        const retryAfter = limiter.getResetTime(clientId)

        // Emit telemetry
        trackGameEventStrict(
            'Security.RateLimit.Exceeded',
            {
                route,
                limit: violation.limit,
                windowMs: violation.windowMs,
                requestCount: violation.requestCount,
                clientId: violation.clientId
            },
            {
                playerGuid: extractPlayerGuid(req.headers),
                correlationId
            }
        )

        // Return 429 response
        return {
            status: 429,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Retry-After': retryAfter.toString(),
                'X-RateLimit-Limit': violation.limit.toString(),
                'X-RateLimit-Reset': Math.floor(violation.resetAt / 1000).toString()
            },
            jsonBody: err(
                'RateLimitExceeded',
                `Rate limit exceeded. Maximum ${violation.limit} requests per ${Math.floor(violation.windowMs / 1000)} seconds. Retry after ${retryAfter} seconds.`,
                correlationId
            )
        }
    }

    return null
}
