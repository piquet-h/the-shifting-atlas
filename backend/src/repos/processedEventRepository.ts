/**
 * Processed Event Repository
 *
 * Re-exports the interface and utility functions from shared package.
 * Backend implementations: Cosmos SQL (production) and Memory (dev/test).
 */

export type { IProcessedEventRepository, ProcessedEventRecord } from '@piquet-h/shared/types/processedEventRepository'

export { buildIdempotencyKey, parseIdempotencyKey } from '@piquet-h/shared/types/processedEventRepository'
