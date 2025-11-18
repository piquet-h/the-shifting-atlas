#!/usr/bin/env node
/**
 * Player Migration Script - Gremlin to SQL API
 * 
 * Proactively migrates all player vertices from Gremlin to SQL API.
 * Works with current SQL-only architecture using read-only Gremlin access.
 * 
 * Usage:
 *   node scripts/migrations/migrate-players-to-sql.mjs [--dry-run]
 * 
 * Environment Variables Required:
 *   COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH
 *   COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE, COSMOS_SQL_CONTAINER_PLAYERS
 *   
 * Optional: Set Azure credentials via DefaultAzureCredential or COSMOS_KEY
 */

import { CosmosClient } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'
import gremlin from 'gremlin'
import * as process from 'node:process'

const authenticator = gremlin.driver.auth.PlainTextSaslAuthenticator
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection
const traversal = gremlin.process.AnonymousTraversalSource.traversal

// Parse args
const isDryRun = process.argv.includes('--dry-run')

// Load config from environment
const config = {
    gremlinEndpoint: process.env.COSMOS_GREMLIN_ENDPOINT?.replace('https://', '').replace(':443/', '').replace(':443', ''),
    gremlinDatabase: process.env.COSMOS_GREMLIN_DATABASE,
    gremlinGraph: process.env.COSMOS_GREMLIN_GRAPH,
    sqlEndpoint: process.env.COSMOS_SQL_ENDPOINT,
    sqlDatabase: process.env.COSMOS_SQL_DATABASE,
    sqlContainerPlayers: process.env.COSMOS_SQL_CONTAINER_PLAYERS || 'players',
}

// Validate config
if (!config.gremlinEndpoint || !config.gremlinDatabase || !config.gremlinGraph) {
    console.error('❌ Missing Gremlin configuration')
    console.error('Required: COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH')
    process.exit(1)
}

if (!config.sqlEndpoint || !config.sqlDatabase) {
    console.error('❌ Missing SQL API configuration')
    console.error('Required: COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE')
    process.exit(1)
}

console.log('\n🔄 Player Migration - Gremlin to SQL API\n')
console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (no writes)' : '✍️  LIVE MIGRATION'}`)
console.log(`Source: ${config.gremlinEndpoint}/${config.gremlinDatabase}/${config.gremlinGraph}`)
console.log(`Target: ${config.sqlEndpoint}/${config.sqlDatabase}/${config.sqlContainerPlayers}\n`)

// Initialize Gremlin client
let gremlinConnection
let g
try {
    const gremlinKey = process.env.COSMOS_GREMLIN_KEY
    if (!gremlinKey) {
        throw new Error('COSMOS_GREMLIN_KEY environment variable not set. Run: source scripts/get-cosmos-keys.sh')
    }

    const username = `/dbs/${config.gremlinDatabase}/colls/${config.gremlinGraph}`
    gremlinConnection = new DriverRemoteConnection(
        `wss://${config.gremlinEndpoint}:443/gremlin`,
        {
            authenticator: new authenticator(username, gremlinKey),
            traversalsource: 'g',
            rejectUnauthorized: true,
            mimeType: 'application/vnd.gremlin-v2.0+json',
        }
    )
    g = traversal().withRemote(gremlinConnection)
    console.log('✅ Connected to Gremlin API\n')
} catch (error) {
    console.error('❌ Failed to connect to Gremlin:', error.message)
    process.exit(1)
}

// Initialize SQL API client
let sqlClient
let container
try {
    // Use COSMOS_SQL_KEY if available, otherwise DefaultAzureCredential
    const cosmosKey = process.env.COSMOS_SQL_KEY || process.env.COSMOS_KEY
    if (cosmosKey) {
        sqlClient = new CosmosClient({ endpoint: config.sqlEndpoint, key: cosmosKey })
    } else {
        const credential = new DefaultAzureCredential()
        sqlClient = new CosmosClient({ endpoint: config.sqlEndpoint, aadCredentials: credential })
    }
    container = sqlClient.database(config.sqlDatabase).container(config.sqlContainerPlayers)
    console.log('✅ Connected to SQL API\n')
} catch (error) {
    console.error('❌ Failed to connect to SQL API:', error.message)
    await gremlinConnection?.close()
    process.exit(1)
}

// Helper: Extract scalar from Gremlin property
function firstScalar(value) {
    if (Array.isArray(value) && value.length > 0) {
        return value[0]
    }
    return value || undefined
}

// Helper: Parse boolean from Gremlin
function parseBool(value) {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') return value.toLowerCase() === 'true'
    if (Array.isArray(value)) return parseBool(value[0])
    return false
}

// Migration stats
const stats = {
    playersFound: 0,
    playersAlreadyInSql: 0,
    playersMigrated: 0,
    playersFailed: 0,
    errors: []
}

try {
    console.log('📊 Querying players from Gremlin...\n')

    // Query all player vertices
    const players = await g.V().hasLabel('player').valueMap(true).toList()
    stats.playersFound = players.length

    console.log(`Found ${stats.playersFound} players in Gremlin\n`)

    if (stats.playersFound === 0) {
        console.log('✅ No players to migrate')
        await gremlinConnection.close()
        process.exit(0)
    }

    console.log('🔄 Processing players...\n')

    // Process each player
    for (const vertex of players) {
        const playerId = String(vertex.get('id'))

        try {
            // Check if player already exists in SQL
            try {
                const { resource: existing } = await container.item(playerId, playerId).read()

                if (existing) {
                    stats.playersAlreadyInSql++
                    console.log(`⏭️  Player ${playerId} already in SQL API (skipping)`)
                    continue
                }
            } catch (error) {
                // 404 is expected if player doesn't exist yet
                if (error.code !== 404) {
                    throw error
                }
            }

            // Map Gremlin vertex to SQL document
            const now = new Date().toISOString()
            const playerDoc = {
                id: playerId,
                createdUtc: firstScalar(vertex.get('createdUtc')) || now,
                updatedUtc: firstScalar(vertex.get('updatedUtc')) || firstScalar(vertex.get('createdUtc')) || now,
                guest: parseBool(firstScalar(vertex.get('guest'))),
                currentLocationId: firstScalar(vertex.get('currentLocationId')) || 'loc-mosswell-square',
                externalId: firstScalar(vertex.get('externalId')),
                name: firstScalar(vertex.get('name')),
            }

            if (isDryRun) {
                console.log(`🔍 [DRY RUN] Would migrate player ${playerId}:`, JSON.stringify(playerDoc, null, 2))
                stats.playersMigrated++
            } else {
                // Upsert to SQL API (idempotent)
                await container.items.upsert(playerDoc)
                stats.playersMigrated++
                console.log(`✅ Migrated player ${playerId}`)
            }
        } catch (error) {
            stats.playersFailed++
            const errorMsg = error.message || String(error)
            stats.errors.push({ playerId, error: errorMsg })
            console.error(`❌ Failed to migrate player ${playerId}:`, errorMsg)
        }
    }

    console.log('\n' + '='.repeat(60))
    console.log('📈 Migration Summary')
    console.log('='.repeat(60))
    console.log(`Players found in Gremlin:     ${stats.playersFound}`)
    console.log(`Already in SQL API:           ${stats.playersAlreadyInSql}`)
    console.log(`Migrated:                     ${stats.playersMigrated}`)
    console.log(`Failed:                       ${stats.playersFailed}`)

    if (stats.errors.length > 0) {
        console.log('\n❌ Errors:')
        stats.errors.forEach(({ playerId, error }) => {
            console.log(`  - ${playerId}: ${error}`)
        })
    }

    console.log('\n' + (stats.playersFailed === 0 ? '✅ Migration completed successfully!' : '⚠️  Migration completed with errors'))

} catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    console.error(error.stack)
    process.exit(1)
} finally {
    await gremlinConnection?.close()
}
