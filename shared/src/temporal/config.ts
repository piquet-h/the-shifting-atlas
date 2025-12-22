/**
 * Temporal Configuration
 *
 * Centralized temporal configuration for reconciliation thresholds, epsilon window,
 * and drift rate with environment variable overrides.
 *
 * Configuration values can be tuned via environment variables without code changes.
 */

/**
 * Temporal configuration interface
 */
export interface TemporalConfig {
    /** Silent snap window - offsets within this are ignored (default: 5 minutes) */
    epsilonMs: number

    /** Small nudge window - threshold for slow reconciliation (default: 1 hour) */
    slowThresholdMs: number

    /** Narrative compression trigger - threshold for compress reconciliation (default: 1 day) */
    compressThresholdMs: number

    /** Idle drift multiplier - real time to game time conversion (default: 1.0) */
    driftRate: number

    /** Maximum wait advance per reconcile step (default: 30 minutes) */
    waitMaxStepMs: number

    /** Maximum slow nudge per world clock advancement (default: 10 minutes) */
    slowMaxStepMs: number
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: TemporalConfig = {
    epsilonMs: 300000, // 5 minutes
    slowThresholdMs: 3600000, // 1 hour
    compressThresholdMs: 86400000, // 1 day
    driftRate: 1.0, // 1:1 real time to game time
    waitMaxStepMs: 1800000, // 30 minutes
    slowMaxStepMs: 600000 // 10 minutes
}

/**
 * Parse a numeric environment variable with fallback to default
 */
function parseEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key]
    if (value === undefined || value === '') {
        return defaultValue
    }
    const parsed = Number(value)
    if (isNaN(parsed)) {
        throw new Error(`Invalid numeric value for ${key}: ${value}`)
    }
    return parsed
}

/**
 * Validate temporal configuration
 * Ensures epsilon < slowThreshold < compressThreshold and all values are positive/non-negative
 */
function validateConfig(config: TemporalConfig): void {
    // Check for positive values (all time thresholds must be positive)
    if (config.epsilonMs <= 0) {
        throw new Error('Temporal configuration error: epsilonMs must be positive')
    }
    if (config.slowThresholdMs <= 0) {
        throw new Error('Temporal configuration error: slowThresholdMs must be positive')
    }
    if (config.compressThresholdMs <= 0) {
        throw new Error('Temporal configuration error: compressThresholdMs must be positive')
    }
    if (config.waitMaxStepMs <= 0) {
        throw new Error('Temporal configuration error: waitMaxStepMs must be positive')
    }
    if (config.slowMaxStepMs <= 0) {
        throw new Error('Temporal configuration error: slowMaxStepMs must be positive')
    }

    // Drift rate can be zero (paused time) but not negative
    if (config.driftRate < 0) {
        throw new Error('Temporal configuration error: driftRate must be non-negative')
    }

    // Check threshold ordering
    if (config.epsilonMs >= config.slowThresholdMs) {
        throw new Error('Temporal configuration error: epsilonMs must be less than slowThresholdMs')
    }
    if (config.slowThresholdMs >= config.compressThresholdMs) {
        throw new Error('Temporal configuration error: slowThresholdMs must be less than compressThresholdMs')
    }
}

/**
 * Load configuration from environment variables with fallback to defaults
 */
function loadConfig(): TemporalConfig {
    const config: TemporalConfig = {
        epsilonMs: parseEnvNumber('TEMPORAL_EPSILON_MS', DEFAULT_CONFIG.epsilonMs),
        slowThresholdMs: parseEnvNumber('TEMPORAL_SLOW_THRESHOLD_MS', DEFAULT_CONFIG.slowThresholdMs),
        compressThresholdMs: parseEnvNumber('TEMPORAL_COMPRESS_THRESHOLD_MS', DEFAULT_CONFIG.compressThresholdMs),
        driftRate: parseEnvNumber('TEMPORAL_DRIFT_RATE', DEFAULT_CONFIG.driftRate),
        waitMaxStepMs: parseEnvNumber('TEMPORAL_WAIT_MAX_STEP_MS', DEFAULT_CONFIG.waitMaxStepMs),
        slowMaxStepMs: parseEnvNumber('TEMPORAL_SLOW_MAX_STEP_MS', DEFAULT_CONFIG.slowMaxStepMs)
    }

    validateConfig(config)
    return config
}

/**
 * Singleton instance of temporal configuration
 */
let configInstance: TemporalConfig | null = null

/**
 * Get temporal configuration singleton
 * Loads from environment variables on first call, returns cached instance on subsequent calls
 *
 * @throws Error if configuration is invalid
 * @returns TemporalConfig instance
 */
export function getTemporalConfig(): TemporalConfig {
    if (configInstance === null) {
        configInstance = loadConfig()
    }
    return configInstance
}
