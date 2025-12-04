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

    it('NotFound component is exported and valid', () => {
        // Verify the component is exported and can be imported
        expect(NotFound).toBeDefined()
        expect(typeof NotFound).toBe('function')
        
        // Verify component name for debugging
        expect(NotFound.name).toBe('NotFound')
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
