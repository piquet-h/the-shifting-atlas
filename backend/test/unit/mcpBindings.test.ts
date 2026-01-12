import { strict as assert } from 'assert'
import { Container } from 'inversify'
import { describe, it } from 'node:test'
import { LoreMemoryHandler } from '../../src/handlers/mcp/lore-memory/lore-memory.js'
import { WorldContextHandler } from '../../src/handlers/mcp/world-context/world-context.js'
import { WorldHandler } from '../../src/handlers/mcp/world/world.js'
import { setupTestContainer } from '../helpers/testInversify.config.js'

describe('MCP handler DI bindings', () => {
    it('test container can resolve MCP handlers', async () => {
        const container = new Container()
        await setupTestContainer(container, 'mock')

        assert.doesNotThrow(() => container.get(WorldHandler))
        assert.doesNotThrow(() => container.get(LoreMemoryHandler))
        assert.doesNotThrow(() => container.get(WorldContextHandler))
    })
})
