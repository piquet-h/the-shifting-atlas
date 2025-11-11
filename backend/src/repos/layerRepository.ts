/**
 * Layer repository interface for description layer persistence.
 * Re-exports shared interface for backend use.
 */

import type { ILayerRepository as ILayerRepositoryShared } from '@piquet-h/shared/types/layerRepository'

export type ILayerRepository = ILayerRepositoryShared
