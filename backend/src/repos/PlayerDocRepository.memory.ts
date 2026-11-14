/**
 * In-memory implementation of IPlayerDocRepository for testing.
 * Delegates to the unified `InMemoryPlayerRepository` backing store.
 */

import { injectable } from 'inversify'
import { InMemoryPlayerRepository } from './playerRepository.memory.js'

@injectable()
export class MemoryPlayerDocRepository extends InMemoryPlayerRepository {}
