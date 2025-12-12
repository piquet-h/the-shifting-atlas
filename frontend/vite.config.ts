import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

// https://vite.dev/config/
export default defineConfig({
    plugins: [react(), svgr()],
    server: {
        proxy: {
            '/api': {
                target: 'http://localhost:7071',
                changeOrigin: true
            }
        }
    },
    build: {
        rollupOptions: {
            // Suppress "use client" directive warnings from TanStack Query
            // These are Next.js directives that don't apply to Vite/SPA builds
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
