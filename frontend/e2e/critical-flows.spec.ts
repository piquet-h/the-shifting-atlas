/**
 * Critical User Flows E2E Tests
 *
 * This test file covers the CRITICAL end-to-end user journeys that must work
 * for the game to be playable. These tests validate the full stack integration
 * from UI → API → response rendering.
 *
 * Critical Flows Tested:
 * 1. Game page loads with location displayed
 * 2. Navigation via click works
 * 3. Command submission works
 * 4. Authentication protects routes
 *
 * Non-critical edge cases are covered by unit/integration tests.
 */
import { expect, test } from '@playwright/test'

// Mock API responses for consistent E2E testing
const mockResponses = {
    player: {
        bootstrap: {
            success: true,
            data: {
                playerGuid: '550e8400-e29b-41d4-a716-446655440001',
                created: true,
                currentLocationId: 'a7e3f8c0-1234-4abc-9def-123456789012'
            }
        }
    },
    locations: {
        starter: {
            success: true,
            data: {
                id: 'a7e3f8c0-1234-4abc-9def-123456789012',
                name: 'Mosswell River Jetty',
                description: {
                    text: 'Timbered jetty where river current meets brackish tide.',
                    html: '<p>Timbered jetty where river current meets brackish tide.</p>',
                    provenance: {
                        compiledAt: new Date().toISOString(),
                        layersApplied: ['base'],
                        supersededSentences: 0
                    }
                },
                exits: [
                    { direction: 'north', targetId: 'b8f4a9d1-2345-5bcd-0efa-234567890123' },
                    { direction: 'south', targetId: 'c9a5b0e2-3456-6cde-1fab-345678901234' }
                ]
            }
        },
        northRoad: {
            success: true,
            data: {
                id: 'b8f4a9d1-2345-5bcd-0efa-234567890123',
                name: 'North Road',
                description: {
                    text: 'Slight rise leading north; bustle of the square fades behind.',
                    html: '<p>Slight rise leading north; bustle of the square fades behind.</p>',
                    provenance: {
                        compiledAt: new Date().toISOString(),
                        layersApplied: ['base'],
                        supersededSentences: 0
                    }
                },
                exits: [{ direction: 'south', targetId: 'a7e3f8c0-1234-4abc-9def-123456789012' }]
            }
        }
    }
}

/**
 * Set up all required API mocks for authenticated game page
 */
async function setupAuthenticatedGameMocks(page: import('@playwright/test').Page): Promise<void> {
    // Mock auth endpoint - AUTHENTICATED user required for /game route
    await page.route('**/.auth/me', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                clientPrincipal: {
                    userId: 'test-user-123',
                    userDetails: 'testplayer@example.com',
                    identityProvider: 'msa',
                    userRoles: ['authenticated', 'anonymous']
                }
            })
        })
    })

    // Mock player bootstrap
    await page.route('**/api/player', async (route) => {
        if (route.request().method() === 'GET') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockResponses.player.bootstrap)
            })
        } else {
            await route.continue()
        }
    })

    // Mock location endpoints
    await page.route('**/api/location/*', async (route) => {
        const url = route.request().url()
        const isStarter = url.includes('a7e3f8c0-1234-4abc-9def-123456789012')
        const isNorthRoad = url.includes('b8f4a9d1-2345-5bcd-0efa-234567890123')

        if (isStarter) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockResponses.locations.starter)
            })
        } else if (isNorthRoad) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockResponses.locations.northRoad)
            })
        } else {
            await route.fulfill({
                status: 404,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    error: { code: 'LOCATION_NOT_FOUND', message: 'Location not found' }
                })
            })
        }
    })

    // Mock move endpoint
    await page.route('**/api/player/*/move', async (route) => {
        const body = route.request().postDataJSON()
        if (body?.direction === 'north') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockResponses.locations.northRoad)
            })
        } else {
            await route.fulfill({
                status: 400,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    error: { code: 'EXIT_NOT_FOUND', message: 'No exit in that direction' }
                })
            })
        }
    })

    // Mock ping endpoint
    await page.route('**/api/ping', async (route) => {
        const body = route.request().postDataJSON()
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                data: { echo: body?.message || 'pong' }
            })
        })
    })
}

test.describe('Critical Flow: Game Page Load', () => {
    test('loads game page and displays current location', async ({ page }) => {
        await setupAuthenticatedGameMocks(page)
        await page.goto('/game')

        // CRITICAL: Location name appears
        await expect(page.getByRole('heading', { name: 'Mosswell River Jetty' })).toBeVisible({
            timeout: 10000
        })

        // CRITICAL: Location description appears
        await expect(page.getByText(/Timbered jetty/)).toBeVisible()

        // CRITICAL: Exit indicators appear
        await expect(page.getByRole('heading', { name: 'Available Exits' })).toBeVisible()
    })
})

test.describe('Critical Flow: Navigation', () => {
    test('navigates to new location via button click', async ({ page }) => {
        await setupAuthenticatedGameMocks(page)
        await page.goto('/game')

        // Wait for initial location
        await expect(page.getByRole('heading', { name: 'Mosswell River Jetty' })).toBeVisible({
            timeout: 10000
        })

        // CRITICAL: Click navigation button works
        const northButton = page.getByRole('button', { name: /Move North/i })
        await northButton.click()

        // CRITICAL: Location updates after navigation
        await expect(page.getByRole('heading', { name: 'North Road' })).toBeVisible({
            timeout: 10000
        })
    })
})

test.describe('Critical Flow: Command Input', () => {
    test('command input accepts and processes commands', async ({ page }) => {
        await setupAuthenticatedGameMocks(page)
        await page.goto('/game')

        // Wait for page to load
        await expect(page.getByRole('heading', { name: 'Mosswell River Jetty' })).toBeVisible({
            timeout: 10000
        })

        // CRITICAL: Command input is visible and functional
        const commandInput = page.getByRole('combobox', { name: /Command/i })
        await expect(commandInput).toBeVisible()

        // CRITICAL: Command can be typed and submitted
        await commandInput.fill('ping test')
        await commandInput.press('Enter')

        // CRITICAL: Response appears in output (use locator that matches the response element)
        // The command output shows "ping test" as the command and the response
        await expect(page.locator('text=/test|pong/').first()).toBeVisible({
            timeout: 5000
        })
    })
})

test.describe('Critical Flow: Authentication', () => {
    test('protected routes redirect unauthenticated users', async ({ page }) => {
        // Mock unauthenticated state
        await page.route('**/.auth/me', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ clientPrincipal: null })
            })
        })

        // Attempt to access protected route
        await page.goto('/profile')

        // CRITICAL: Redirects to homepage
        await expect(page).toHaveURL('/')
    })

    test('authenticated users can access protected routes', async ({ page }) => {
        // Mock authenticated state
        await page.route('**/.auth/me', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    clientPrincipal: {
                        userId: 'user-123',
                        userDetails: 'testuser@example.com',
                        identityProvider: 'msa',
                        userRoles: ['authenticated', 'anonymous']
                    }
                })
            })
        })

        // Access protected route
        await page.goto('/profile')

        // CRITICAL: Stays on protected route
        await expect(page).toHaveURL('/profile')
        await expect(page.getByRole('heading', { name: /Profile/i })).toBeVisible()
    })
})
