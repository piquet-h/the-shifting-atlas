/**
 * Layer repository interface for description layer persistence.
 * Re-exports shared interface for backend use.
 */

import type { ILayerRepository as ILayerRepositoryShared } from '@piquet-h/shared/types/layerRepository'

/**
 * Backend-local layer repository interface.
 *
 * The shared interface includes a few legacy APIs marked @deprecated.
 * We intentionally omit them here so new backend code cannot call them,
 * and implementations are free to remove them.
 */
export type ILayerRepository = Omit<ILayerRepositoryShared, 'getLayersForLocation'>
