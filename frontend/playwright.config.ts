/**
 * Playwright E2E Test Configuration
 *
 * Configured for critical user flow testing:
 * - Game loop (navigate, view location)
 * - Command submission
 * - Authentication flow
 *
 * Uses page.route() for API interception (native Playwright approach).
 * Runs against STATIC SITE BUILD (vite preview) to test production-like environment.
 * The build uses vite.e2e.config.ts which removes the API proxy.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    /* Run tests in files in parallel */
    fullyParallel: true,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Reporter to use */
    reporter: process.env.CI ? 'github' : 'html',
    /* Shared settings for all the projects below */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: 'http://localhost:4174',
        /* Collect trace when retrying the failed test */
        trace: 'on-first-retry',
        /* Screenshot on failure */
        screenshot: 'only-on-failure'
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        }
        // Firefox and Safari deferred per issue scope
    ],

    /* Build and serve static site for E2E tests - API calls intercepted by page.route() */
    webServer: {
        command: 'npm run build -- --config vite.e2e.config.ts && npx vite preview --config vite.e2e.config.ts',
        url: 'http://localhost:4174',
        reuseExistingServer: !process.env.CI,
        timeout: 180 * 1000
    },

    /* Timeout for each test */
    timeout: 30 * 1000,

    /* Expect timeout */
    expect: {
        timeout: 5 * 1000
    }
})
