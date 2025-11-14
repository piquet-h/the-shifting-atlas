/**
 * E2E Test Data Cleanup Utility
 *
 * Purpose:
 * - Provides automated cleanup of test data from real Cosmos DB (Gremlin + SQL API)
 * - Removes vertices/edges from Gremlin graph by ID prefix
 * - Removes documents from SQL containers by ID prefix
 *
 * Usage:
 * - Called automatically during E2ETestFixture.teardown()
 * - Can also be run manually for orphaned test data cleanup
 *
 * Safety:
 * - Only deletes entities with IDs matching test prefix pattern
 * - Logs all deletions for audit trail
 * - Non-blocking errors (logs but doesn't throw)
 */

import type { IGremlinClient } from '../../src/gremlin/gremlinClient.js'

export interface CleanupStats {
    verticesDeleted: number
    edgesDeleted: number
    errors: string[]
}

/**
 * Delete all Gremlin vertices and edges matching the given ID prefix
 *
 * @param gremlinClient - Gremlin client instance
 * @param idPrefix - ID prefix to match (e.g., 'e2e-test-loc', 'test-loc')
 * @returns Statistics about deleted entities
 */
export async function cleanupGremlinTestData(gremlinClient: IGremlinClient, idPrefix: string): Promise<CleanupStats> {
    const stats: CleanupStats = {
        verticesDeleted: 0,
        edgesDeleted: 0,
        errors: []
    }

    try {
        // Find all vertices with IDs starting with the prefix
        const vertices = await gremlinClient.submit<{ id: string }>(`g.V().has('id', containing('${idPrefix}')).project('id').by(id())`)

        console.log(`Found ${vertices.length} vertices matching prefix '${idPrefix}'`)

        // Delete each vertex (and its edges) individually to avoid transaction limits
        for (const vertex of vertices) {
            try {
                // Drop the vertex (Gremlin automatically removes connected edges)
                await gremlinClient.submit(`g.V(vid).drop()`, { vid: vertex.id })
                stats.verticesDeleted++
            } catch (error) {
                const errorMsg = `Failed to delete vertex ${vertex.id}: ${error instanceof Error ? error.message : String(error)}`
                console.error(errorMsg)
                stats.errors.push(errorMsg)
            }
        }

        console.log(`✓ Deleted ${stats.verticesDeleted} test vertices (prefix: ${idPrefix})`)
    } catch (error) {
        const errorMsg = `Error during Gremlin cleanup: ${error instanceof Error ? error.message : String(error)}`
        console.error(errorMsg)
        stats.errors.push(errorMsg)
    }

    return stats
}

/**
 * Retry a cleanup operation with exponential backoff
 * @param operation - The async operation to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelayMs - Initial delay between retries in ms (default: 1000)
 * @returns Result of the operation
 */
async function retryWithBackoff<T>(operation: () => Promise<T>, maxRetries: number = 3, initialDelayMs: number = 1000): Promise<T> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation()
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))

            if (attempt < maxRetries) {
                const delay = initialDelayMs * Math.pow(2, attempt)
                console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`)
                await new Promise((resolve) => setTimeout(resolve, delay))
            }
        }
    }

    throw lastError
}

/**
 * Clean up test data by ID sets
 *
 * This is the primary cleanup method used by E2ETestFixture.
 * Accepts explicit ID sets for vertices and documents to avoid prefix-matching errors.
 * Includes retry logic with exponential backoff for transient failures.
 *
 * @param gremlinClient - Gremlin client instance
 * @param locationIds - Set of location vertex IDs to delete
 * @param maxRetries - Maximum retry attempts per delete operation (default: 3)
 * @returns Cleanup statistics
 */
export async function cleanupTestDataByIds(
    gremlinClient: IGremlinClient,
    locationIds: Set<string>,
    maxRetries: number = 3
): Promise<CleanupStats> {
    const stats: CleanupStats = {
        verticesDeleted: 0,
        edgesDeleted: 0,
        errors: []
    }

    // Clean up Gremlin vertices
    if (locationIds.size > 0) {
        console.log(`Cleaning up ${locationIds.size} test location vertices...`)

        for (const locationId of locationIds) {
            try {
                await retryWithBackoff(
                    async () => {
                        await gremlinClient.submit(`g.V(vid).drop()`, { vid: locationId })
                    },
                    maxRetries,
                    1000
                )
                stats.verticesDeleted++

                // Small delay between deletions to avoid overwhelming Cosmos DB
                await new Promise((resolve) => setTimeout(resolve, 100))
            } catch (error) {
                const errorMsg = `Failed to delete location vertex ${locationId} after ${maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`
                console.error(errorMsg)
                stats.errors.push(errorMsg)
            }
        }
        console.log(`✓ Deleted ${stats.verticesDeleted} location vertices`)
    }

    return stats
}

/**
 * Verify cleanup was successful by checking for remaining test entities
 *
 * @param gremlinClient - Gremlin client instance
 * @param idPrefix - ID prefix to check (e.g., 'e2e-')
 * @returns True if no test entities remain, false otherwise
 */
export async function verifyCleanup(gremlinClient: IGremlinClient, idPrefix: string): Promise<boolean> {
    try {
        const remaining = await gremlinClient.submit<{ id: string }>(`g.V().has('id', containing('${idPrefix}')).project('id').by(id())`)

        if (remaining.length > 0) {
            console.warn(`⚠️ Cleanup verification failed: ${remaining.length} vertices still exist with prefix '${idPrefix}'`)
            console.warn(
                'Remaining IDs:',
                remaining.map((v) => v.id)
            )
            return false
        }

        console.log(`✓ Cleanup verification passed: no entities with prefix '${idPrefix}'`)
        return true
    } catch (error) {
        console.error(`Cleanup verification error: ${error instanceof Error ? error.message : String(error)}`)
        return false
    }
}
