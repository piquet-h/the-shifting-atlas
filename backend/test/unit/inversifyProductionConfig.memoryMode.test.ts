import { Container } from 'inversify'
import assert from 'node:assert'
import { afterEach, describe, test } from 'node:test'

describe('production inversify.config (local memory mode)', () => {
    const originalEnv = { ...process.env }

    afterEach(() => {
        process.env = { ...originalEnv }
    })

    test('setupContainer does not throw when PERSISTENCE_MODE=memory locally and opt-in is set', async () => {
        process.env.PERSISTENCE_MODE = 'memory'
        process.env.ALLOW_LOCAL_MEMORY_CONTAINER = '1'
        delete process.env.WEBSITE_INSTANCE_ID

        const { setupContainer } = await import('../../src/inversify.config.js')

        const container = new Container()

        await assert.doesNotReject(async () => {
            await setupContainer(container)
        })
    })

    test('setupContainer rejects memory mode locally when opt-in is not set', async () => {
        process.env.PERSISTENCE_MODE = 'memory'
        delete process.env.ALLOW_LOCAL_MEMORY_CONTAINER
        delete process.env.WEBSITE_INSTANCE_ID

        const { setupContainer } = await import('../../src/inversify.config.js')

        const container = new Container()

        await assert.rejects(
            async () => {
                await setupContainer(container)
            },
            (err: unknown) => {
                assert.ok(err instanceof Error)
                assert.match(err.message, /ALLOW_LOCAL_MEMORY_CONTAINER/)
                return true
            }
        )
    })
})
