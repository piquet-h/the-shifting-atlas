import { Direction } from '@piquet-h/shared'
import { inject, injectable } from 'inversify'
import { ExitEdgeResult, IExitRepository, sortExits } from './exitRepository.js'
import type { ILocationRepository } from './locationRepository.js'

/**
 * In-memory implementation of exit repository operations.
 * Uses InMemoryLocationRepository as source of truth for exits data.
 */
@injectable()
export class InMemoryExitRepository implements IExitRepository {
    constructor(@inject('ILocationRepository') private locationRepo: ILocationRepository) {}

    async getExits(locationId: string): Promise<ExitEdgeResult[]> {
        const location = await this.locationRepo.get(locationId)
        if (!location || !location.exits) {
            return []
        }

        // Convert location exits to ExitEdgeResult format
        const exits: ExitEdgeResult[] = location.exits.map((exit) => ({
            direction: exit.direction as Direction,
            toLocationId: exit.to || '',
            description: exit.description
        }))

        return sortExits(exits)
    }
}
