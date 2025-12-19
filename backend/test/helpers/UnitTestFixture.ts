/**
 * Unit Test Fixture - Provides setup for unit tests with mocked dependencies
 *
 * Features:
 * - Inversify container with mock dependencies
 * - Mock telemetry client via DI
 * - Mock repositories via DI
 * - Mock invocation context
 * - Mock HTTP requests
 * - Automatic cleanup
 */

import type { InvocationContext } from '@azure/functions'
import { Container } from 'inversify'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import type { ILayerRepository } from '../../src/repos/layerRepository.js'
import { DescriptionComposer } from '../../src/services/descriptionComposer.js'
import type { TelemetryService } from '../../src/telemetry/TelemetryService.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { BaseTestFixture, TestMocks, type InvocationContextMockResult } from './TestFixture.js'
import { getTestContainer } from './testContainer.js'

/**
 * Unit test fixture with commonly mocked dependencies injected via Inversify
 */
export class UnitTestFixture extends BaseTestFixture {
    protected invocationContext?: InvocationContextMockResult
    protected container?: Container

    constructor() {
        super()
        // Validate that PERSISTENCE_MODE doesn't interfere with unit tests
        if (process.env.PERSISTENCE_MODE === 'cosmos') {
            console.warn(
                '[UnitTestFixture] Warning: PERSISTENCE_MODE=cosmos is set but unit tests always use mock mode. ' +
                    'Unit tests should be hermetically sealed from infrastructure configuration. ' +
                    'This fixture will ignore PERSISTENCE_MODE and use mock repositories.'
            )
        }
    }

    /**
     * Get or create the test container with 'mock' mode
     * All dependencies are mocked and injectable
     * ALWAYS uses 'mock' mode regardless of PERSISTENCE_MODE environment variable
     */
    async getContainer(): Promise<Container> {
        if (!this.container) {
            // Explicitly pass 'mock' mode to ensure we never use real Cosmos
            // This makes unit tests immune to PERSISTENCE_MODE environment variable
            this.container = await getTestContainer('mock')
        }
        return this.container
    }

    /**
     * Get the mock telemetry client from the container
     * Returns MockTelemetryClient instance for test assertions
     */
    async getTelemetryClient(): Promise<MockTelemetryClient> {
        const container = await this.getContainer()
        return container.get<MockTelemetryClient>('ITelemetryClient')
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
     * Get DescriptionRepository instance from DI container
     * Automatically wires TelemetryService to MockDescriptionRepository
     */
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

    /**
     * Get LayerRepository instance from DI container
     */
    async getLayerRepository(): Promise<ILayerRepository> {
        const container = await this.getContainer()
        return container.get<ILayerRepository>('ILayerRepository')
    }

    /**
     * Get DescriptionComposer instance from DI container
     */
    async getDescriptionComposer(): Promise<DescriptionComposer> {
        const container = await this.getContainer()
        return container.get(DescriptionComposer)
    }

    /**
     * Get WorldClockService instance from DI container
     */
    async getWorldClockService(): Promise<import('../../src/services/types.js').IWorldClockService> {
        const container = await this.getContainer()
        const { WorldClockService } = await import('../../src/services/WorldClockService.js')
        return container.get(WorldClockService)
    }

    /**
     * Get PlayerClockService instance from DI container
     */
    async getPlayerClockService(): Promise<import('../../src/services/types.js').IPlayerClockAPI> {
        const container = await this.getContainer()
        const { PlayerClockService } = await import('../../src/services/PlayerClockService.js')
        return container.get(PlayerClockService)
    }

    /**
     * Get PlayerDocRepository instance from DI container
     */
    async getPlayerDocRepository(): Promise<import('../../src/repos/PlayerDocRepository.js').IPlayerDocRepository> {
        const container = await this.getContainer()
        return container.get<import('../../src/repos/PlayerDocRepository.js').IPlayerDocRepository>('IPlayerDocRepository')
    }

    /**
     * Get LocationClockManager instance from DI container
     */
    async getLocationClockManager(): Promise<import('../../src/services/types.js').ILocationClockManager> {
        const container = await this.getContainer()
        const { LocationClockManager } = await import('../../src/services/LocationClockManager.js')
        return container.get(LocationClockManager)
    }

    /**
     * Get or create a mock invocation context
     */
    getInvocationContext(overrides?: Partial<InvocationContext>): InvocationContextMockResult {
        if (!this.invocationContext) {
            this.invocationContext = TestMocks.createInvocationContext(overrides)
        }
        return this.invocationContext
    }

    /**
     * Create a new invocation context (doesn't cache)
     * Async version with container in extraInputs for dependency injection
     */
    async createInvocationContext(overrides?: Partial<InvocationContext>): Promise<InvocationContextMockResult> {
        const container = await this.getContainer()
        const context = TestMocks.createInvocationContext(overrides)
        context.extraInputs.set('container', container)
        return context
    }

    /**
     * Create an HTTP request mock
     */
    createHttpRequest(
        options: {
            method?: string
            url?: string
            query?: Record<string, string>
            headers?: Record<string, string>
            body?: unknown
        } = {}
    ): unknown {
        return TestMocks.createHttpRequest(options)
    }

    /** Setup hook */
    async setup(): Promise<void> {
        await super.setup()
        // Container will be lazily initialized
    }

    /** Teardown hook - clears all mocks */
    async teardown(): Promise<void> {
        this.invocationContext = undefined
        this.container = undefined
        await super.teardown()
    }
}
