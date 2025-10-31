/**
 * Validation utilities for HTTP request parameters
 */

/**
 * Validates if a string is a valid UUID v4 format
 * @param value - String to validate
 * @returns true if valid UUID v4 format, false otherwise
 */
export function isValidGuid(value: string | null | undefined): value is string {
    if (!value) return false
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return guidRegex.test(value)
}
