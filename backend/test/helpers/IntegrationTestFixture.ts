/**
 * Integration Test Fixture - Provides setup for integration tests
 *
 * Features:
 * - Container setup with persistence mode selection
 * - Repository access
 * - Telemetry mocking
 * - Automatic cleanup
 */

import type { Container } from 'inversify'
import { BaseTestFixture, TestMocks, type TelemetryMockResult } from './TestFixture.js'
import { getTestContainer } from './testContainer.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import type { ContainerMode } from '../../src/inversify.config.js'
import { telemetryClient } from '../../src/telemetry.js'

/**
 * Integration test fixture with container and repository access
 */
export class IntegrationTestFixture extends BaseTestFixture {
    protected container?: Container
    protected telemetryMock?: TelemetryMockResult
    protected persistenceMode: ContainerMode

    constructor(persistenceMode: ContainerMode = 'memory') {
        super()
        this.persistenceMode = persistenceMode
    }

    /** Get or create the test container */
    async getContainer(): Promise<Container> {
        if (!this.container) {
            this.container = await getTestContainer(this.persistenceMode)
        }
        return this.container
    }

    /** Get LocationRepository instance */
    async getLocationRepository(): Promise<ILocationRepository> {
        const container = await this.getContainer()
        return container.get<ILocationRepository>('ILocationRepository')
    }

    /** Get PlayerRepository instance */
    async getPlayerRepository(): Promise<IPlayerRepository> {
        const container = await this.getContainer()
        return container.get<IPlayerRepository>('IPlayerRepository')
    }

    /** Get DescriptionRepository instance */
    async getDescriptionRepository(): Promise<IDescriptionRepository> {
        const container = await this.getContainer()
        return container.get<IDescriptionRepository>('IDescriptionRepository')
    }

    /**
     * Setup telemetry mocking for integration tests
     * Returns mock result for assertions
     */
    setupTelemetryMock(): TelemetryMockResult {
        if (!this.telemetryMock) {
            this.telemetryMock = TestMocks.createTelemetryClient()
            const originalTrackEvent = telemetryClient.trackEvent
            telemetryClient.trackEvent = this.telemetryMock.client.trackEvent

            // Register cleanup to restore original
            this.registerCleanup(() => {
                telemetryClient.trackEvent = originalTrackEvent
            })
        }
        return this.telemetryMock
    }

    /** Setup hook - initializes container */
    async setup(): Promise<void> {
        await super.setup()
        // Container will be lazily initialized on first access
    }

    /** Teardown hook - cleans up resources */
    async teardown(): Promise<void> {
        this.container = undefined
        this.telemetryMock = undefined
        await super.teardown()
    }
}
