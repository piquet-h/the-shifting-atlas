/**
 * Feature flags for progressive migration and operational toggles.
 *
 * This module centralizes feature flag configuration with strict parsing,
 * default values, and validation logging.
 *
 * Guidelines:
 * - Flags must have explicit defaults (no undefined state)
 * - Invalid values trigger warnings and fall back to defaults
 * - Flag state logged at startup for observability
 * - Flags should be immutable after initialization (no runtime toggles)
 */

interface FlagValidationResult {
    value: boolean
    hadWarning: boolean
    warningDetails?: {
        flagName: string
        rawValue: string
        defaultValue: boolean
    }
}

/**
 * Validation warnings collected during flag parsing.
 * Used to emit telemetry events after Application Insights is initialized.
 */
const validationWarnings: Array<{
    flagName: string
    rawValue: string
    defaultValue: boolean
}> = []

/**
 * Parse a boolean environment variable with strict validation.
 *
 * @param value - Environment variable value (or undefined)
 * @param defaultValue - Fallback value for undefined/invalid inputs
 * @param flagName - Flag name for logging
 * @returns Parsed boolean result with validation metadata
 */
function parseBooleanFlag(value: string | undefined, defaultValue: boolean, flagName: string): FlagValidationResult {
    if (value === undefined || value === '') {
        return { value: defaultValue, hadWarning: false }
    }

    const normalized = value.toLowerCase().trim()

    // Accept common truthy values
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
        return { value: true, hadWarning: false }
    }

    // Accept common falsy values
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return { value: false, hadWarning: false }
    }

    // Invalid value - log warning and use default
    console.warn(`[FeatureFlags] Invalid boolean value for ${flagName}: "${value}". Using default: ${defaultValue}`)

    const warningDetails = {
        flagName,
        rawValue: value,
        defaultValue
    }
    validationWarnings.push(warningDetails)

    return {
        value: defaultValue,
        hadWarning: true,
        warningDetails
    }
}

/**
 * Feature flag: Disable Gremlin player vertex writes
 *
 * When enabled (true): Skip all Gremlin player vertex creation/updates.
 * Players are stored exclusively in Cosmos SQL API.
 *
 * When disabled (false, default): Dual persistence mode - write to both
 * Gremlin and SQL API. Gremlin reads remain available as fallback.
 *
 * Environment variable: DISABLE_GREMLIN_PLAYER_VERTEX
 * Default: false (dual persistence mode)
 *
 * Migration context (ADR-002):
 * - Issue #517: PlayerRecord schema in SQL API
 * - Issue #518: Write-through logic
 * - Issue #519: This feature flag
 *
 * Rollback scenario: Set to false to restore Gremlin as authoritative source.
 */
const disableGremlinPlayerVertexResult = parseBooleanFlag(process.env.DISABLE_GREMLIN_PLAYER_VERTEX, false, 'DISABLE_GREMLIN_PLAYER_VERTEX')

export const DISABLE_GREMLIN_PLAYER_VERTEX = disableGremlinPlayerVertexResult.value

/**
 * Returns all feature flag states for startup logging.
 *
 * Use this to emit a single telemetry event capturing all flag values
 * at application initialization.
 */
export function getFeatureFlagSnapshot(): Record<string, boolean> {
    return {
        disableGremlinPlayerVertex: DISABLE_GREMLIN_PLAYER_VERTEX
    }
}

/**
 * Returns validation warnings collected during flag parsing.
 * Call this after Application Insights is initialized to emit warnings.
 */
export function getValidationWarnings() {
    return [...validationWarnings]
}
