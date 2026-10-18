import { expect, test } from '@playwright/test'

/**
 * Map page E2E
 *
 * Ensures /map renders a Cytoscape canvas when the world graph API returns data.
 * API calls are intercepted (Playwright config runs against a static build with no proxy).
 */

test('renders world map canvas from mocked graph', async ({ page }) => {
    await page.route('**/api/world/graph', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                data: {
                    nodes: [
                        { id: 'root', name: 'Root' },
                        { id: 'north', name: 'North' }
                    ],
                    edges: [{ fromId: 'root', toId: 'north', direction: 'north', travelDurationMs: 300000 }]
                },
                correlationId: '00000000-0000-0000-0000-000000000000'
            })
        })
    })

    await page.goto('/map')

    const map = page.getByLabel('World map', { exact: true })

    // Header present (page mounted). Scope to the map container to avoid ambiguous matches.
    await expect(map.getByText('World Map', { exact: true })).toBeVisible()

    // Cytoscape creates a <canvas> element inside the container; treat this as the "ready" signal.
    const canvas = map.locator('canvas')
    await expect(canvas.first()).toBeVisible()

    // Loading overlay should be gone once Cytoscape is created and fit() runs.
    await expect(map.getByText('Charting the Atlas…')).toHaveCount(0)

    // Guard against the original bug: container collapses to 0 height.
    const box = await map.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThan(50)
    expect(box!.width).toBeGreaterThan(50)
})

for (const width of [1280, 390]) {
    for (const graphState of ['ready', 'loading', 'error'] as const) {
        test(`returns to commands with a ${graphState} map at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 844 })
            await page.route('**/.auth/me', (route) =>
                route.fulfill({
                    json: {
                        clientPrincipal: {
                            userId: 'map-explorer',
                            userDetails: 'explorer@example.com',
                            identityProvider: 'msa',
                            userRoles: ['authenticated', 'anonymous']
                        }
                    }
                })
            )
            await page.route('**/api/player', (route) =>
                route.fulfill({
                    json: {
                        success: true,
                        data: {
                            playerGuid: '550e8400-e29b-41d4-a716-446655440001',
                            created: false,
                            currentLocationId: 'a7e3f8c0-1234-4abc-9def-123456789012'
                        }
                    }
                })
            )
            await page.route('**/api/location/*', (route) =>
                route.fulfill({
                    json: {
                        success: true,
                        data: {
                            id: 'a7e3f8c0-1234-4abc-9def-123456789012',
                            name: 'Map Return Jetty',
                            description: {
                                text: 'A familiar jetty.',
                                html: '<p>A familiar jetty.</p>',
                                provenance: { compiledAt: '2026-10-15T00:00:00Z', layersApplied: ['base'], supersededSentences: 0 }
                            },
                            exits: []
                        }
                    }
                })
            )

            let releaseGraph: () => void = () => {}
            const graphReady = new Promise<void>((resolve) => {
                releaseGraph = resolve
            })
            await page.route('**/api/world/graph', async (route) => {
                if (graphState === 'loading') await graphReady
                await route.fulfill({
                    status: graphState === 'error' ? 503 : 200,
                    json: {
                        success: true,
                        data: { nodes: [{ id: 'root', name: 'Jetty' }], edges: [] }
                    }
                })
            })

            try {
                await page.goto('/map')
                const map = page.getByLabel('World map', { exact: true })
                if (graphState === 'ready') await expect(map.locator('canvas').first()).toBeVisible()
                if (graphState === 'loading') await expect(map.getByText('Charting the Atlas…')).toBeVisible()
                if (graphState === 'error') await expect(map.getByRole('alert')).toContainText('Map unavailable')

                const link = map.getByRole('navigation', { name: 'Map navigation' }).getByRole('link', { name: 'Back to commands' })
                await expect(link).toBeVisible()
                await expect(link).toHaveAttribute('href', '/game')
                await link.focus()
                await page.keyboard.press('Enter')

                await expect(page).toHaveURL('/game')
                await expect(page.getByRole('heading', { name: 'The Shifting Atlas - Game' })).toBeFocused()
                await expect(page.getByRole('combobox', { name: 'Command', exact: true }).first()).toBeVisible()
            } finally {
                releaseGraph()
            }
        })
    }
}
