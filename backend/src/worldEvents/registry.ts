import type { Container } from 'inversify'
import { ExitCreateHandler } from './handlers/ExitCreateHandler.js'
import { NPCTickHandler } from './handlers/NPCTickHandler.js'
import type { IWorldEventHandler } from './types.js'

/** Build a registry mapping event type string to handler instance */
export function buildWorldEventHandlerRegistry(container: Container): Map<string, IWorldEventHandler> {
    const registry = new Map<string, IWorldEventHandler>()
    // Register handlers here (extend as more are implemented)
    registry.set('World.Exit.Create', container.get(ExitCreateHandler))
    registry.set('NPC.Tick', container.get(NPCTickHandler))
    return registry
}
