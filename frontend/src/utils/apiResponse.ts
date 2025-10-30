/**
 * API response handling utilities
 */

/**
 * Handle rate limit response (429)
 * @param response - Fetch response
 * @param json - Response JSON body
 * @returns Error message or undefined if not rate limited
 */
export function handleRateLimitResponse(response: Response, json: Record<string, unknown>): string | undefined {
    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After')
        const message = (json.error as Record<string, unknown>)?.message

        if (retryAfter) {
            return `Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`
        }

        if (typeof message === 'string') {
            return message
        }

        return 'Rate limit exceeded. Please wait before trying again.'
    }

    return undefined
}

/**
 * Extract error message from API response
 * Handles standard error envelopes and HTTP status codes
 * @param response - Fetch response
 * @param json - Response JSON body
 * @param unwrapped - Unwrapped envelope data
 * @returns Error message
 */
export function extractErrorMessage(
    response: Response,
    json: Record<string, unknown>,
    unwrapped: { isEnvelope: boolean; success: boolean; error?: { message?: string } }
): string {
    // Check for rate limit first
    const rateLimitError = handleRateLimitResponse(response, json)
    if (rateLimitError) {
        return rateLimitError
    }

    // Try unwrapped envelope error
    if (unwrapped.error?.message) {
        return unwrapped.error.message
    }

    // Fallback to direct error property
    const fallbackErr = json.error
    if (typeof fallbackErr === 'string') {
        return fallbackErr
    }

    if (fallbackErr && typeof fallbackErr === 'object' && 'message' in fallbackErr) {
        const msg = (fallbackErr as Record<string, unknown>).message
        if (typeof msg === 'string') {
            return msg
        }
    }

    // Last resort: HTTP status
    return `HTTP ${response.status}`
}
