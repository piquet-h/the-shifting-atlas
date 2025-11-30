import { InvocationContext } from '@azure/functions'
import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import { ILocationRepository } from 'backend/src/repos/locationRepository.js'
import { Container } from 'inversify'

export async function worldQueryHandler(toolArguments: unknown, context: InvocationContext): Promise<string> {
    const toolArgs = toolArguments as { arguments: { locationId?: string } }
    context.info('world-query handler invoked with arguments:', toolArguments)
    const container = context.extraInputs.get('container') as Container
    const locationRepo = container.get<ILocationRepository>('ILocationRepository')

    const location = await locationRepo.get(toolArgs.arguments.locationId || STARTER_LOCATION_ID)

    return JSON.stringify(location)
}
