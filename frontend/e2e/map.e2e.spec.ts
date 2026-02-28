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
