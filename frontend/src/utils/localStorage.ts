/**
 * Generic localStorage utilities with type safety and error handling.
 */

/**
 * Read a value from localStorage with validation
 * @param key Storage key
 * @param validator Optional validation function
 * @returns The stored value if valid, null otherwise
 */
export function readFromStorage<T extends string = string>(key: string, validator?: (value: string) => value is T): T | null {
    try {
        const stored = localStorage.getItem(key)
        if (!stored) return null
        if (validator && !validator(stored)) return null
        return stored as T
    } catch {
        return null
    }
}

/**
 * Write a value to localStorage with error suppression
 * @param key Storage key
 * @param value Value to store
 */
export function writeToStorage(key: string, value: string): void {
    try {
        localStorage.setItem(key, value)
    } catch {
        // Suppress storage errors (quota exceeded, private browsing, etc.)
    }
}

/**
 * Remove a key from localStorage with error suppression
 * @param key Storage key
 */
export function removeFromStorage(key: string): void {
    try {
        localStorage.removeItem(key)
    } catch {
        // Suppress storage errors
    }
}
