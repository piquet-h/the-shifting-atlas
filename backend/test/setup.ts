/**
 * Test Setup - Load local.settings.json into process.env
 *
 * This module is imported before tests run to ensure PERSISTENCE_MODE and other
 * configuration from local.settings.json is available to the test suite.
 *
 * Azure Functions runtime loads local.settings.json automatically, but Node.js
 * test runner does not. This setup module bridges that gap.
 *
 * Usage: npm test scripts use --import=tsx --loader to run this before tests
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const settingsPath = join(__dirname, '../local.settings.json')

try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    // Load Values from local.settings.json into process.env
    // Only set if not already defined (allow env var overrides)
    if (settings.Values) {
        for (const [key, value] of Object.entries(settings.Values)) {
            if (process.env[key] === undefined) {
                process.env[key] = String(value)
            }
        }
    }
    console.log(`✓ Loaded local.settings.json: PERSISTENCE_MODE=${process.env.PERSISTENCE_MODE || 'not set'}`)
} catch (err) {
    // If local.settings.json doesn't exist, default to memory mode (safe fallback)
    if (!process.env.PERSISTENCE_MODE) {
        process.env.PERSISTENCE_MODE = 'memory'
    }
    console.log(`ℹ No local.settings.json found, using PERSISTENCE_MODE=${process.env.PERSISTENCE_MODE}`)
}
