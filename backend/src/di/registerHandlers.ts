import type { Container } from 'inversify'

import { BootstrapPlayerHandler } from '../handlers/bootstrapPlayer.js'
import { ContainerHealthHandler } from '../handlers/containerHealth.js'
import { GenerateAreaHandler } from '../handlers/generateArea.js'
import { GetExitsHandler } from '../handlers/getExits.js'
import { GetPromptTemplateHandler } from '../handlers/getPromptTemplate.js'
import { GremlinHealthHandler } from '../handlers/gremlinHealth.js'
import { HealthHandler } from '../handlers/health.js'
import { LinkRoomsHandler } from '../handlers/linkRooms.js'
import { LocationLookHandler } from '../handlers/locationLook.js'
import { LoreMemoryHandler } from '../handlers/mcp/lore-memory/lore-memory.js'
import { WorldContextHandler } from '../handlers/mcp/world-context/world-context.js'
import { MoveHandler } from '../handlers/moveCore.js'
import { PingHandler } from '../handlers/ping.js'
import { SimplePingHandler } from '../handlers/pingSimple.js'
import { PlayerCreateHandler } from '../handlers/playerCreate.js'
import { PlayerGetHandler } from '../handlers/playerGet.js'
import { PlayerLinkHandler } from '../handlers/playerLink.js'
import { PlayerMoveHandler } from '../handlers/playerMove.js'
import { QueueProcessExitGenerationHintHandler } from '../handlers/queueProcessExitGenerationHint.js'
import { QueueSyncLocationAnchorsHandler } from '../handlers/queueSyncLocationAnchors.js'
import { QueueProcessWorldEventHandler } from '../worldEvents/queueProcessWorldEvent.js'

export const HANDLER_CLASSES = [
    MoveHandler,
    BootstrapPlayerHandler,

    // MCP handlers (resolved by wrapper functions)
    WorldContextHandler,
    LoreMemoryHandler,

    PlayerLinkHandler,
    PlayerMoveHandler,
    PingHandler,
    HealthHandler,
    GremlinHealthHandler,
    SimplePingHandler,
    LocationLookHandler,
    GetExitsHandler,
    GetPromptTemplateHandler,
    LinkRoomsHandler,
    PlayerCreateHandler,
    PlayerGetHandler,
    ContainerHealthHandler,
    GenerateAreaHandler,

    // Queue handlers
    QueueProcessWorldEventHandler,
    QueueProcessExitGenerationHintHandler,
    QueueSyncLocationAnchorsHandler
] as const

/**
 * Registers all request/queue handler classes.
 *
 * Handlers should be transient (default scope) to avoid shared mutable state.
 */
export function registerHandlers(container: Container): void {
    for (const Handler of HANDLER_CLASSES) {
        container.bind(Handler).toSelf()
    }
}
