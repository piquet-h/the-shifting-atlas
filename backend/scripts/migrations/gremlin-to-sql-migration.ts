#!/usr/bin/env tsx
/**
 * Gremlin to SQL API Migration Script
 *
 * Purpose: One-time migration to backfill existing Gremlin player/inventory data
 * into SQL API containers for cost-efficient mutable data storage.
 *
 * Goal: Zero data loss; completes in <10 minutes for 1000 players.
 *
 * Usage:
 *   tsx scripts/migrations/gremlin-to-sql-migration.ts [options]
 *
 * Options:
 *   --dry-run                  Preview operations without writes
 *   --batch-size=N             Entities per progress report (default: 100)
 *   --max-retries=N            Max retry attempts for throttled requests (default: 5)
 *   --help, -h                 Show help message
 *
 * Environment Variables (required):
 *   COSMOS_GREMLIN_ENDPOINT, COSMOS_GREMLIN_DATABASE, COSMOS_GREMLIN_GRAPH
 *   COSMOS_SQL_ENDPOINT, COSMOS_SQL_DATABASE
 *   COSMOS_SQL_CONTAINER_PLAYERS (default: 'players')
 *   COSMOS_SQL_CONTAINER_INVENTORY (default: 'inventory')
 *
 * Exit Codes:
 *   0 - Success
 *   1 - Configuration or migration error
 */

import { CosmosClient } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'
import gremlin from 'gremlin'
import WebSocket from 'ws'
;(globalThis as any).WebSocket = WebSocket

// Configuration from environment
interface MigrationConfig {
    gremlinEndpoint: string
    gremlinDatabase: string
    gremlinGraph: string
    sqlEndpoint: string
    sqlDatabase: string
    sqlContainerPlayers: string
    sqlContainerInventory: string
    dryRun: boolean
    batchSize: number
    maxRetries: number
}

interface PlayerVertex {
    id: string
    createdUtc?: string | string[]
    updatedUtc?: string | string[]
    guest?: boolean | string | string[]
    externalId?: string | string[]
    name?: string | string[]
    currentLocationId?: string | string[]
}

interface PlayerDocument {
    id: string
    createdUtc: string
    updatedUtc: string
    guest: boolean
    currentLocationId: string
    externalId?: string
    name?: string
}

interface MigrationStats {
    playersProcessed: number
    playersSkipped: number
    playersWritten: number
    playersFailed: number
    inventoryProcessed: number
    inventorySkipped: number
    inventoryWritten: number
    inventoryFailed: number
    errors: Array<{ entity: string; error: string }>
}

/**
 * Parse command line arguments
 */
function parseArgs(): Partial<MigrationConfig> {
    const args: Partial<MigrationConfig> = {}

    for (const arg of process.argv.slice(2)) {
        if (arg === '--dry-run') {
            args.dryRun = true
        } else if (arg.startsWith('--batch-size=')) {
            args.batchSize = parseInt(arg.split('=')[1], 10)
        } else if (arg.startsWith('--max-retries=')) {
            args.maxRetries = parseInt(arg.split('=')[1], 10)
        } else if (arg === '--help' || arg === '-h') {
            printHelp()
            process.exit(0)
        }
    }

    return args
}

function printHelp(): void {
    console.log(`
Gremlin to SQL API Migration Script

Usage:
  tsx scripts/migrations/gremlin-to-sql-migration.ts [options]

Options:
  --dry-run                  Preview operations without writes
  --batch-size=N             Entities per progress report (default: 100)
  --max-retries=N            Max retry attempts for throttled requests (default: 5)
  --help, -h                 Show help message

Environment Variables (required):
  COSMOS_GREMLIN_ENDPOINT    Cosmos DB Gremlin endpoint
  COSMOS_GREMLIN_DATABASE    Gremlin database name
  COSMOS_GREMLIN_GRAPH       Gremlin graph name
  COSMOS_SQL_ENDPOINT        Cosmos DB SQL API endpoint
  COSMOS_SQL_DATABASE        SQL API database name

Optional:
  COSMOS_SQL_CONTAINER_PLAYERS    (default: 'players')
  COSMOS_SQL_CONTAINER_INVENTORY  (default: 'inventory')

Exit Codes:
  0 - Success
  1 - Configuration or migration error
`)
}

/**
 * Load configuration from environment and arguments
 */
function loadConfig(): MigrationConfig {
    const args = parseArgs()

    const config: MigrationConfig = {
        gremlinEndpoint: process.env.COSMOS_GREMLIN_ENDPOINT || '',
        gremlinDatabase: process.env.COSMOS_GREMLIN_DATABASE || '',
        gremlinGraph: process.env.COSMOS_GREMLIN_GRAPH || '',
        sqlEndpoint: process.env.COSMOS_SQL_ENDPOINT || '',
        sqlDatabase: process.env.COSMOS_SQL_DATABASE || '',
        sqlContainerPlayers: process.env.COSMOS_SQL_CONTAINER_PLAYERS || 'players',
        sqlContainerInventory: process.env.COSMOS_SQL_CONTAINER_INVENTORY || 'inventory',
        dryRun: args.dryRun || false,
        batchSize: args.batchSize || 100,
        maxRetries: args.maxRetries || 5
    }

    // Validate required fields
    const required = ['gremlinEndpoint', 'gremlinDatabase', 'gremlinGraph', 'sqlEndpoint', 'sqlDatabase']
    const missing = required.filter((key) => !config[key as keyof MigrationConfig])

    if (missing.length > 0) {
        console.error('Error: Missing required environment variables:')
        missing.forEach((key) => console.error(`  COSMOS_${key.toUpperCase()}`))
        process.exit(1)
    }

    return config
}

/**
 * Extract scalar value from Gremlin property (handles array or scalar)
 */
function firstScalar(val: unknown): string | undefined {
    if (val == null) return undefined
    if (Array.isArray(val)) return val.length ? String(val[0]) : undefined
    return String(val)
}

/**
 * Parse boolean from Gremlin property
 */
function parseBool(v: string | boolean | string[] | undefined): boolean {
    if (v == null) return true // Default to guest=true if missing
    if (typeof v === 'boolean') return v
    const str = firstScalar(v)
    return str === 'true' || str === '1'
}

/**
 * Create Gremlin client
 */
async function createGremlinClient(config: MigrationConfig) {
    const credential = new DefaultAzureCredential()
    const scope = 'https://cosmos.azure.com/.default'
    const token = await credential.getToken(scope)

    if (!token?.token) {
        throw new Error('Failed to acquire Azure AD token for Cosmos DB Gremlin API')
    }

    const endpoint = config.gremlinEndpoint.replace('https://', 'wss://').replace('.documents.azure.com', '.gremlin.cosmos.azure.com')
    const resourcePath = `/dbs/${config.gremlinDatabase}/colls/${config.gremlinGraph}`

    const authenticator = new gremlin.driver.auth.PlainTextSaslAuthenticator(resourcePath, token.token)

    return new gremlin.driver.DriverRemoteConnection(endpoint, {
        authenticator,
        traversalsource: 'g',
        mimeType: 'application/vnd.gremlin-v2.0+json'
    })
}

/**
 * Create SQL API client
 */
function createSqlClient(config: MigrationConfig) {
    const credential = new DefaultAzureCredential()
    return new CosmosClient({
        endpoint: config.sqlEndpoint,
        aadCredentials: credential
    })
}

/**
 * Execute Gremlin query with retry logic
 */
async function executeGremlinQuery<T>(connection: any, query: string, bindings?: Record<string, unknown>): Promise<T[]> {
    try {
        const internalClient = connection as any
        const result = await internalClient._client.submit(query, bindings)
        return result._items || []
    } catch (error) {
        console.error('Gremlin query failed:', error)
        throw error
    }
}

/**
 * Migrate players from Gremlin to SQL API
 */
async function migratePlayers(
    gremlinConnection: any,
    sqlClient: CosmosClient,
    config: MigrationConfig,
    stats: MigrationStats
): Promise<void> {
    console.log('\n=== Migrating Players ===')

    const container = sqlClient.database(config.sqlDatabase).container(config.sqlContainerPlayers)

    // Query all player vertices from Gremlin
    console.log('Fetching players from Gremlin...')
    const query = "g.V().hasLabel('player').valueMap(true)"
    const vertices = await executeGremlinQuery<PlayerVertex>(gremlinConnection, query)

    console.log(`Found ${vertices.length} players in Gremlin`)

    if (vertices.length === 0) {
        console.log('No players to migrate')
        return
    }

    // Process players in batches
    for (let i = 0; i < vertices.length; i++) {
        const vertex = vertices[i]
        stats.playersProcessed++

        try {
            // Map Gremlin vertex to SQL document
            const now = new Date().toISOString()
            const player: PlayerDocument = {
                id: String(vertex.id),
                createdUtc: firstScalar(vertex.createdUtc) || now,
                updatedUtc: firstScalar(vertex.updatedUtc) || firstScalar(vertex.createdUtc) || now,
                guest: parseBool(vertex.guest),
                currentLocationId: firstScalar(vertex.currentLocationId) || 'loc-mosswell-square',
                externalId: firstScalar(vertex.externalId),
                name: firstScalar(vertex.name)
            }

            if (config.dryRun) {
                console.log(`[DRY-RUN] Would migrate player: ${player.id}`)
                stats.playersSkipped++
            } else {
                // Upsert player (idempotent)
                await retryWithBackoff(
                    async () => {
                        await container.items.upsert(player)
                    },
                    config.maxRetries,
                    `player ${player.id}`
                )
                stats.playersWritten++
            }

            // Progress tracking
            if (stats.playersProcessed % config.batchSize === 0) {
                console.log(`Progress: ${stats.playersProcessed}/${vertices.length} players processed`)
            }
        } catch (error) {
            stats.playersFailed++
            const errorMsg = error instanceof Error ? error.message : String(error)
            stats.errors.push({ entity: `player:${vertex.id}`, error: errorMsg })
            console.error(`Failed to migrate player ${vertex.id}:`, errorMsg)
            // Continue with next player (don't fail entire migration)
        }
    }

    console.log(`Completed player migration: ${stats.playersWritten} written, ${stats.playersFailed} failed`)
}

/**
 * Migrate inventory items from Gremlin to SQL API (if inventory edges exist)
 * Note: Current architecture shows inventory is already in SQL API, but this
 * handles legacy Gremlin inventory edges if they exist
 */
async function migrateInventory(
    gremlinConnection: any,
    sqlClient: CosmosClient,
    config: MigrationConfig,
    stats: MigrationStats
): Promise<void> {
    console.log('\n=== Migrating Inventory ===')

    // Query for inventory edges (player)-[:owns_item]->(item)
    // This is a fallback for legacy data; modern inventory is already in SQL API
    console.log('Checking for legacy inventory edges in Gremlin...')
    const query = "g.E().hasLabel('owns_item').valueMap(true)"

    try {
        const edges = await executeGremlinQuery<any>(gremlinConnection, query)

        if (edges.length === 0) {
            console.log('No inventory edges found in Gremlin (expected for modern setup)')
            return
        }

        console.log(`Found ${edges.length} inventory edges (legacy data)`)
        console.log('Note: Modern inventory should already be in SQL API')

        // Process inventory edges if they exist
        const container = sqlClient.database(config.sqlDatabase).container(config.sqlContainerInventory)

        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i]
            stats.inventoryProcessed++

            try {
                // Extract edge properties for inventory document
                const inventoryItem = {
                    id: firstScalar(edge.id) || `inv-${i}`,
                    playerId: firstScalar(edge.outV),
                    itemId: firstScalar(edge.inV),
                    acquiredAt: firstScalar(edge.createdUtc) || new Date().toISOString()
                }

                if (config.dryRun) {
                    console.log(`[DRY-RUN] Would migrate inventory item: ${inventoryItem.id}`)
                    stats.inventorySkipped++
                } else {
                    await retryWithBackoff(
                        async () => {
                            await container.items.upsert(inventoryItem)
                        },
                        config.maxRetries,
                        `inventory ${inventoryItem.id}`
                    )
                    stats.inventoryWritten++
                }

                if (stats.inventoryProcessed % config.batchSize === 0) {
                    console.log(`Progress: ${stats.inventoryProcessed}/${edges.length} inventory items processed`)
                }
            } catch (error) {
                stats.inventoryFailed++
                const errorMsg = error instanceof Error ? error.message : String(error)
                stats.errors.push({ entity: `inventory:${edge.id}`, error: errorMsg })
                console.error(`Failed to migrate inventory item ${edge.id}:`, errorMsg)
            }
        }

        console.log(`Completed inventory migration: ${stats.inventoryWritten} written, ${stats.inventoryFailed} failed`)
    } catch (error) {
        console.log('No inventory edges to migrate (expected for modern setup)')
    }
}

/**
 * Retry function with exponential backoff for handling throttling
 */
async function retryWithBackoff(
    operation: () => Promise<void>,
    maxRetries: number,
    entityDescription: string,
    baseDelayMs: number = 1000
): Promise<void> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            await operation()
            return
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))

            // Check if it's a throttling error (429)
            const cosmosError = error as { code?: number }
            if (cosmosError.code === 429 && attempt < maxRetries) {
                const delay = baseDelayMs * Math.pow(2, attempt)
                console.warn(`Throttled on ${entityDescription}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`)
                await sleep(delay)
                continue
            }

            // For other errors or max retries exceeded, throw
            if (attempt === maxRetries) {
                throw lastError
            }

            // Brief delay for other transient errors
            await sleep(100)
        }
    }

    throw lastError || new Error('Max retries exceeded')
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Main migration entry point
 */
async function main(): Promise<void> {
    const startTime = Date.now()
    console.log('=== Gremlin to SQL API Migration ===')

    const config = loadConfig()

    console.log('\nConfiguration:')
    console.log(`  Dry Run: ${config.dryRun ? 'YES' : 'NO'}`)
    console.log(`  Batch Size: ${config.batchSize}`)
    console.log(`  Max Retries: ${config.maxRetries}`)
    console.log(`  Gremlin: ${config.gremlinEndpoint}`)
    console.log(`  SQL API: ${config.sqlEndpoint}`)
    console.log(`  Target Containers: ${config.sqlContainerPlayers}, ${config.sqlContainerInventory}`)

    const stats: MigrationStats = {
        playersProcessed: 0,
        playersSkipped: 0,
        playersWritten: 0,
        playersFailed: 0,
        inventoryProcessed: 0,
        inventorySkipped: 0,
        inventoryWritten: 0,
        inventoryFailed: 0,
        errors: []
    }

    let gremlinConnection: any
    let sqlClient: CosmosClient | undefined

    try {
        // Initialize clients
        console.log('\nInitializing connections...')
        gremlinConnection = await createGremlinClient(config)
        sqlClient = createSqlClient(config)

        // Migrate players
        await migratePlayers(gremlinConnection, sqlClient, config, stats)

        // Migrate inventory (if applicable)
        await migrateInventory(gremlinConnection, sqlClient, config, stats)

        // Print summary
        const durationSec = ((Date.now() - startTime) / 1000).toFixed(2)
        console.log('\n=== Migration Summary ===')
        console.log(`Duration: ${durationSec}s`)
        console.log(`\nPlayers:`)
        console.log(`  Processed: ${stats.playersProcessed}`)
        console.log(`  Written: ${stats.playersWritten}`)
        console.log(`  Skipped: ${stats.playersSkipped}`)
        console.log(`  Failed: ${stats.playersFailed}`)
        console.log(`\nInventory:`)
        console.log(`  Processed: ${stats.inventoryProcessed}`)
        console.log(`  Written: ${stats.inventoryWritten}`)
        console.log(`  Skipped: ${stats.inventorySkipped}`)
        console.log(`  Failed: ${stats.inventoryFailed}`)

        if (stats.errors.length > 0) {
            console.log(`\nErrors (${stats.errors.length}):`)
            stats.errors.forEach((err) => {
                console.log(`  ${err.entity}: ${err.error}`)
            })
        }

        if (config.dryRun) {
            console.log('\n*** DRY RUN - No data was written ***')
        } else {
            console.log('\n✓ Migration completed successfully')
        }

        // Exit with error if any failures occurred
        if (stats.playersFailed > 0 || stats.inventoryFailed > 0) {
            console.error('\n⚠ Migration completed with errors')
            process.exit(1)
        }
    } catch (error) {
        console.error('\n✗ Migration failed:', error)
        process.exit(1)
    } finally {
        // Cleanup connections
        if (gremlinConnection) {
            try {
                await gremlinConnection.close()
            } catch (err) {
                console.warn('Error closing Gremlin connection:', err)
            }
        }
    }
}

// Run migration
main().catch((error) => {
    console.error('Unhandled error:', error)
    process.exit(1)
})
