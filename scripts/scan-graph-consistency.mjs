#!/usr/bin/env node
/**
 * Consistency Scan Script for World Graph
 * 
 * Detects:
 * - Dangling exits: exit edges whose target vertex is missing
 * - Orphan locations: vertices with no inbound and no outbound exits
 * 
 * Usage: node scripts/scan-graph-consistency.mjs [--output=path/to/report.json]
 * 
 * Environment:
 * - PERSISTENCE_MODE=cosmos (required)
 * - COSMOS_GREMLIN_* variables (required for Cosmos connection)
 */

import { createGremlinClient } from '../shared/src/gremlin/gremlinClient.js'
import { loadPersistenceConfigAsync } from '../shared/src/persistenceConfig.js'

async function main() {
    const outputPath = process.argv.find((arg) => arg.startsWith('--output='))?.split('=')[1]

    console.log('[scan-graph-consistency] Starting consistency scan...')

    // Load persistence config
    const config = await loadPersistenceConfigAsync()
    if (config.mode !== 'cosmos' || !config.cosmos) {
        console.error('[scan-graph-consistency] ERROR: PERSISTENCE_MODE must be "cosmos" with valid configuration')
        process.exit(1)
    }

    const client = await createGremlinClient(config.cosmos)

    // Detect dangling exits: exits pointing to non-existent vertices
    console.log('[scan-graph-consistency] Checking for dangling exits...')
    const danglingExits = []
    const allExits = await client.submit(
        "g.E().hasLabel('exit').project('fromId', 'toId', 'direction').by(outV().id()).by(inV().id()).by(values('direction'))"
    )
    
    for (const exit of allExits) {
        const toId = exit.toId
        const vertices = await client.submit('g.V(vid).count()', { vid: toId })
        const count = vertices[0] as number
        if (count === 0) {
            danglingExits.push({
                fromLocationId: String(exit.fromId),
                toLocationId: String(toId),
                direction: String(exit.direction)
            })
        }
    }

    // Detect orphan locations: vertices with no edges (inbound or outbound)
    console.log('[scan-graph-consistency] Checking for orphan locations...')
    const orphanLocations = []
    const allLocations = await client.submit("g.V().hasLabel('location').id()")
    
    for (const locationId of allLocations) {
        const inEdges = await client.submit("g.V(vid).inE().count()", { vid: locationId })
        const outEdges = await client.submit("g.V(vid).outE().count()", { vid: locationId })
        const inCount = inEdges[0] as number
        const outCount = outEdges[0] as number
        
        if (inCount === 0 && outCount === 0) {
            // Get location details
            const locationDetails = await client.submit("g.V(vid).valueMap(true)", { vid: locationId })
            const details = locationDetails[0] || {}
            orphanLocations.push({
                id: String(locationId),
                name: Array.isArray(details.name) ? String(details.name[0]) : String(details.name || 'Unknown'),
                tags: Array.isArray(details.tags) ? details.tags : []
            })
        }
    }

    const report = {
        scannedAt: new Date().toISOString(),
        summary: {
            totalLocations: allLocations.length,
            totalExits: allExits.length,
            danglingExitsCount: danglingExits.length,
            orphanLocationsCount: orphanLocations.length
        },
        danglingExits,
        orphanLocations
    }

    // Output report
    if (outputPath) {
        const fs = await import('fs/promises')
        await fs.writeFile(outputPath, JSON.stringify(report, null, 2))
        console.log(`[scan-graph-consistency] Report written to ${outputPath}`)
    } else {
        console.log('[scan-graph-consistency] Report:')
        console.log(JSON.stringify(report, null, 2))
    }

    console.log('[scan-graph-consistency] Summary:')
    console.log(`  Total locations: ${report.summary.totalLocations}`)
    console.log(`  Total exits: ${report.summary.totalExits}`)
    console.log(`  Dangling exits: ${report.summary.danglingExitsCount}`)
    console.log(`  Orphan locations: ${report.summary.orphanLocationsCount}`)

    if (danglingExits.length > 0 || orphanLocations.length > 0) {
        console.log('[scan-graph-consistency] WARNING: Inconsistencies detected!')
        process.exit(1)
    }

    console.log('[scan-graph-consistency] No inconsistencies detected.')
    process.exit(0)
}

main().catch((error) => {
    console.error('[scan-graph-consistency] FATAL:', error)
    process.exit(2)
})
