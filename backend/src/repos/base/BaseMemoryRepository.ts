/**
 * Abstract base class for in-memory repository implementations.
 * Provides common TTL timer management and test helpers to prevent:
 * - Memory leaks from unreferenced timers
 * - Test suite hanging (timers keep event loop alive)
 * - Duplicate cleanup boilerplate across memory repos
 *
 * Memory repositories inherit:
 * - TTL-based automatic cleanup with timer.unref()
 * - Test helpers: clear(), size()
 * - Consistent lifecycle management
 */

/**
 * Abstract base class for memory repositories with TTL support
 * @template TKey - The type of the storage key (string | composite key)
 * @template TValue - The type of stored values
 */
export abstract class BaseMemoryRepository<TKey extends string, TValue> {
    protected records: Map<TKey, TValue> = new Map()
    protected timers: Map<TKey, NodeJS.Timeout> = new Map()

    /**
     * Schedule automatic cleanup after TTL expires.
     * Uses timer.unref() to prevent blocking process exit.
     * @param key - Storage key to clean up
     * @param ttlMs - Time-to-live in milliseconds
     */
    protected scheduleCleanup(key: TKey, ttlMs: number): void {
        // Clear any existing timer for this key
        const existingTimer = this.timers.get(key)
        if (existingTimer) {
            clearTimeout(existingTimer)
        }

        // Schedule automatic cleanup after TTL
        const timer = setTimeout(() => {
            this.records.delete(key)
            this.timers.delete(key)
        }, ttlMs)

        // CRITICAL: unref() prevents timer from keeping process alive
        // Without this, tests hang and process won't exit cleanly
        timer.unref()

        this.timers.set(key, timer)
    }

    /**
     * Clear all stored items and timers (for testing).
     * Call in test afterEach() or cleanup hooks.
     */
    clear(): void {
        // Clear all timers first
        for (const timer of this.timers.values()) {
            clearTimeout(timer)
        }
        this.timers.clear()
        this.records.clear()
    }

    /**
     * Get current number of stored items (for testing/monitoring)
     */
    size(): number {
        return this.records.size
    }
}
