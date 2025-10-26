import { Direction } from '@piquet-h/shared'
import { injectable } from 'inversify'
import { ExitEdgeResult, IExitRepository, sortExits } from '../../../src/repos/exitRepository.js'

/**
 * Mock implementation of IExitRepository for unit tests.
 * Provides predictable behavior and test control.
 */
@injectable()
export class MockExitRepository implements IExitRepository {
    private mockExits = new Map<string, ExitEdgeResult[]>()

    // Test helpers
    setExits(locationId: string, exits: ExitEdgeResult[]): void {
        this.mockExits.set(locationId, exits)
    }

    clear(): void {
        this.mockExits.clear()
    }

    async getExits(locationId: string): Promise<ExitEdgeResult[]> {
        const exits = this.mockExits.get(locationId) || []
        return sortExits(exits)
    }
}
