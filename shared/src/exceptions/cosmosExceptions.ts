/**
 * Domain exceptions for Cosmos DB operations.
 * Translates Cosmos SDK errors into meaningful domain exceptions.
 *
 * Used by repository abstraction layer to provide consistent error handling
 * across Gremlin and SQL API operations.
 */

/**
 * Base class for all Cosmos-related domain exceptions.
 */
export abstract class CosmosException extends Error {
    constructor(
        message: string,
        public readonly statusCode?: number
    ) {
        super(message)
        this.name = this.constructor.name
        Error.captureStackTrace(this, this.constructor)
    }
}

/**
 * Resource not found (404).
 * Caller can decide whether to treat as error or null return.
 */
export class NotFoundException extends CosmosException {
    constructor(
        message: string,
        public readonly resourceId?: string,
        public readonly containerName?: string
    ) {
        super(message, 404)
    }
}

/**
 * Conflict error (409) - typically due to concurrent modifications.
 * Indicates optimistic concurrency failure or duplicate key.
 */
export class ConcurrencyException extends CosmosException {
    constructor(
        message: string,
        public readonly resourceId?: string
    ) {
        super(message, 409)
    }
}

/**
 * Throttling error (429) - rate limit exceeded.
 * Retryable with exponential backoff.
 */
export class RetryableException extends CosmosException {
    constructor(
        message: string,
        public readonly retryAfterMs?: number
    ) {
        super(message, 429)
    }
}

/**
 * Precondition failed (412) - typically etag mismatch.
 * Indicates data was modified by another process.
 */
export class PreconditionFailedException extends CosmosException {
    constructor(
        message: string,
        public readonly resourceId?: string
    ) {
        super(message, 412)
    }
}

/**
 * Bad request (400) - invalid query or malformed data.
 * Not retryable - indicates client error.
 */
export class ValidationException extends CosmosException {
    constructor(
        message: string,
        public readonly details?: string
    ) {
        super(message, 400)
    }
}

/**
 * Translate raw Cosmos error to domain exception.
 * @param error - Error from Cosmos SDK
 * @param context - Additional context for error message
 */
export function translateCosmosError(error: unknown, context?: string): CosmosException {
    const cosmosError = error as { code?: number; message?: string; headers?: { 'x-ms-retry-after-ms'?: string } }
    const statusCode = cosmosError.code
    const message = cosmosError.message || 'Unknown Cosmos error'
    const contextPrefix = context ? `${context}: ` : ''

    switch (statusCode) {
        case 404:
            return new NotFoundException(`${contextPrefix}${message}`)
        case 409:
            return new ConcurrencyException(`${contextPrefix}${message}`)
        case 429: {
            const retryAfterMs = cosmosError.headers?.['x-ms-retry-after-ms']
                ? parseInt(cosmosError.headers['x-ms-retry-after-ms'], 10)
                : undefined
            return new RetryableException(`${contextPrefix}${message}`, retryAfterMs)
        }
        case 412:
            return new PreconditionFailedException(`${contextPrefix}${message}`)
        case 400:
            return new ValidationException(`${contextPrefix}${message}`)
        default:
            // Generic exception for unexpected status codes
            return new (class extends CosmosException {})(message, statusCode)
    }
}
