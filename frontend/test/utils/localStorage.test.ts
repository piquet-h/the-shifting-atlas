/**
 * Tests for localStorage utilities
 */

/* global globalThis */

// Mock localStorage for Node test environment
const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => {
            store[key] = value
        },
        removeItem: (key: string) => {
            delete store[key]
        },
        clear: () => {
            store = {}
        }
    }
})()

globalThis.localStorage = localStorageMock as Storage
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFromStorage, removeFromStorage, writeToStorage } from '../../src/utils/localStorage'

describe('localStorage utilities', () => {
    beforeEach(() => {
        localStorage.clear()
        vi.clearAllMocks()
    })

    describe('readFromStorage', () => {
        it('should read value from localStorage', () => {
            localStorage.setItem('test-key', 'test-value')

            const result = readFromStorage('test-key')

            expect(result).toBe('test-value')
        })

        it('should return null if key does not exist', () => {
            const result = readFromStorage('nonexistent-key')

            expect(result).toBeNull()
        })

        it('should validate value with validator function', () => {
            localStorage.setItem('test-guid', '12345678-1234-1234-1234-123456789abc')

            const isGuid = (value: string): value is string => {
                return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
            }

            const result = readFromStorage('test-guid', isGuid)

            expect(result).toBe('12345678-1234-1234-1234-123456789abc')
        })

        it('should return null if validator fails', () => {
            localStorage.setItem('invalid-guid', 'not-a-guid')

            const isGuid = (value: string): value is string => {
                return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value)
            }

            const result = readFromStorage('invalid-guid', isGuid)

            expect(result).toBeNull()
        })

        it('should handle storage exceptions gracefully', () => {
            const spy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
                throw new Error('Storage quota exceeded')
            })

            const result = readFromStorage('test-key')

            expect(result).toBeNull()
            spy.mockRestore()
        })
    })

    describe('writeToStorage', () => {
        it('should write value to localStorage', () => {
            writeToStorage('test-key', 'test-value')

            expect(localStorage.getItem('test-key')).toBe('test-value')
        })

        it('should handle storage exceptions gracefully', () => {
            const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
                throw new Error('Storage quota exceeded')
            })

            expect(() => writeToStorage('test-key', 'test-value')).not.toThrow()
            spy.mockRestore()
        })
    })

    describe('removeFromStorage', () => {
        it('should remove key from localStorage', () => {
            localStorage.setItem('test-key', 'test-value')

            removeFromStorage('test-key')

            expect(localStorage.getItem('test-key')).toBeNull()
        })

        it('should handle storage exceptions gracefully', () => {
            const spy = vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
                throw new Error('Storage error')
            })

            expect(() => removeFromStorage('test-key')).not.toThrow()
            spy.mockRestore()
        })
    })
})
