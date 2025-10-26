/**
 * Integration Test Fixture - Provides setup for integration tests
 *
 * Features:
 * - Container setup with persistence mode selection
 * - Repository access via DI
 * - Telemetry mocking via DI
 * - Automatic cleanup
 */

import type { Container } from 'inversify'
import type { IDescriptionRepository } from '../../src/repos/descriptionRepository.js'
import type { ILocationRepository } from '../../src/repos/locationRepository.js'
import type { IPlayerRepository } from '../../src/repos/playerRepository.js'
import { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { BaseTestFixture } from './TestFixture.js'
import { getTestContainer } from './testContainer.js'
import type { ContainerMode } from './testInversify.config.js'

/**
 * Integration test fixture with container and repository access via DI
 */
export class IntegrationTestFixture extends BaseTestFixture {
    protected container?: Container
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

    /**
     * Get the telemetry client from the container
     * In test mode, this returns MockTelemetryClient for assertions
     */
    async getTelemetryClient(): Promise<ITelemetryClient | MockTelemetryClient> {
        const container = await this.getContainer()
        return container.get<ITelemetryClient>('ITelemetryClient')
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
            (client as MockTelemetryClient).clear()
        }
        this.container = undefined
        await super.teardown()
    }
}
