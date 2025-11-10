/**
 * Integration Test Fixture - Provides setup for integration tests
 *
 * Features:
 * - Container setup with persistence mode selection
 * - Repository access via DI
 * - Telemetry mocking via DI
 * - Automatic cleanup
 * - Optional performance tracking for regression detection
 */

import type { Container } from 'inversify'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import type { IInventoryRepository } from '../../src/repos/inventoryRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { BaseTestFixture } from './TestFixture.js'
import { getTestContainer } from './testContainer.js'
import type { ContainerMode } from './testInversify.config.js'

export interface PerformanceMetric {
    operationName: string
    durationMs: number
    timestamp: string
}

/**
 * Integration test fixture with container and repository access via DI
 * Optionally tracks performance metrics for regression detection
 */
export class IntegrationTestFixture extends BaseTestFixture {
    protected container?: Container
    protected persistenceMode: ContainerMode
    private performanceMetrics: PerformanceMetric[] = []
    private performanceTrackingEnabled: boolean = false

    constructor(persistenceMode: ContainerMode = 'memory', options?: { trackPerformance?: boolean }) {
        super()
        this.persistenceMode = persistenceMode
        this.performanceTrackingEnabled = options?.trackPerformance || false
    }

    /** Get or create the test container */
    async getContainer(): Promise<Container> {
        if (!this.container) {
            this.container = await getTestContainer(this.persistenceMode)
        }
        return this.container
    }

    /** Get LocationRepository instance from DI container */
    async getLocationRepository(): Promise<ILocationRepository> {
        const container = await this.getContainer()
        return container.get<ILocationRepository>('ILocationRepository')
    }

    /** Get PlayerRepository instance from DI container */
    async getPlayerRepository(): Promise<IPlayerRepository> {
        const container = await this.getContainer()
        return container.get<IPlayerRepository>('IPlayerRepository')
    }

    /** Get DescriptionRepository instance from DI container */
    async getDescriptionRepository(): Promise<IDescriptionRepository> {
        const container = await this.getContainer()
        return container.get<IDescriptionRepository>('IDescriptionRepository')
    }

    /** Get InventoryRepository instance from DI container */
    async getInventoryRepository(): Promise<IInventoryRepository> {
        const container = await this.getContainer()
        return container.get<IInventoryRepository>('IInventoryRepository')
    }

    /**
     * Get the telemetry client from the container
     * In test mode, this returns MockTelemetryClient for assertions
     */
    async getTelemetryClient(): Promise<ITelemetryClient | MockTelemetryClient> {
        const container = await this.getContainer()
        return container.get<ITelemetryClient>('ITelemetryClient')
    }

    /**
     * Track performance metric for an operation (optional)
     * Only records if performance tracking is enabled in constructor
     */
    trackPerformance(operationName: string, durationMs: number): void {
        if (!this.performanceTrackingEnabled) return

        this.performanceMetrics.push({
            operationName,
            durationMs,
            timestamp: new Date().toISOString()
        })
    }

    /**
     * Get all performance metrics for a specific operation
     */
    getPerformanceMetrics(operationName?: string): PerformanceMetric[] {
        if (!this.performanceTrackingEnabled) {
            console.warn('Performance tracking not enabled. Pass { trackPerformance: true } to constructor.')
            return []
        }

        if (operationName) {
            return this.performanceMetrics.filter((m) => m.operationName === operationName)
        }
        return this.performanceMetrics
    }

    /**
     * Calculate p95 latency for an operation
     * Useful for detecting performance regressions in integration tests
     */
    getP95Latency(operationName: string): number | null {
        const metrics = this.getPerformanceMetrics(operationName)
        if (metrics.length === 0) return null

        const sorted = metrics.map((m) => m.durationMs).sort((a, b) => a - b)
        const p95Index = Math.ceil(sorted.length * 0.95) - 1
        return sorted[p95Index]
    }

    /**
     * Get average latency for an operation
     */
    getAverageLatency(operationName: string): number | null {
        const metrics = this.getPerformanceMetrics(operationName)
        if (metrics.length === 0) return null

        const sum = metrics.reduce((acc, m) => acc + m.durationMs, 0)
        return sum / metrics.length
    }

    /** Setup hook - initializes container */
    async setup(): Promise<void> {
        await super.setup()
        // Container will be lazily initialized on first access
    }

    /** Teardown hook - cleans up resources */
    async teardown(): Promise<void> {
        // Clear the telemetry mock if it's a MockTelemetryClient
        const client = this.container?.get<ITelemetryClient>('ITelemetryClient')
        if (client && 'clear' in client) {
            ;(client as MockTelemetryClient).clear()
        }
        this.container = undefined

        // Clear performance metrics
        this.performanceMetrics = []

        await super.teardown()
    }
}
