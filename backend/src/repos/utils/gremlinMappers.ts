/**
 * Shared utility functions for mapping Gremlin/Cosmos DB vertex properties.
 * Cosmos Gremlin API returns properties as arrays or scalars, requiring normalization.
 */

/**
 * Extract the first scalar value from a Gremlin property value.
 * Gremlin properties can be arrays (multi-valued) or single values.
 * @param val - The raw property value from Gremlin
 * @returns The first scalar value as a string, or undefined if not present
 */
export function firstScalar(val: unknown): string | undefined {
    if (val == null) return undefined
    if (Array.isArray(val)) return val.length ? String(val[0]) : undefined
    return String(val)
}

/**
 * Parse a string value to boolean.
 * Handles Gremlin boolean properties that may be returned as strings.
 * @param v - String representation of boolean ('true', '1', etc.)
 * @returns Boolean value or undefined if not parseable
 */
export function parseBool(v: string | undefined): boolean | undefined {
    if (!v) return undefined
    return v === 'true' || v === '1'
}
