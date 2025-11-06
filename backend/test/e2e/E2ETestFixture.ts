/**
 * E2E Test Fixture - End-to-end testing against real Cosmos DB
 *
 * Purpose:
 * - Provides setup for E2E tests running against actual Cosmos DB (Gremlin + SQL API)
 * - Handles world seeding and cleanup for test isolation
 * - Tracks performance metrics for acceptance criteria validation
 *
 * Architecture:
 * - Uses composition (not inheritance) to wrap IntegrationTestFixture in cosmos mode
 * - Delegates repository/container access to underlying fixture
 * - Adds E2E-specific capabilities: performance tracking, world seeding, cleanup
 *
 * Usage:
 * - Requires GREMLIN_ENDPOINT_TEST (or GREMLIN_ENDPOINT), COSMOS_SQL_ENDPOINT_TEST (or COSMOS_SQL_ENDPOINT)
 * - Uses dedicated test graph (GREMLIN_GRAPH_TEST=world-test) for complete isolation
 * - Partition key automatically routes to 'test' partition (via NODE_ENV=test)
 * - Cleanup is automatic via teardown()
 */

import type { Location } from '@piquet-h/shared'
import type { Container } from 'inversify'
import type { IGremlinClient } from '../../src/gremlin/gremlinClient.js'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import type { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'
import { getE2ETestLocations, seedTestWorld } from '../helpers/seedTestWorld.js'
import type { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { cleanupTestDataByIds } from './cleanupTestData.js'

export interface E2EPerformanceMetrics {
    operationName: string
    durationMs: number
    timestamp: string
}

/**
 * E2E test fixture with Cosmos DB and performance tracking
 * Uses composition to wrap IntegrationTestFixture in cosmos mode
 */
export class E2ETestFixture {
    private baseFixture: IntegrationTestFixture
    private testLocationIds: Set<string> = new Set()
    private testPlayerIds: Set<string> = new Set()
    private performanceMetrics: E2EPerformanceMetrics[] = []
    private worldSeeded: boolean = false
    private demoPlayerId: string | undefined = undefined

    constructor() {
        // Create underlying fixture in cosmos mode
        this.baseFixture = new IntegrationTestFixture('cosmos')
    }

    // Delegate to base fixture
    async getContainer(): Promise<Container> {
        return this.baseFixture.getContainer()
    }

    async getLocationRepository(): Promise<ILocationRepository> {
        return this.baseFixture.getLocationRepository()
    }

    async getPlayerRepository(): Promise<IPlayerRepository> {
        return this.baseFixture.getPlayerRepository()
    }

    async getDescriptionRepository(): Promise<IDescriptionRepository> {
        return this.baseFixture.getDescriptionRepository()
    }

    async getTelemetryClient(): Promise<ITelemetryClient | MockTelemetryClient> {
        return this.baseFixture.getTelemetryClient()
    }

    /**
     * Seed test world with locations and exits
     * Returns the seeded location data for test reference
     */
    async seedTestWorld(blueprint?: Location[]): Promise<{ locations: Location[]; demoPlayerId: string }> {
        const locationRepository = await this.getLocationRepository()
        const playerRepository = await this.getPlayerRepository()

        // Reuse existing demo player ID for idempotency, or generate a new one
        if (!this.demoPlayerId) {
            this.demoPlayerId = this.generateTestPlayerId()
            this.testPlayerIds.add(this.demoPlayerId)
        }

        // Use provided blueprint or default E2E test locations
        const testBlueprint = blueprint || getE2ETestLocations()

        // Track all location IDs for cleanup
        testBlueprint.forEach((loc) => this.testLocationIds.add(loc.id))

        // Seed the world using shared test helper
        const result = await seedTestWorld({
            locationRepository,
            playerRepository,
            blueprint: testBlueprint,
            demoPlayerId: this.demoPlayerId
        })

        this.worldSeeded = true

        return {
            locations: result.locations,
            demoPlayerId: result.demoPlayerId
        }
    }

    /**
     * Track performance metric for acceptance criteria validation
     */
    trackPerformance(operationName: string, durationMs: number): void {
        this.performanceMetrics.push({
            operationName,
            durationMs,
            timestamp: new Date().toISOString()
        })
    }

    /**
     * Get performance metrics for a specific operation
     */
    getPerformanceMetrics(operationName?: string): E2EPerformanceMetrics[] {
        if (operationName) {
            return this.performanceMetrics.filter((m) => m.operationName === operationName)
        }
        return this.performanceMetrics
    }

    /**
     * Calculate p95 latency for an operation
     */
    getP95Latency(operationName: string): number | null {
        const metrics = this.getPerformanceMetrics(operationName)
        if (metrics.length === 0) return null

        const sorted = metrics.map((m) => m.durationMs).sort((a, b) => a - b)
        const p95Index = Math.ceil(sorted.length * 0.95) - 1
        return sorted[p95Index]
    }

    /**
     * Generate a test-specific player ID (UUID v4 format)
     */
    private generateTestPlayerId(): string {
        const hex = () => Math.floor(Math.random() * 16).toString(16)
        return `e2e${hex()}${hex()}${hex()}${hex()}${hex()}-${hex()}${hex()}${hex()}${hex()}-4${hex()}${hex()}${hex()}-8${hex()}${hex()}${hex()}-${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}${hex()}`
    }

    /**
     * Register a player ID for cleanup
     */
    registerTestPlayerId(playerId: string): void {
        this.testPlayerIds.add(playerId)
    }

    /**
     * Cleanup test data from Cosmos DB
     *
     * Uses automated cleanup utility to remove vertices by ID.
     * Logs all cleanup operations for audit trail.
     */
    async cleanupTestData(): Promise<void> {
        if (!this.worldSeeded && this.testLocationIds.size === 0 && this.testPlayerIds.size === 0) {
            // Nothing to clean up
            return
        }

        try {
            // Get Gremlin client from container
            const container = await this.getContainer()
            const gremlinClient = container.get<IGremlinClient>('GremlinClient')

            // Clean up Gremlin vertices
            const stats = await cleanupTestDataByIds(gremlinClient, this.testLocationIds)

            console.log(
                `E2E Cleanup: ${stats.verticesDeleted} vertices deleted` +
                    (stats.errors.length > 0 ? `, ${stats.errors.length} errors` : '')
            )

            // Log player IDs for reference (SQL API cleanup would go here when implemented)
            if (this.testPlayerIds.size > 0) {
                console.log(`E2E Test Players created (${this.testPlayerIds.size}):`, Array.from(this.testPlayerIds))
                // TODO: Add SQL API cleanup when CosmosPlayerRepository.delete() is implemented
            }
        } catch (error) {
            console.error('Error during automated E2E cleanup:', error)
            // Log IDs for manual cleanup if automated cleanup fails
            if (this.testLocationIds.size > 0) {
                console.log(`Manual cleanup required for locations:`, Array.from(this.testLocationIds))
            }
            if (this.testPlayerIds.size > 0) {
                console.log(`Manual cleanup required for players:`, Array.from(this.testPlayerIds))
            }
        }

        // Clear tracking sets
        this.testLocationIds.clear()
        this.testPlayerIds.clear()
        this.worldSeeded = false
    }

    /**
     * Setup hook - initializes container in cosmos mode
     */
    async setup(): Promise<void> {
        // Verify required environment variables
        // Priority: *_TEST vars (test-specific) > COSMOS_* standard vars > legacy GREMLIN_* vars
        const gremlinEndpoint =
            process.env.GREMLIN_ENDPOINT_TEST || process.env.COSMOS_GREMLIN_ENDPOINT || process.env.GREMLIN_ENDPOINT
        const sqlEndpoint = process.env.COSMOS_SQL_ENDPOINT_TEST || process.env.COSMOS_SQL_ENDPOINT

        if (!gremlinEndpoint) {
            throw new Error(
                'E2E tests require GREMLIN_ENDPOINT_TEST (or COSMOS_GREMLIN_ENDPOINT or GREMLIN_ENDPOINT) environment variable'
            )
        }
        if (!sqlEndpoint) {
            throw new Error('E2E tests require COSMOS_SQL_ENDPOINT_TEST (or COSMOS_SQL_ENDPOINT) environment variable')
        }

        // Log endpoint info for debugging (hide actual values for security)
        console.log(`E2E Setup: Gremlin endpoint length=${gremlinEndpoint.length}, SQL endpoint length=${sqlEndpoint.length}`)
        console.log(
            `E2E Setup: Database=${process.env.GREMLIN_DATABASE_TEST || process.env.COSMOS_GREMLIN_DATABASE}, ` +
                `Graph=${process.env.GREMLIN_GRAPH_TEST || process.env.COSMOS_GREMLIN_GRAPH}`
        )

        await this.baseFixture.setup()
    }

    /**
     * Teardown hook - cleans up test data and resources
     */
    async teardown(): Promise<void> {
        try {
            await this.cleanupTestData()
        } catch (error) {
            console.error('Error during E2E test cleanup:', error)
        }

        // Close Gremlin connection to allow tests to exit cleanly
        try {
            const container = await this.getContainer()
            const gremlinClient = container.get<IGremlinClient>('GremlinClient')
            await gremlinClient.close()
        } catch (error) {
            console.warn('Error closing Gremlin client:', error)
        }

        await this.baseFixture.teardown()

        // Clear performance metrics and reset demo player ID
        this.performanceMetrics = []
        this.demoPlayerId = undefined
    }
}
