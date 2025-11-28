/**
 * Exit Hint Debounce Repository
 *
 * Re-exports the interface and utility functions from shared package.
 * Backend implementations: Cosmos SQL (production) and Memory (dev/test).
 */

export type {
    DebounceCheckResult,
    ExitHintDebounceRecord,
    IExitHintDebounceRepository
} from '@piquet-h/shared/types/exitHintDebounceRepository'

export { buildDebounceKey, buildScopeKey, parseDebounceKey } from '@piquet-h/shared/types/exitHintDebounceRepository'
