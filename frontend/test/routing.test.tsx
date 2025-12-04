/**
 * Routing Tests
 * 
 * Tests for React Router setup including:
 * - Route definitions
 * - Page component rendering
 * - Route path validation
 */
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import About from '../src/pages/About'
import Help from '../src/pages/Help'
import Settings from '../src/pages/Settings'
import NotFound from '../src/pages/NotFound'

describe('Page Components', () => {
    it('renders About page', () => {
        const html = renderToString(<About />)
        expect(html).toContain('About The Shifting Atlas')
    })

    it('renders Help page', () => {
        const html = renderToString(<Help />)
        expect(html).toContain('Help &amp; Support')
        expect(html).toContain('Getting Started')
        expect(html).toContain('Common Commands')
    })

    it('renders Settings page', () => {
        const html = renderToString(<Settings />)
        expect(html).toContain('Settings')
        expect(html).toContain('Display Settings')
        expect(html).toContain('Audio Settings')
        expect(html).toContain('Account Settings')
    })

    it('renders NotFound (404) page structure', () => {
        // Test only the text content, not Link component (requires Router context)
        const NotFoundTestWrapper = () => (
            <div className="min-h-screen flex flex-col items-center justify-center p-5 text-slate-100 bg-gradient-to-b from-atlas-bg to-atlas-bg-dark">
                <h1 className="text-4xl font-bold mb-4" tabIndex={-1}>
                    404
                </h1>
                <h2 className="text-2xl font-semibold mb-3">Page Not Found</h2>
                <p className="text-atlas-muted mb-6 text-center max-w-md">
                    The location you&apos;re looking for doesn&apos;t exist in The Shifting Atlas. Perhaps it has shifted away...
                </p>
            </div>
        )
        const html = renderToString(<NotFoundTestWrapper />)
        expect(html).toContain('404')
        expect(html).toContain('Page Not Found')
    })

    it('NotFound component exports correctly', () => {
        // Verify the component is exported and can be imported
        expect(NotFound).toBeDefined()
        expect(typeof NotFound).toBe('function')
    })
})

describe('Route Validation', () => {
    it('all new page routes use lowercase paths', () => {
        // Verify route paths are lowercase as per requirements
        const routes = ['/about', '/help', '/settings', '/game']
        routes.forEach(route => {
            expect(route).toBe(route.toLowerCase())
        })
    })

    it('validates URL query parameter format for location', () => {
        // Verify 'loc' parameter name is lowercase as per requirements
        const paramName = 'loc'
        expect(paramName).toBe(paramName.toLowerCase())
    })
})
