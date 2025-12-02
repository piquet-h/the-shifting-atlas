/**
 * DescriptionRenderer Component Tests
 *
 * Comprehensive test coverage for:
 * - Layer composition and priority sorting
 * - XSS prevention with malicious content
 * - Edge cases (single layer, empty layers)
 * - HTML rendering and markdown conversion
 * - CSS styling and accessibility
 */
import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

describe('DescriptionRenderer Component', () => {
    describe('Layer Composition', () => {
        it('renders multiple layers in priority order (base → ambient → dynamic)', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-dynamic',
                    locationId: 'loc-1',
                    layerType: 'dynamic',
                    content: 'A recent fire has scorched the walls.',
                    priority: 3,
                    authoredAt: '2024-01-03T00:00:00Z'
                },
                {
                    id: 'layer-base',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'An ancient stone chamber.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                },
                {
                    id: 'layer-ambient',
                    locationId: 'loc-1',
                    layerType: 'ambient',
                    content: 'The air is thick with dust.',
                    priority: 2,
                    authoredAt: '2024-01-02T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            // Verify all three layers are rendered
            expect(markup).toContain('ancient stone chamber')
            expect(markup).toContain('thick with dust')
            expect(markup).toContain('recent fire')

            // Verify priority order (base should appear before ambient, ambient before dynamic)
            const baseIndex = markup.indexOf('ancient stone chamber')
            const ambientIndex = markup.indexOf('thick with dust')
            const dynamicIndex = markup.indexOf('recent fire')

            expect(baseIndex).toBeLessThan(ambientIndex)
            expect(ambientIndex).toBeLessThan(dynamicIndex)
        })

        it('handles same priority layers by sorting by type order (base < ambient < dynamic)', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-dynamic',
                    locationId: 'loc-1',
                    layerType: 'dynamic',
                    content: 'Dynamic content.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                },
                {
                    id: 'layer-base',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Base content.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                },
                {
                    id: 'layer-ambient',
                    locationId: 'loc-1',
                    layerType: 'ambient',
                    content: 'Ambient content.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            // Verify type order when priority is the same
            const baseIndex = markup.indexOf('Base content')
            const ambientIndex = markup.indexOf('Ambient content')
            const dynamicIndex = markup.indexOf('Dynamic content')

            expect(baseIndex).toBeLessThan(ambientIndex)
            expect(ambientIndex).toBeLessThan(dynamicIndex)
        })

        it('includes layer type metadata in rendered output', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Base layer content.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            // Should not include metadata in single layer mode
            expect(markup).toContain('Base layer content')
        })
    })

    describe('XSS Prevention', () => {
        it('sanitizes malicious script tags and logs warning', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')
            const onXSSDetected = vi.fn()

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Safe content<script>alert("XSS")</script>more content',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} onXSSDetected={onXSSDetected} />)

            // Script tag should be removed
            expect(markup).not.toContain('<script>')
            expect(markup).not.toContain('alert("XSS")')
            expect(markup).toContain('Safe content')
            expect(markup).toContain('more content')

            // XSS detection callback should be called
            expect(onXSSDetected).toHaveBeenCalled()
        })

        it('sanitizes malicious img onerror tags', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Image test <img src="x" onerror="alert(1)">',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            // img tag should be removed (not in allowed tags)
            expect(markup).not.toContain('<img')
            expect(markup).not.toContain('onerror')
            expect(markup).toContain('Image test')
        })

        it('sanitizes javascript: protocol in links', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: '<a href="javascript:alert(1)">Click me</a>',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            // javascript: protocol should be removed
            expect(markup).not.toContain('javascript:')
            // Link text should remain
            expect(markup).toContain('Click me')
        })

        it('allows safe HTML tags (bold, italic, lists)', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: '**Bold text** and *italic text*\n\n- Item 1\n- Item 2',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            // Markdown should be converted to HTML
            expect(markup).toContain('<strong>')
            expect(markup).toContain('Bold text')
            expect(markup).toContain('<em>')
            expect(markup).toContain('italic text')
            expect(markup).toContain('<li>')
            expect(markup).toContain('Item 1')
        })
    })

    describe('Edge Cases', () => {
        it('renders single layer without composition wrapper', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Single layer content.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            expect(markup).toContain('Single layer content')
            // Should not have multi-layer spacing wrapper
            expect(markup).not.toContain('space-y-3')
        })

        it('skips empty layers (no placeholder)', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Content layer.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                },
                {
                    id: 'layer-empty',
                    locationId: 'loc-1',
                    layerType: 'ambient',
                    content: '   ', // Empty/whitespace only
                    priority: 2,
                    authoredAt: '2024-01-02T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            // Only non-empty layer should render
            expect(markup).toContain('Content layer')
            // Single layer mode (empty layer filtered out)
            expect(markup).not.toContain('space-y-3')
        })

        it('renders empty state when all layers are empty', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: '',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                },
                {
                    id: 'layer-2',
                    locationId: 'loc-1',
                    layerType: 'ambient',
                    content: '  ',
                    priority: 2,
                    authoredAt: '2024-01-02T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            expect(markup).toContain('No description available')
            expect(markup).toContain('role="status"')
        })

        it('handles empty layers array', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const markup = renderToString(<DescriptionRenderer layers={[]} />)

            expect(markup).toContain('No description available')
        })
    })

    describe('HTML Rendering and Markdown Conversion', () => {
        it('converts markdown headings to HTML', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: '# Main Title\n\n## Subtitle',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            expect(markup).toContain('<h1>')
            expect(markup).toContain('Main Title')
            expect(markup).toContain('<h2>')
            expect(markup).toContain('Subtitle')
        })

        it('converts markdown links to HTML', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Visit [the archives](https://example.com) for more.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            expect(markup).toContain('<a')
            expect(markup).toContain('href="https://example.com"')
            expect(markup).toContain('the archives')
        })

        it('converts markdown blockquotes to HTML', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: '> Ancient inscription on the wall',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            expect(markup).toContain('<blockquote>')
            expect(markup).toContain('Ancient inscription')
        })
    })

    describe('CSS Styling and Accessibility', () => {
        it('applies responsive typography classes', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Styled content.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            expect(markup).toContain('text-responsive-sm')
            expect(markup).toContain('leading-relaxed')
        })

        it('applies custom className when provided', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Custom styled.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} className="custom-class" />)

            expect(markup).toContain('custom-class')
        })

        it('uses slate text colors for narrative tone', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'Narrative text.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            expect(markup).toContain('text-slate-300')
        })

        it('adds appropriate spacing between multiple layers', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const layers: DescriptionLayer[] = [
                {
                    id: 'layer-1',
                    locationId: 'loc-1',
                    layerType: 'base',
                    content: 'First layer.',
                    priority: 1,
                    authoredAt: '2024-01-01T00:00:00Z'
                },
                {
                    id: 'layer-2',
                    locationId: 'loc-1',
                    layerType: 'ambient',
                    content: 'Second layer.',
                    priority: 2,
                    authoredAt: '2024-01-02T00:00:00Z'
                }
            ]

            const markup = renderToString(<DescriptionRenderer layers={layers} />)

            // Multi-layer composition uses space-y-3 for vertical spacing
            expect(markup).toContain('space-y-3')
        })
    })
})
