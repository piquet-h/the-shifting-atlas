/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock functions
const mockTrackEvent = vi.fn()
const mockTrackException = vi.fn()
const mockTrackPageView = vi.fn()
const mockLoadAppInsights = vi.fn()
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
            trackPageView(pageView?: { name?: string; uri?: string; properties?: Record<string, unknown> }) {
                mockTrackPageView(pageView)
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

describe('PageView Tracking with Correlation', () => {
    let originalEnv: ImportMetaEnv

    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        originalEnv = { ...import.meta.env }
    })

    afterEach(() => {
        Object.assign(import.meta.env, originalEnv)
    })

    describe('trackPageView', () => {
        it('should track page view with operationId and sessionId', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackPageView, getSessionId } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackPageView.mockClear()

            trackPageView('/game', 'http://localhost:3000/game')

            const sessionId = getSessionId()
            expect(mockTrackPageView).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: '/game',
                    uri: 'http://localhost:3000/game',
                    properties: expect.objectContaining({
                        service: 'frontend-web',
                        'game.session.id': sessionId,
                        operationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
                    })
                })
            )
        })

        it('should include userId when authenticated', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackPageView, setUserId, getUserId } = await import('../src/services/telemetry')
            initTelemetry()
            setUserId('user-123')
            mockTrackPageView.mockClear()

            trackPageView('/profile', 'http://localhost:3000/profile')

            const userId = getUserId()
            expect(mockTrackPageView).toHaveBeenCalledWith(
                expect.objectContaining({
                    properties: expect.objectContaining({
                        'game.user.id': userId
                    })
                })
            )
        })

        it('should work without page name and URL', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackPageView } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackPageView.mockClear()

            trackPageView()

            expect(mockTrackPageView).toHaveBeenCalledWith(
                expect.objectContaining({
                    properties: expect.objectContaining({
                        service: 'frontend-web',
                        operationId: expect.any(String)
                    })
                })
            )
        })

        it('should not track when telemetry is disabled', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', '')

            const { initTelemetry, trackPageView } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackPageView.mockClear()

            trackPageView('/game')

            expect(mockTrackPageView).not.toHaveBeenCalled()
        })

        it('should generate unique operationId for each page view', async () => {
            vi.stubEnv('VITE_APPINSIGHTS_CONNECTION_STRING', 'InstrumentationKey=test-key')

            const { initTelemetry, trackPageView } = await import('../src/services/telemetry')
            initTelemetry()
            mockTrackPageView.mockClear()

            trackPageView('/page1')
            trackPageView('/page2')

            expect(mockTrackPageView).toHaveBeenCalledTimes(2)

            const call1 = mockTrackPageView.mock.calls[0][0]
            const call2 = mockTrackPageView.mock.calls[1][0]

            const operationId1 = call1.properties.operationId
            const operationId2 = call2.properties.operationId

            expect(operationId1).toBeDefined()
            expect(operationId2).toBeDefined()
            expect(operationId1).not.toBe(operationId2)
        })
    })
})
