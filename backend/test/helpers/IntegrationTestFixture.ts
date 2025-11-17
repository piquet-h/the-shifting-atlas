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

import type { InvocationContext } from '@azure/functions'
import type { Container } from 'inversify'
import type { IGremlinClient } from '../../src/gremlin/gremlinClient.js'
import type { IPlayerDocRepository } from '../../src/repos/PlayerDocRepository.js'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import type { IInventoryRepository } from '../../src/repos/inventoryRepository.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import type { IWorldEventRepository } from '../../src/repos/worldEventRepository.js'
import { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import type { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { BaseTestFixture, type InvocationContextMockResult } from './TestFixture.js'
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

    /** Get PlayerDocRepository instance from DI container */
    async getPlayerDocRepository(): Promise<IPlayerDocRepository> {
        const container = await this.getContainer()
        return container.get<IPlayerDocRepository>('IPlayerDocRepository')
    }

    /** Get DescriptionRepository instance from DI container */
    async getDescriptionRepository(): Promise<IDescriptionRepository> {
        const container = await this.getContainer()
        const repo = container.get<IDescriptionRepository>('IDescriptionRepository')

        // Wire telemetry service to mock if it's a MockDescriptionRepository
        if ('setTelemetryService' in repo) {
            const telemetryService = await this.getTelemetryService()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(repo as any).setTelemetryService(telemetryService)
        }

        return repo
    }

    /** Get InventoryRepository instance from DI container */
    async getInventoryRepository(): Promise<IInventoryRepository> {
        const container = await this.getContainer()
        return container.get<IInventoryRepository>('IInventoryRepository')
    }

    /** Get LayerRepository instance from DI container */
    async getLayerRepository(): Promise<ILayerRepository> {
        const container = await this.getContainer()
        return container.get<ILayerRepository>('ILayerRepository')
    }

    /** Get WorldEventRepository instance from DI container */
    async getWorldEventRepository(): Promise<IWorldEventRepository> {
        const container = await this.getContainer()
        return container.get<IWorldEventRepository>('IWorldEventRepository')
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
     * Get TelemetryService instance from DI container
     * Returns TelemetryService for injecting into mocks
     */
    async getTelemetryService(): Promise<TelemetryService> {
        const container = await this.getContainer()
        const { TelemetryService: TelemetryServiceClass } = await import('../../src/telemetry/TelemetryService.js')
        return container.get(TelemetryServiceClass)
    }

    /**
     * Create a mock invocation context with container in extraInputs
     * Required for handler testing with dependency injection
     */
    async createInvocationContext(overrides?: Partial<InvocationContext>): Promise<InvocationContextMockResult> {
        const container = await this.getContainer()
        const { TestMocks } = await import('./TestFixture.js')
        const context = TestMocks.createInvocationContext(overrides)
        context.extraInputs.set('container', container)
        return context
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
        // Close Gremlin connection if in cosmos mode to prevent WebSocket hang
        if (this.container && this.persistenceMode === 'cosmos') {
            try {
                const gremlinClient = this.container.get<IGremlinClient>('GremlinClient')
                if (gremlinClient && typeof gremlinClient.close === 'function') {
                    await gremlinClient.close()
                }
            } catch (error) {
                // GremlinClient might not be bound in all test scenarios
                console.warn('Error closing Gremlin client during teardown:', error)
            }
        }

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
