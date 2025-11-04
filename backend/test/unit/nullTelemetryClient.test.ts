/**
 * Tests for NullTelemetryClient used in memory/local mode
 */

import { Container } from 'inversify'
import assert from 'node:assert'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { setupContainer } from '../../src/inversify.config.js'
import { ITelemetryClient } from '../../src/telemetry/ITelemetryClient.js'
import { NullTelemetryClient } from '../../src/telemetry/NullTelemetryClient.js'

describe('NullTelemetryClient', () => {
    test('should be a no-op for all telemetry operations', () => {
        const client = new NullTelemetryClient()

        // Should not throw for any operation
        assert.doesNotThrow(() => {
            client.trackEvent({ name: 'Test.Event' })
            client.trackException({ exception: new Error('test') })
            client.trackMetric({ name: 'test', value: 1 })
            client.trackTrace({ message: 'test' })
            client.trackDependency({
                dependencyTypeName: 'test',
                name: 'test',
                data: 'test',
                duration: 1,
                success: true,
                resultCode: '200'
            })
            client.trackRequest({ name: 'test', url: 'http://test', duration: 1, resultCode: '200', success: true })
            client.addTelemetryProcessor(() => true)
            client.flush()
        })
    })

    describe('Container Integration', () => {
        let container: Container

        beforeEach(async () => {
            container = new Container()
        })

        afterEach(async () => {
            container.unbindAll()
        })

        test('memory mode should bind NullTelemetryClient', async () => {
            // Force memory mode
            const originalMode = process.env.PERSISTENCE_MODE
            process.env.PERSISTENCE_MODE = 'memory'

            try {
                await setupContainer(container, 'memory')

                const client = container.get<ITelemetryClient>('ITelemetryClient')
                assert.ok(client instanceof NullTelemetryClient, 'Should bind NullTelemetryClient in memory mode')
            } finally {
                if (originalMode) {
                    process.env.PERSISTENCE_MODE = originalMode
                } else {
                    delete process.env.PERSISTENCE_MODE
                }
            }
        })
    })
})
