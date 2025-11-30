/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock functions
const mockTrackEvent = vi.fn()
const mockTrackException = vi.fn()
const mockTrackPageView = vi.fn()
const mockLoadAppInsights = vi.fn()
const mockFlush = vi.fn()
const mockSetAuthenticatedUserContext = vi.fn()
const mockClearAuthenticatedUserContext = vi.fn()

// Mock ApplicationInsights before importing telemetry module
vi.mock('@microsoft/applicationinsights-web', () => {
    return {
        ApplicationInsights: class MockApplicationInsights {
            config: unknown
            constructor(config: unknown) {
                this.config = config
            }
            loadAppInsights() {
                mockLoadAppInsights()
            }
            trackEvent(event: { name: string }, properties?: Record<string, unknown>) {
                mockTrackEvent(event, properties)
            }
            trackException(info: { error: Error; properties?: Record<string, unknown> }) {
                mockTrackException(info)
            }
            trackPageView() {
                mockTrackPageView()
            }
            flush() {
                mockFlush()
            }
            setAuthenticatedUserContext(userId: string, accountId?: string, storeInCookie?: boolean) {
                mockSetAuthenticatedUserContext(userId, accountId, storeInCookie)
            }
            clearAuthenticatedUserContext() {
                mockClearAuthenticatedUserContext()
            }
        }
    }
})

describe('Frontend Telemetry', () => {
    // Store original environment and reset modules for each test
    let originalEnv: ImportMetaEnv

    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        originalEnv = { ...import.meta.env }
    })

    afterEach(() => {
        // Restore environment
        Object.assign(import.meta.env, originalEnv)
    })

    describe('initTelemetry', () => {
        it('should return undefined when connection string is not provided', async () => {
            // Clear the connection string
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', '')

            const { initTelemetry } = await import('../src/services/telemetry')
            const result = initTelemetry()

            expect(result).toBeUndefined()
        })

        it('should initialize Application Insights when connection string is provided', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry } = await import('../src/services/telemetry')
            const result = initTelemetry()

            expect(result).toBeDefined()
            expect(mockLoadAppInsights).toHaveBeenCalled()
            expect(mockTrackPageView).toHaveBeenCalled()
        })

        it('should return same instance when called multiple times', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry } = await import('../src/services/telemetry')
            const result1 = initTelemetry()
            const result2 = initTelemetry()

            expect(result1).toBe(result2)
            // loadAppInsights should only be called once
            expect(mockLoadAppInsights).toHaveBeenCalledTimes(1)
        })
    })

    describe('session management', () => {
        it('should generate a valid session ID on initialization', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, getSessionId } = await import('../src/services/telemetry')
            initTelemetry()

            const sessionId = getSessionId()
            expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        })

        it('should track Session.Start event on initialization', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry } = await import('../src/services/telemetry')
            initTelemetry()

            // Session.Start should be tracked after initialization
            expect(mockTrackEvent).toHaveBeenCalledWith(
                { name: 'Session.Start' },
                expect.objectContaining({
                    service: 'frontend-web',
                    'game.session.id': expect.any(String)
                })
            )
        })
    })

    describe('user ID management', () => {
        it('should set authenticated user context when user ID is provided', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, setUserId, getUserId } = await import('../src/services/telemetry')
            initTelemetry()

            setUserId('user-123')

            expect(getUserId()).toBe('user-123')
            expect(mockSetAuthenticatedUserContext).toHaveBeenCalledWith('user-123', undefined, true)
        })

        it('should clear authenticated user context when user ID is undefined', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, setUserId } = await import('../src/services/telemetry')
            initTelemetry()

            setUserId('user-123')
            setUserId(undefined)

            expect(mockClearAuthenticatedUserContext).toHaveBeenCalled()
        })
    })

    describe('trackEvent', () => {
        it('should not track when telemetry is not initialized', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', '')

            const { initTelemetry, trackEvent } = await import('../src/services/telemetry')
            initTelemetry() // Returns undefined since no connection string

            trackEvent('TestEvent', { prop: 'value' })

            expect(mockTrackEvent).not.toHaveBeenCalledWith({ name: 'TestEvent' }, expect.anything())
        })

        it('should track event with properties when telemetry is initialized', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackEvent } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear() // Clear the Session.Start call

            trackEvent('TestEvent', { prop: 'value' })

            expect(mockTrackEvent).toHaveBeenCalledWith({ name: 'TestEvent' }, { prop: 'value' })
        })
    })

    describe('trackGameEventClient', () => {
        it('should enrich properties with session ID', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackGameEventClient, getSessionId } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear()

            trackGameEventClient('UI.Move.Command', { direction: 'north' })

            const sessionId = getSessionId()
            expect(mockTrackEvent).toHaveBeenCalledWith(
                { name: 'UI.Move.Command' },
                expect.objectContaining({
                    service: 'frontend-web',
                    direction: 'north',
                    'game.session.id': sessionId
                })
            )
        })

        it('should reject invalid event names', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackGameEventClient } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear()

            trackGameEventClient('Invalid.Event.Name', { prop: 'value' })

            expect(mockTrackEvent).toHaveBeenCalledWith(
                { name: 'Telemetry.EventName.Invalid' },
                expect.objectContaining({ requested: 'Invalid.Event.Name' })
            )
        })
    })

    describe('trackUIError', () => {
        it('should track UI.Error event with error details', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackUIError, getSessionId } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear()
            mockTrackException.mockClear()

            const error = new TypeError('Test error message')
            trackUIError(error, { source: 'test' })

            const sessionId = getSessionId()
            expect(mockTrackEvent).toHaveBeenCalledWith(
                { name: 'UI.Error' },
                expect.objectContaining({
                    service: 'frontend-web',
                    errorMessage: 'Test error message',
                    'game.error.code': 'TypeError',
                    'game.session.id': sessionId,
                    source: 'test'
                })
            )
            expect(mockTrackException).toHaveBeenCalled()
        })

        it('should truncate long error stacks', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackUIError } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear()

            const error = new Error('Test error')
            error.stack = 'x'.repeat(2000) // Very long stack trace
            trackUIError(error)

            expect(mockTrackEvent).toHaveBeenCalledWith(
                { name: 'UI.Error' },
                expect.objectContaining({
                    errorStack: expect.stringMatching(/^x{1000}$/) // Truncated to 1000 chars
                })
            )
        })
    })

    describe('trackPlayerNavigate', () => {
        it('should track Player.Navigate event with direction', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackPlayerNavigate, getSessionId } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear()

            trackPlayerNavigate('north', 150, 'correlation-123')

            const sessionId = getSessionId()
            expect(mockTrackEvent).toHaveBeenCalledWith(
                { name: 'Player.Navigate' },
                expect.objectContaining({
                    service: 'frontend-web',
                    'game.world.exit.direction': 'north',
                    'game.action.type': 'navigate',
                    'game.session.id': sessionId,
                    'game.latency.ms': 150,
                    'game.event.correlation.id': 'correlation-123'
                })
            )
        })

        it('should omit optional fields when not provided', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackPlayerNavigate } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear()

            trackPlayerNavigate('south')

            expect(mockTrackEvent).toHaveBeenCalledWith(
                { name: 'Player.Navigate' },
                expect.not.objectContaining({
                    'game.latency.ms': expect.anything(),
                    'game.event.correlation.id': expect.anything()
                })
            )
        })
    })

    describe('trackPlayerCommand', () => {
        it('should track Player.Command event with command details', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackPlayerCommand, getSessionId } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear()

            trackPlayerCommand('go north', 'move', 100, 'correlation-456')

            const sessionId = getSessionId()
            expect(mockTrackEvent).toHaveBeenCalledWith(
                { name: 'Player.Command' },
                expect.objectContaining({
                    service: 'frontend-web',
                    command: 'go north',
                    'game.action.type': 'move',
                    'game.session.id': sessionId,
                    'game.latency.ms': 100,
                    'game.event.correlation.id': 'correlation-456'
                })
            )
        })

        it('should truncate long commands', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackPlayerCommand } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear()

            const longCommand = 'x'.repeat(200)
            trackPlayerCommand(longCommand, 'unknown')

            expect(mockTrackEvent).toHaveBeenCalledWith(
                { name: 'Player.Command' },
                expect.objectContaining({
                    command: 'x'.repeat(100) // Truncated to 100 chars
                })
            )
        })
    })

    describe('debounceTrack', () => {
        it('should debounce function calls', async () => {
            vi.useFakeTimers()
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, debounceTrack, trackEvent } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackEvent.mockClear()

            const debouncedTrack = debounceTrack(trackEvent, 100)

            // Call multiple times rapidly
            debouncedTrack('TestEvent', { count: 1 })
            debouncedTrack('TestEvent', { count: 2 })
            debouncedTrack('TestEvent', { count: 3 })

            // No calls yet
            expect(mockTrackEvent).not.toHaveBeenCalled()

            // Fast forward past debounce time
            vi.advanceTimersByTime(150)

            // Only the last call should have been executed
            expect(mockTrackEvent).toHaveBeenCalledTimes(1)
            expect(mockTrackEvent).toHaveBeenCalledWith({ name: 'TestEvent' }, { count: 3 })

            vi.useRealTimers()
        })
    })

    describe('isTelemetryEnabled', () => {
        it('should return false when telemetry is not initialized', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', '')

            const { initTelemetry, isTelemetryEnabled } = await import('../src/services/telemetry')
            initTelemetry()

            expect(isTelemetryEnabled()).toBe(false)
        })

        it('should return true when telemetry is initialized', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, isTelemetryEnabled } = await import('../src/services/telemetry')
            initTelemetry()

            expect(isTelemetryEnabled()).toBe(true)
        })
    })
})
