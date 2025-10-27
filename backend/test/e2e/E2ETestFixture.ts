/**
 * E2E Test Fixture - End-to-end testing against real Cosmos DB
 *
 * Purpose:
 * - Provides setup for E2E tests running against actual Cosmos DB (Gremlin + SQL API)
 * - Handles world seeding and cleanup for test isolation
 * - Tracks performance metrics for acceptance criteria validation
 *
 * Usage:
 * - Requires COSMOS_GREMLIN_ENDPOINT_TEST, COSMOS_SQL_ENDPOINT_TEST env vars
 * - Uses separate test database (COSMOS_DATABASE_TEST=game-test)
 * - Cleanup is automatic via teardown()
 */

import type { Location } from '@piquet-h/shared'
import type { Container } from 'inversify'
import { seedWorld } from '../../src/seeding/seedWorld.js'
import { IntegrationTestFixture } from '../helpers/IntegrationTestFixture.js'

export interface E2EPerformanceMetrics {
    operationName: string
    durationMs: number
    timestamp: string
}

/**
 * E2E test fixture with Cosmos DB and performance tracking
 */
export class E2ETestFixture extends IntegrationTestFixture {
    private testLocationIds: Set<string> = new Set()
    private testPlayerIds: Set<string> = new Set()
    private performanceMetrics: E2EPerformanceMetrics[] = []
    private worldSeeded: boolean = false

    constructor() {
        // Force cosmos mode for E2E tests
        super('cosmos')
    }

    /**
     * Seed test world with locations and exits
     * Returns the seeded location data for test reference
     */
    async seedTestWorld(blueprint?: Location[]): Promise<{ locations: Location[]; demoPlayerId: string }> {
        const locationRepository = await this.getLocationRepository()
        const playerRepository = await this.getPlayerRepository()

        // Generate test player ID
        const testPlayerId = this.generateTestPlayerId()
        this.testPlayerIds.add(testPlayerId)

        // Use provided blueprint or default to a minimal test set
        const testBlueprint: Location[] = blueprint || this.getDefaultTestLocations()

        // Track all location IDs for cleanup
        testBlueprint.forEach((loc) => this.testLocationIds.add(loc.id))

        // Seed the world
        const result = await seedWorld({
            locationRepository,
            playerRepository,
            blueprint: testBlueprint,
            demoPlayerId: testPlayerId
        })

        this.worldSeeded = true

        return {
            locations: testBlueprint,
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
     * Get default test locations (minimal 5-location graph for E2E)
     */
    private getDefaultTestLocations(): Location[] {
        return [
            {
                id: 'e2e-test-loc-1',
                name: 'E2E Test Hub',
                description: 'Central test location with multiple exits',
                exits: [
                    { direction: 'north', to: 'e2e-test-loc-2', description: 'North passage' },
                    { direction: 'south', to: 'e2e-test-loc-3', description: 'South passage' },
                    { direction: 'east', to: 'e2e-test-loc-4', description: 'East passage' },
                    { direction: 'west', to: 'e2e-test-loc-5', description: 'West passage' }
                ]
            },
            {
                id: 'e2e-test-loc-2',
                name: 'E2E Test North',
                description: 'Northern test location',
                exits: [{ direction: 'south', to: 'e2e-test-loc-1', description: 'Back south' }]
            },
            {
                id: 'e2e-test-loc-3',
                name: 'E2E Test South',
                description: 'Southern test location',
                exits: [{ direction: 'north', to: 'e2e-test-loc-1', description: 'Back north' }]
            },
            {
                id: 'e2e-test-loc-4',
                name: 'E2E Test East',
                description: 'Eastern test location',
                exits: [
                    { direction: 'west', to: 'e2e-test-loc-1', description: 'Back west' },
                    { direction: 'north', to: 'e2e-test-loc-2', description: 'To north room' }
                ]
            },
            {
                id: 'e2e-test-loc-5',
                name: 'E2E Test West',
                description: 'Western test location',
                exits: [{ direction: 'east', to: 'e2e-test-loc-1', description: 'Back east' }]
            }
        ]
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
     * Note: Currently logs test data for manual cleanup. In production E2E setup,
     * consider using a dedicated test database that can be wiped between runs,
     * or implementing repository delete methods for automated cleanup.
     */
    async cleanupTestData(): Promise<void> {
        if (!this.worldSeeded && this.testLocationIds.size === 0 && this.testPlayerIds.size === 0) {
            // Nothing to clean up
            return
        }

        // Log test data IDs for reference (manual cleanup or monitoring)
        if (this.testLocationIds.size > 0) {
            console.log(`E2E Test Locations created (${this.testLocationIds.size}):`, Array.from(this.testLocationIds))
        }
        if (this.testPlayerIds.size > 0) {
            console.log(`E2E Test Players created (${this.testPlayerIds.size}):`, Array.from(this.testPlayerIds))
        }

        // Clear tracking sets
        this.testLocationIds.clear()
        this.testPlayerIds.clear()
        this.worldSeeded = false

        // TODO: Implement automated cleanup when repository delete methods are available
        // For now, recommend using separate test database (COSMOS_DATABASE_TEST=game-test)
        // that can be wiped between test runs
    }

    /**
     * Setup hook - initializes container in cosmos mode
     */
    async setup(): Promise<void> {
        // Verify required environment variables
        if (!process.env.COSMOS_GREMLIN_ENDPOINT_TEST && !process.env.COSMOS_GREMLIN_ENDPOINT) {
            throw new Error('E2E tests require COSMOS_GREMLIN_ENDPOINT_TEST or COSMOS_GREMLIN_ENDPOINT environment variable')
        }
        if (!process.env.COSMOS_SQL_ENDPOINT_TEST && !process.env.COSMOS_SQL_ENDPOINT) {
            throw new Error('E2E tests require COSMOS_SQL_ENDPOINT_TEST or COSMOS_SQL_ENDPOINT environment variable')
        }

        await super.setup()
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

        await super.teardown()

        // Clear performance metrics
        this.performanceMetrics = []
    }
}
