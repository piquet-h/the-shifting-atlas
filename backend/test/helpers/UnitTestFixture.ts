/**
 * Unit Test Fixture - Provides setup for unit tests with mocked dependencies
 *
 * Features:
 * - Mock telemetry client
 * - Mock invocation context
 * - Mock HTTP requests
 * - Automatic cleanup
 */

import type { InvocationContext } from '@azure/functions'
import { BaseTestFixture, TestMocks, type InvocationContextMockResult, type TelemetryMockResult } from './TestFixture.js'
import { Container } from 'inversify'

/**
 * Unit test fixture with commonly mocked dependencies
 */
export class UnitTestFixture extends BaseTestFixture {
    protected telemetryMock?: TelemetryMockResult
    protected invocationContext?: InvocationContextMockResult
    protected container?: Container

    /**
     * Get or create a mock telemetry client
     */
    getTelemetryMock(): TelemetryMockResult {
        if (!this.telemetryMock) {
            this.telemetryMock = TestMocks.createTelemetryClient()
        }
        return this.telemetryMock
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
     */
    createInvocationContext(overrides?: Partial<InvocationContext>): InvocationContextMockResult {
        return TestMocks.createInvocationContext(overrides)
    }

    /**
     * Create an HTTP request mock
     */
    createHttpRequest(options: {
        method?: string
        url?: string
        query?: Record<string, string>
        headers?: Record<string, string>
        body?: unknown
    } = {}): unknown {
        return TestMocks.createHttpRequest(options)
    }

    /**
     * Get or create a test container with mocks
     */
    getContainer(containerOverrides?: Partial<Container>): Container {
        if (!this.container) {
            this.container = new Container()
            if (containerOverrides) {
                Object.assign(this.container, containerOverrides)
            }
        }
        return this.container
    }

    /** Setup hook */
    async setup(): Promise<void> {
        await super.setup()
    }

    /** Teardown hook - clears all mocks */
    async teardown(): Promise<void> {
        this.telemetryMock = undefined
        this.invocationContext = undefined
        this.container = undefined
        await super.teardown()
    }
}
