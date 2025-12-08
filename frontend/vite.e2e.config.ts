/**
 * Vite configuration for E2E tests
 * Runs WITHOUT API proxy so that Playwright page.route() can intercept API calls
 */
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
    plugins: [react()],
    // No proxy - API calls will be intercepted by Playwright page.route()
    server: {
        port: 5174
    },
    preview: {
        port: 4174
    },
    build: {
        rollupOptions: {
            onwarn(warning, warn) {
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE' && warning.message.includes('"use client"')) {
                    return
                }
                warn(warning)
            }
        }
    },
    test: {
        environment: 'jsdom',
        setupFiles: ['test/setup.ts'],
        globals: true
    }
})
