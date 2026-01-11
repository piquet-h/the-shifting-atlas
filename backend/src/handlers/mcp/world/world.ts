import type { InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import { Container, inject, injectable } from 'inversify'
import type { IExitRepository } from '../../../repos/exitRepository.js'
import type { ILocationRepository } from '../../../repos/locationRepository.js'

/**
 * MCP-style handler class for getting a location. Follows the repo's
 * meta-pattern: constructor-injected dependencies, resolved from the
 * Inversify container, with a lightweight wrapper exported for the
 * mcpTool registration to call.
 */
@injectable()
export class WorldHandler {
    constructor(
        @inject('ILocationRepository') private locationRepo: ILocationRepository,
        @inject('IExitRepository') private exitRepo: IExitRepository
    ) {}

    async getLocation(toolArguments: unknown, context: InvocationContext): Promise<string> {
        const toolArgs = toolArguments as { arguments: { locationId?: string } }
        const locationId = toolArgs?.arguments?.locationId || STARTER_LOCATION_ID

        const location = await this.locationRepo.get(locationId)
        void context // part of the MCP handler signature; intentionally unused
        return JSON.stringify(location ?? null)
    }

    async listExits(toolArguments: unknown, context: InvocationContext): Promise<string> {
        const toolArgs = toolArguments as { arguments: { locationId?: string } }
        const locationId = toolArgs?.arguments?.locationId || STARTER_LOCATION_ID
        const exits = await this.exitRepo.getExits(locationId)

        void context // part of the MCP handler signature; intentionally unused
        return JSON.stringify({ exits })
    }
}

export async function getLocation(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(WorldHandler)
    return handler.getLocation(toolArguments, context)
}

export async function listExits(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const container = context.extraInputs.get('container') as Container
    const handler = container.get(WorldHandler)
    return handler.listExits(toolArguments, context)
}
