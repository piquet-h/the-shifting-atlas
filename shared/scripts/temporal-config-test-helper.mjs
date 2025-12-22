#!/usr/bin/env node
/**
 * Helper script for temporal config integration tests
 * Loads config and outputs JSON to stdout for parent process to verify
 */

import { getTemporalConfig } from '../dist/temporal/config.js'

try {
    const config = getTemporalConfig()
    console.log(JSON.stringify(config))
} catch (error) {
    console.error(error.message)
    process.exit(1)
}
