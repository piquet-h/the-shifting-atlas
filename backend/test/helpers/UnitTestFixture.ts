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
import { MockTelemetryClient } from '../mocks/MockTelemetryClient.js'
import { BaseTestFixture, TestMocks, type InvocationContextMockResult } from './TestFixture.js'
import { getTestContainer } from './testContainer.js'

/**
 * Unit test fixture with commonly mocked dependencies injected via Inversify
 */
export class UnitTestFixture extends BaseTestFixture {
    protected invocationContext?: InvocationContextMockResult
    protected container?: Container

    /**
     * Get or create the test container with 'mock' mode
     * All dependencies are mocked and injectable
     */
    async getContainer(): Promise<Container> {
        if (!this.container) {
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
