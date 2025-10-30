/**
 * Input validation utilities for security baseline
 * Provides consistent validation and error responses across the application
 */

import { Direction } from '../domainModels.js'
import { normalizeDirection } from '../direction/index.js'

/**
 * Validation error codes for structured error responses
 */
export type ValidationErrorCode = 'INVALID_UUID' | 'MISSING_PLAYER_ID' | 'INVALID_DIRECTION' | 'AMBIGUOUS_DIRECTION'

/**
 * Validation result type
 */
export interface ValidationResult<T = unknown> {
    success: boolean
    value?: T
    error?: {
        code: ValidationErrorCode
        message: string
        clarification?: string
    }
}

/**
 * UUID validation regex (RFC 4122)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validates if a string is a valid UUID
 * @param value - String to validate
 * @returns true if valid UUID, false otherwise
 */
export function isValidUuid(value: string | undefined | null): boolean {
    if (!value) return false
    return UUID_REGEX.test(value)
}

/**
 * Validates a player ID (must be a valid UUID)
 * @param playerId - Player ID to validate
 * @returns Validation result with error details if invalid
 */
export function validatePlayerId(playerId: string | undefined | null): ValidationResult<string> {
    if (!playerId) {
        return {
            success: false,
            error: {
                code: 'MISSING_PLAYER_ID',
                message: 'Player ID is required'
            }
        }
    }

    if (!isValidUuid(playerId)) {
        return {
            success: false,
            error: {
                code: 'INVALID_UUID',
                message: 'Player ID must be a valid UUID'
            }
        }
    }

    return {
        success: true,
        value: playerId
    }
}

/**
 * Validates a direction input using the shared direction normalizer
 * @param direction - Direction string to validate
 * @param lastHeading - Optional last heading for relative directions
 * @returns Validation result with canonical direction or error
 */
export function validateDirection(direction: string | undefined | null, lastHeading?: Direction): ValidationResult<Direction> {
    if (!direction) {
        return {
            success: false,
            error: {
                code: 'INVALID_DIRECTION',
                message: 'Direction is required'
            }
        }
    }

    const normalizationResult = normalizeDirection(direction, lastHeading)

    if (normalizationResult.status === 'ambiguous') {
        return {
            success: false,
            error: {
                code: 'AMBIGUOUS_DIRECTION',
                message: 'Direction is ambiguous',
                clarification: normalizationResult.clarification
            }
        }
    }

    if (normalizationResult.status === 'unknown' || !normalizationResult.canonical) {
        return {
            success: false,
            error: {
                code: 'INVALID_DIRECTION',
                message: 'Invalid direction',
                clarification: normalizationResult.clarification
            }
        }
    }

    return {
        success: true,
        value: normalizationResult.canonical
    }
}

/**
 * Validates a location ID (must be a valid UUID)
 * @param locationId - Location ID to validate
 * @returns Validation result with error details if invalid
 */
export function validateLocationId(locationId: string | undefined | null): ValidationResult<string> {
    if (!locationId) {
        return {
            success: false,
            error: {
                code: 'INVALID_UUID',
                message: 'Location ID is required'
            }
        }
    }

    if (!isValidUuid(locationId)) {
        return {
            success: false,
            error: {
                code: 'INVALID_UUID',
                message: 'Location ID must be a valid UUID'
            }
        }
    }

    return {
        success: true,
        value: locationId
    }
}
