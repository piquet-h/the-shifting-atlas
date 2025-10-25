import { STARTER_LOCATION_ID } from '@piquet-h/shared'
import type { IPlayerRepository, PlayerRecord } from '@piquet-h/shared/types/playerRepository'

// Re-export the interface and type for local use
export type { IPlayerRepository, PlayerRecord } from '@piquet-h/shared/types/playerRepository'

// Re-export factory function (now delegates to Inversify container)
export { getPlayerRepository, __resetSharedContainer as __resetPlayerRepositoryForTests } from '../repositoryFactory.js'

