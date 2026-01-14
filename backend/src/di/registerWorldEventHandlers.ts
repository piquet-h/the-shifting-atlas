import type { Container } from 'inversify'

import { EnvironmentChangeHandler } from '../worldEvents/handlers/EnvironmentChangeHandler.js'
import { ExitCreateHandler } from '../worldEvents/handlers/ExitCreateHandler.js'
import { NPCTickHandler } from '../worldEvents/handlers/NPCTickHandler.js'

export const WORLD_EVENT_HANDLER_CLASSES = [ExitCreateHandler, NPCTickHandler, EnvironmentChangeHandler] as const

/**
 * Registers world-event handler classes used by the world event processor.
 */
export function registerWorldEventHandlers(container: Container): void {
    for (const Handler of WORLD_EVENT_HANDLER_CLASSES) {
        container.bind(Handler).toSelf()
    }
}
