/**
 * DescriptionRenderer Component Tests
 *
 * Comprehensive test coverage for:
 * - XSS prevention with malicious content
 * - Markdown to HTML conversion
 * - HTML sanitization
 * - Edge cases (empty content, different formats)
 * - CSS styling and accessibility
 */
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

describe('DescriptionRenderer Component', () => {
    describe('Content Rendering', () => {
        it('renders markdown content converted to HTML', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = '**Bold text** and *italic text*'
            const markup = renderToString(<DescriptionRenderer content={content} format="markdown" />)

            // Markdown should be converted to HTML
            expect(markup).toContain('<strong>')
            expect(markup).toContain('Bold text')
            expect(markup).toContain('<em>')
            expect(markup).toContain('italic text')
        })

        it('renders HTML content with sanitization', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = '<p>Safe <strong>HTML</strong> content</p>'
            const markup = renderToString(<DescriptionRenderer content={content} format="html" />)

            expect(markup).toContain('Safe')
            expect(markup).toContain('<strong>')
            expect(markup).toContain('HTML')
        })

        it('defaults to markdown format', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = '**Bold**'
            const markup = renderToString(<DescriptionRenderer content={content} />)

            expect(markup).toContain('<strong>')
            expect(markup).toContain('Bold')
        })
    })

    describe('XSS Prevention', () => {
        it('sanitizes malicious script tags and logs warning', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')
            const onXSSDetected = vi.fn()

            const content = 'Safe content<script>alert("XSS")</script>more content'
            const markup = renderToString(<DescriptionRenderer content={content} format="html" onXSSDetected={onXSSDetected} />)

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

            const content = 'Image test <img src="x" onerror="alert(1)">'
            const markup = renderToString(<DescriptionRenderer content={content} format="html" />)

            // img tag should be removed (not in allowed tags)
            expect(markup).not.toContain('<img')
            expect(markup).not.toContain('onerror')
            expect(markup).toContain('Image test')
        })

        it('sanitizes javascript: protocol in links', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = '<a href="javascript:alert(1)">Click me</a>'
            const markup = renderToString(<DescriptionRenderer content={content} format="html" />)

            // javascript: protocol should be removed
            expect(markup).not.toContain('javascript:')
            // Link text should remain
            expect(markup).toContain('Click me')
        })

        it('allows safe HTML tags (bold, italic, lists)', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = '**Bold text** and *italic text*\n\n- Item 1\n- Item 2'
            const markup = renderToString(<DescriptionRenderer content={content} format="markdown" />)

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
        it('handles empty content', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const markup = renderToString(<DescriptionRenderer content="" />)

            expect(markup).toContain('No description available')
            expect(markup).toContain('role="status"')
        })

        it('handles whitespace-only content', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const markup = renderToString(<DescriptionRenderer content="   " />)

            expect(markup).toContain('No description available')
        })

        it('renders simple text content', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = 'An ancient stone chamber.'
            const markup = renderToString(<DescriptionRenderer content={content} format="markdown" />)

            expect(markup).toContain('ancient stone chamber')
        })
    })

    describe('Markdown Conversion', () => {
        it('converts markdown headings to HTML', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = '# Main Title\n\n## Subtitle'
            const markup = renderToString(<DescriptionRenderer content={content} format="markdown" />)

            expect(markup).toContain('<h1>')
            expect(markup).toContain('Main Title')
            expect(markup).toContain('<h2>')
            expect(markup).toContain('Subtitle')
        })

        it('converts markdown links to HTML', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = 'Visit [the archives](https://example.com) for more.'
            const markup = renderToString(<DescriptionRenderer content={content} format="markdown" />)

            expect(markup).toContain('<a')
            expect(markup).toContain('href="https://example.com"')
            expect(markup).toContain('the archives')
        })

        it('converts markdown blockquotes to HTML', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = '> Ancient inscription on the wall'
            const markup = renderToString(<DescriptionRenderer content={content} format="markdown" />)

            expect(markup).toContain('<blockquote>')
            expect(markup).toContain('Ancient inscription')
        })

        it('converts markdown code blocks', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = '```\ncode block\n```'
            const markup = renderToString(<DescriptionRenderer content={content} format="markdown" />)

            expect(markup).toContain('<code>')
            expect(markup).toContain('code block')
        })
    })

    describe('CSS Styling and Accessibility', () => {
        it('applies responsive typography classes', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = 'Styled content.'
            const markup = renderToString(<DescriptionRenderer content={content} />)

            expect(markup).toContain('text-responsive-sm')
            expect(markup).toContain('leading-relaxed')
        })

        it('applies custom className when provided', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = 'Custom styled.'
            const markup = renderToString(<DescriptionRenderer content={content} className="custom-class" />)

            expect(markup).toContain('custom-class')
        })

        it('uses slate text colors for narrative tone', async () => {
            const { default: DescriptionRenderer } = await import('../src/components/DescriptionRenderer')

            const content = 'Narrative text.'
            const markup = renderToString(<DescriptionRenderer content={content} />)

            expect(markup).toContain('text-slate-300')
        })
    })
})
