/**
 * Clock abstraction for testable time operations
 * Enables deterministic time control in tests while using system time in production
 */

/**
 * Clock interface for time operations
 * All time-dependent code should use this instead of direct `new Date()` calls
 */
export interface IClock {
    /**
     * Get current time as Date object
     */
    now(): Date

    /**
     * Get current time as ISO 8601 string
     */
    nowIso(): string
}

/**
 * Production implementation using system time
 */
export class SystemClock implements IClock {
    now(): Date {
        return new Date()
    }

    nowIso(): string {
        return new Date().toISOString()
    }
}

/**
 * Test implementation with controllable time
 * Allows tests to advance time deterministically
 */
export class FakeClock implements IClock {
    private currentTime: Date

    constructor(initialTime: Date = new Date('2025-01-01T00:00:00.000Z')) {
        this.currentTime = new Date(initialTime)
    }

    now(): Date {
        return new Date(this.currentTime)
    }

    nowIso(): string {
        return this.currentTime.toISOString()
    }

    /**
     * Advance clock by specified milliseconds
     */
    advance(ms: number): void {
        this.currentTime = new Date(this.currentTime.getTime() + ms)
    }

    /**
     * Set clock to specific time
     */
    setTime(time: Date): void {
        this.currentTime = new Date(time)
    }

    /**
     * Reset to initial time
     */
    reset(time: Date = new Date('2025-01-01T00:00:00.000Z')): void {
        this.currentTime = new Date(time)
    }
}
