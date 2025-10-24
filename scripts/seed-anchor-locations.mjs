#!/usr/bin/env node
/**
 * Seed Script: Anchor Locations & Exits
 * 
 * Idempotent seeding of anchor locations and minimal EXIT edges via Gremlin/HTTP adapter.
 * Safe to re-run (no duplicate vertices/edges created).
 * 
 * Usage:
 *   node scripts/seed-anchor-locations.mjs [--mode=memory|cosmos] [--data=path/to/locations.json]
 * 
 * Environment Variables (for cosmos mode):
 *   PERSISTENCE_MODE=cosmos
 *   COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH
 *   COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE, etc.
 * 
 * Exit Codes:
 *   0 - Success
 *   1 - Configuration or runtime error
 */

import { readFile } from 'fs/promises'
import { resolve } from 'path'

/**
 * Main entry point for the seed script
 */
async function main() {
    const args = process.argv.slice(2)
    let mode = process.env.PERSISTENCE_MODE || 'memory'
    let dataPath = null

    // Parse command line arguments
    for (const arg of args) {
        if (arg.startsWith('--mode=')) {
            mode = arg.substring('--mode='.length)
        } else if (arg.startsWith('--data=')) {
            dataPath = arg.substring('--data='.length)
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
Seed Script: Anchor Locations & Exits

Usage:
  node scripts/seed-anchor-locations.mjs [options]

Options:
  --mode=memory|cosmos    Persistence mode (default: from PERSISTENCE_MODE env or 'memory')
  --data=path            Path to locations JSON file (default: backend/src/data/villageLocations.json)
  --help, -h             Show this help message

Environment Variables (for cosmos mode):
  PERSISTENCE_MODE=cosmos
  COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH
  COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE
  COSMOS_SQL_CONTAINER_PLAYERS, COSMOS_SQL_CONTAINER_INVENTORY, 
  COSMOS_SQL_CONTAINER_LAYERS, COSMOS_SQL_CONTAINER_EVENTS

Examples:
  # Seed to in-memory store (default)
  node scripts/seed-anchor-locations.mjs

  # Seed to Cosmos DB
  PERSISTENCE_MODE=cosmos node scripts/seed-anchor-locations.mjs

  # Seed custom data file
  node scripts/seed-anchor-locations.mjs --data=custom-locations.json
`)
            process.exit(0)
        }
    }

    // Set persistence mode environment variable
    process.env.PERSISTENCE_MODE = mode

    try {
        console.log('═══════════════════════════════════════════════════════════')
        console.log('  Seed Script: Anchor Locations & Exits')
        console.log('═══════════════════════════════════════════════════════════')
        console.log(`Persistence Mode: ${mode}`)
        console.log(`Timestamp: ${new Date().toISOString()}`)
        console.log()

        // Determine data file path
        if (!dataPath) {
            // Default to villageLocations.json in backend
            const scriptDir = new URL('.', import.meta.url).pathname
            dataPath = resolve(scriptDir, '../backend/src/data/villageLocations.json')
        }

        console.log(`Loading location data from: ${dataPath}`)
        
        // Load location blueprint
        let blueprint
        try {
            const fileContent = await readFile(dataPath, 'utf8')
            blueprint = JSON.parse(fileContent)
        } catch (err) {
            console.error(`❌ Error: Failed to load location data from ${dataPath}`)
            console.error(`   ${err.message}`)
            process.exit(1)
        }

        if (!Array.isArray(blueprint) || blueprint.length === 0) {
            console.error('❌ Error: Location data must be a non-empty array')
            process.exit(1)
        }

        console.log(`✓ Loaded ${blueprint.length} locations from blueprint`)
        console.log()

        // Dynamic import of seedWorld to avoid loading backend modules before env is set
        const { seedWorld } = await import('../backend/src/seeding/seedWorld.js')

        // Custom logger for capturing output
        const logs = []
        const log = (...args) => {
            const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')
            logs.push(msg)
        }

        console.log('Starting seed operation...')
        console.log('───────────────────────────────────────────────────────────')

        // Execute seeding
        const startTime = Date.now()
        const result = await seedWorld({
            blueprint,
            log
        })
        const elapsedMs = Date.now() - startTime

        console.log('───────────────────────────────────────────────────────────')
        console.log()
        console.log('✅ Seed operation completed successfully')
        console.log()
        console.log('═══════════════════════════════════════════════════════════')
        console.log('  Summary')
        console.log('═══════════════════════════════════════════════════════════')
        console.log()
        console.log(`  Locations processed:        ${result.locationsProcessed}`)
        console.log(`  Location vertices created:  ${result.locationVerticesCreated}`)
        console.log(`  Exits created:              ${result.exitsCreated}`)
        console.log(`  Demo player created:        ${result.playerCreated ? 'Yes' : 'No (already exists)'}`)
        console.log(`  Demo player ID:             ${result.demoPlayerId}`)
        console.log()
        console.log(`  Elapsed time:               ${elapsedMs}ms`)
        console.log()
        console.log('═══════════════════════════════════════════════════════════')

        // Show additional logs if any
        if (logs.length > 0) {
            console.log()
            console.log('Additional Details:')
            logs.forEach(l => console.log(`  ${l}`))
        }

        console.log()
        console.log('Note: This script is idempotent. Re-running will update')
        console.log('      existing locations and skip creating duplicate exits.')
        console.log()

        process.exit(0)

    } catch (error) {
        console.error()
        console.error('═══════════════════════════════════════════════════════════')
        console.error('  ❌ Error')
        console.error('═══════════════════════════════════════════════════════════')
        console.error()
        console.error(`${error.message}`)
        
        if (error.stack) {
            console.error()
            console.error('Stack trace:')
            console.error(error.stack)
        }
        
        console.error()
        console.error('Troubleshooting:')
        console.error('  • Ensure backend dependencies are installed: cd backend && npm install')
        console.error('  • For cosmos mode, verify all required environment variables are set')
        console.error('  • Check that the location data file exists and is valid JSON')
        console.error()
        
        process.exit(1)
    }
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
}

export { main }
