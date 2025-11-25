import type { Container } from 'inversify'
import { EnvironmentChangeHandler } from './handlers/EnvironmentChangeHandler.js'
import { ExitCreateHandler } from './handlers/ExitCreateHandler.js'
import { NPCTickHandler } from './handlers/NPCTickHandler.js'
import type { IWorldEventHandler } from './types.js'

/** Build a registry mapping event type string to handler instance */
export function buildWorldEventHandlerRegistry(container: Container): Map<string, IWorldEventHandler> {
    const registry = new Map<string, IWorldEventHandler>()
    registry.set('World.Exit.Create', container.get(ExitCreateHandler))
    registry.set('NPC.Tick', container.get(NPCTickHandler))
    registry.set('Location.Environment.Changed', container.get(EnvironmentChangeHandler))
    return registry
}
