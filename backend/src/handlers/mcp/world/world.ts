import { InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { IExitRepository } from 'backend/src/repos/exitRepository.js'
import type { ILocationRepository } from 'backend/src/repos/locationRepository.js'
import { Container, inject, injectable } from 'inversify'
import { TelemetryService } from '../../../telemetry/TelemetryService.js'

/**
 * MCP-style handler class for getting a location. Follows the repo's
 * meta-pattern: constructor-injected dependencies, resolved from the
 * Inversify container, with a lightweight wrapper exported for the
 * mcpTool registration to call.
 */
@injectable()
export class WorldHandler {
    constructor(
        @inject(TelemetryService) private telemetryService: TelemetryService,
        @inject('ILocationRepository') private locationRepo: ILocationRepository,
        @inject('IExitRepository') private exitRepo: IExitRepository
    ) {}

    async getLocation(toolArguments: unknown, context: InvocationContext): Promise<string> {
        const toolArgs = toolArguments as { arguments: { locationId?: string } }
        context.log('world:getLocation invoked with arguments:', toolArguments)

        const location = await this.locationRepo.get(toolArgs.arguments.locationId || STARTER_LOCATION_ID)

        // Emit lightweight telemetry for MCP queries (non-blocking path)
        try {
            if (location && this.telemetryService.trackGameEventStrict) {
                this.telemetryService.trackGameEventStrict(
                    'Location.Get',
                    { locationId: location.id },
                    { correlationId: context.invocationId }
                )
            }
        } catch (e) {
            context.log('telemetry track failed', String(e))
        }

        return JSON.stringify(location)
    }

    async listExits(toolArguments: unknown, context: InvocationContext): Promise<string> {
        const toolArgs = toolArguments as { arguments: { locationId?: string } }
        context.log('world:listExits invoked with arguments:', toolArguments)

        const locationId = toolArgs.arguments.locationId || STARTER_LOCATION_ID
        const exits = await this.exitRepo.getExits(locationId)

        // Optionally emit telemetry using an existing event name
        try {
            if (this.telemetryService.trackGameEventStrict) {
                this.telemetryService.trackGameEventStrict('Location.Get', { locationId }, { correlationId: context.invocationId })
            }
        } catch (e) {
            context.log('telemetry track failed', String(e))
        }

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
