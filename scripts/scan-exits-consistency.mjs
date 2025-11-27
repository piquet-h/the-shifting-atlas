#!/usr/bin/env node
/**
 * Exit Graph Consistency Scanner
 *
 * Detects structural anomalies in the location graph:
 * - Dangling exits: Exit edges pointing to non-existent locations
 * - Orphan locations: Locations with no inbound or outbound exits
 *
 * Usage:
 *   node scripts/scan-exits-consistency.mjs [--output=report.json] [--seed-locations=loc1,loc2]
 *
 * Exit Codes:
 *   0 - No dangling exits found (orphans are warnings only)
 *   1 - Dangling exits detected
 */

import { createGremlinClient } from '../backend/src/gremlin/gremlinClient.js'
import { loadPersistenceConfigAsync } from '../backend/src/persistenceConfig.js'

const SEED_LOCATION_IDS = new Set(['village-square', 'spawn', 'start', 'entrance'])

async function scanGraphConsistency(seedLocations = []) {
    const config = await loadPersistenceConfigAsync()

    if (config.mode !== 'cosmos' || !config.cosmos) {
        throw new Error('Consistency scanner requires Cosmos persistence mode')
    }

    const client = await createGremlinClient(config.cosmos)

    // Add custom seed locations to the allowed set
    seedLocations.forEach((id) => SEED_LOCATION_IDS.add(id))

    const scannedAt = new Date().toISOString()
    const results = {
        scannedAt,
        summary: {
            totalLocations: 0,
            totalExits: 0,
            danglingExitsCount: 0,
            orphanLocationsCount: 0
        },
        danglingExits: [],
        orphanLocations: []
    }

    try {
        // Fetch all location vertices
        const locations = await client.submit("g.V().hasLabel('location').valueMap(true)")
        results.summary.totalLocations = locations.length

        if (locations.length === 0) {
            // Empty graph is valid
            return results
        }

        // Build location ID set for fast lookup
        const locationIds = new Set(locations.map((loc) => String(loc.id)))

        // Track locations with connections
        const locationsWithConnections = new Set()

        // Fetch all exit edges
        const exits = await client.submit(
            "g.E().hasLabel('exit').project('id','from','to','direction').by(id()).by(outV().id()).by(inV().id()).by(values('direction'))"
        )
        results.summary.totalExits = exits.length

        // Check for dangling exits (pointing to non-existent locations)
        for (const exit of exits) {
            const fromId = String(exit.from)
            const toId = String(exit.to)
            const direction = String(exit.direction)

            // Track connections
            locationsWithConnections.add(fromId)
            locationsWithConnections.add(toId)

            // Check if target location exists
            if (!locationIds.has(toId)) {
                results.danglingExits.push({
                    fromLocationId: fromId,
                    toLocationId: toId,
                    direction: direction,
                    edgeId: String(exit.id)
                })
            }
        }

        results.summary.danglingExitsCount = results.danglingExits.length

        // Check for orphan locations (no connections, not in seed list)
        for (const loc of locations) {
            const locationId = String(loc.id)

            if (!locationsWithConnections.has(locationId) && !SEED_LOCATION_IDS.has(locationId)) {
                results.orphanLocations.push({
                    id: locationId,
                    name: Array.isArray(loc.name) ? loc.name[0] : String(loc.name || 'Unknown'),
                    tags: Array.isArray(loc.tags) ? loc.tags : []
                })
            }
        }

        results.summary.orphanLocationsCount = results.orphanLocations.length
    } catch (error) {
        console.error('Error during graph scan:', error)
        throw error
    }

    return results
}

// CLI entry point
async function main() {
    const args = process.argv.slice(2)
    let outputFile = null
    let seedLocations = []

    // Parse command line arguments
    for (const arg of args) {
        if (arg.startsWith('--output=')) {
            outputFile = arg.substring('--output='.length)
        } else if (arg.startsWith('--seed-locations=')) {
            const locList = arg.substring('--seed-locations='.length)
            seedLocations = locList
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
        }
    }

    try {
        const results = await scanGraphConsistency(seedLocations)

        // Output results as JSON
        const jsonOutput = JSON.stringify(results, null, 2)

        if (outputFile) {
            const fs = await import('fs/promises')
            await fs.writeFile(outputFile, jsonOutput, 'utf8')
            console.log(`✓ Scan results written to ${outputFile}`)
        } else {
            console.log(jsonOutput)
        }

        // Summary to stderr for easy parsing
        console.error(`\nScan Summary:`)
        console.error(`  Total Locations: ${results.summary.totalLocations}`)
        console.error(`  Total Exits: ${results.summary.totalExits}`)
        console.error(`  Dangling Exits: ${results.summary.danglingExitsCount}`)
        console.error(`  Orphan Locations: ${results.summary.orphanLocationsCount}`)

        if (results.summary.danglingExitsCount > 0) {
            console.error(`\n❌ FAIL: Dangling exits detected`)
            process.exit(1)
        } else {
            console.error(`\n✓ PASS: No dangling exits found`)
            process.exit(0)
        }
    } catch (error) {
        console.error('Fatal error:', error.message)
        process.exit(2)
    }
}

// Run if invoked directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
}

// Export for testing
export { scanGraphConsistency }
