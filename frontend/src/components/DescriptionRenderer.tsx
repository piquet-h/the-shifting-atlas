/**
 * DescriptionRenderer Component
 *
 * Renders pre-compiled location descriptions with HTML sanitization and markdown support.
 * The backend handles layer composition, supersede masking, and validation.
 *
 * Features:
 * - HTML sanitization using DOMPurify (XSS prevention)
 * - Markdown to HTML conversion for LLM-generated content
 * - CSS styling preserving narrative tone
 *
 * Security:
 * - All content is sanitized before rendering to prevent XSS attacks
 * - Malicious script tags are stripped and logged
 *
 * Architecture:
 * - Backend compiles layers into a single description string
 * - Frontend renders the pre-compiled content (no composition logic)
 * - Aligns with Tenet #7: AI/backend owns narrative decision-making
 */
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'
import React, { useMemo } from 'react'

interface DescriptionRendererProps {
    /** Pre-compiled description content from backend (may contain markdown) */
    content: string
    /** Content format: 'markdown' converts to HTML, 'html' sanitizes directly */
    format?: 'markdown' | 'html'
    /** Optional CSS class name for custom styling */
    className?: string
    /** Optional callback when XSS attempt is detected */
    onXSSDetected?: (originalContent: string, sanitizedContent: string) => void
}

/**
 * Convert markdown to HTML and sanitize.
 * Returns sanitized HTML safe for rendering with dangerouslySetInnerHTML.
 */
function processContent(
    content: string,
    format: 'markdown' | 'html',
    onXSSDetected?: (original: string, sanitized: string) => void
): string {
    // Convert markdown to HTML if needed
    let html: string
    if (format === 'markdown') {
        html = marked.parse(content) as string
    } else {
        html = content
    }

    // Configure DOMPurify for strict sanitization
    const sanitized = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'p',
            'br',
            'strong',
            'em',
            'b',
            'i',
            'ul',
            'ol',
            'li',
            'blockquote',
            'code',
            'pre',
            'a',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6'
        ],
        ALLOWED_ATTR: ['href', 'title'],
        ALLOW_DATA_ATTR: false,
        RETURN_TRUSTED_TYPE: false
    })

    // Detect XSS attempt (content changed after sanitization)
    if (sanitized !== html && onXSSDetected) {
        onXSSDetected(html, sanitized)
        console.warn('[DescriptionRenderer] XSS attempt detected and sanitized', {
            original: html.substring(0, 100),
            sanitized: sanitized.substring(0, 100)
        })
    }

    return sanitized
}

/**
 * DescriptionRenderer
 * Renders backend-compiled description content with XSS protection.
 */
export default function DescriptionRenderer({
    content,
    format = 'markdown',
    className,
    onXSSDetected
}: DescriptionRendererProps): React.ReactElement {
    // Process and sanitize content
    const html = useMemo(() => {
        if (!content || content.trim().length === 0) {
            return null
        }
        return processContent(content, format, onXSSDetected)
    }, [content, format, onXSSDetected])

    // Handle empty content
    if (!html) {
        return (
            <div className={['text-responsive-sm text-slate-400 italic', className].filter(Boolean).join(' ')} role="status">
                No description available.
            </div>
        )
    }

    // Render sanitized HTML
    return (
        <div
            className={['text-responsive-sm text-slate-300 leading-relaxed', className].filter(Boolean).join(' ')}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}
