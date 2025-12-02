/**
 * DescriptionRenderer Component
 *
 * Renders composable description layers with priority ordering and HTML sanitization.
 * Layers are rendered in priority order: higher priority appears first (dynamic → ambient → base).
 *
 * Features:
 * - Layer composition with priority sorting (higher = first)
 * - HTML sanitization using DOMPurify (XSS prevention)
 * - Markdown to HTML conversion for LLM-generated content
 * - CSS styling preserving narrative tone
 *
 * Security:
 * - All content is sanitized before rendering to prevent XSS attacks
 * - Malicious script tags are stripped and logged
 */
import type { DescriptionLayer, LayerType } from '@piquet-h/shared/types/layerRepository'
import DOMPurify from 'isomorphic-dompurify'
import { marked } from 'marked'
import React, { useMemo } from 'react'

interface DescriptionRendererProps {
    /** Array of description layers to compose and render */
    layers: DescriptionLayer[]
    /** Optional CSS class name for custom styling */
    className?: string
    /** Optional callback when XSS attempt is detected */
    onXSSDetected?: (originalContent: string, sanitizedContent: string) => void
}

/**
 * Layer type display order (priority within same numeric priority).
 * Lower index = rendered first.
 */
const LAYER_TYPE_ORDER: Record<LayerType, number> = {
    base: 0,
    ambient: 1,
    dynamic: 2
}

/**
 * Sort layers by priority (higher = first) and layer type.
 * For same priority, base comes before ambient, ambient before dynamic.
 * For same priority and type, sort by ID (alphanumeric).
 */
function sortLayers(layers: DescriptionLayer[]): DescriptionLayer[] {
    return [...layers].sort((a, b) => {
        // Primary sort: priority (descending - higher priority rendered first)
        if (a.priority !== b.priority) {
            return b.priority - a.priority
        }

        // Secondary sort: layer type order
        const typeOrderDiff = LAYER_TYPE_ORDER[a.layerType] - LAYER_TYPE_ORDER[b.layerType]
        if (typeOrderDiff !== 0) {
            return typeOrderDiff
        }

        // Tertiary sort: ID (alphanumeric)
        return a.id.localeCompare(b.id)
    })
}

/**
 * Convert markdown to HTML and sanitize.
 * Returns sanitized HTML safe for rendering with dangerouslySetInnerHTML.
 */
function processContent(content: string, onXSSDetected?: (original: string, sanitized: string) => void): string {
    // Convert markdown to HTML (synchronous parse)
    // Note: marked.parse returns string when called synchronously
    const html = marked.parse(content) as string

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
 * Get display label for layer type (for dev/debugging, not shown in production UI).
 */
function getLayerTypeLabel(layerType: LayerType): string {
    switch (layerType) {
        case 'base':
            return 'Base'
        case 'ambient':
            return 'Ambient'
        case 'dynamic':
            return 'Dynamic'
        default:
            return 'Unknown'
    }
}

/**
 * DescriptionRenderer
 * Main component for rendering composable description layers.
 */
export default function DescriptionRenderer({ layers, className, onXSSDetected }: DescriptionRendererProps): React.ReactElement {
    // Sort and process layers
    const processedLayers = useMemo(() => {
        const sorted = sortLayers(layers)
        return sorted
            .filter((layer) => layer.content.trim().length > 0) // Skip empty layers
            .map((layer) => ({
                id: layer.id,
                layerType: layer.layerType,
                priority: layer.priority,
                html: processContent(layer.content, onXSSDetected)
            }))
    }, [layers, onXSSDetected])

    // Handle no layers case
    if (processedLayers.length === 0) {
        return (
            <div className={['text-responsive-sm text-slate-400 italic', className].filter(Boolean).join(' ')} role="status">
                No description available.
            </div>
        )
    }

    // Single layer optimization (no composition wrapper needed)
    if (processedLayers.length === 1) {
        const layer = processedLayers[0]
        return (
            <div
                className={['text-responsive-sm text-slate-300 leading-relaxed', className].filter(Boolean).join(' ')}
                dangerouslySetInnerHTML={{ __html: layer.html }}
            />
        )
    }

    // Multiple layers: render with composition
    return (
        <div className={['space-y-3', className].filter(Boolean).join(' ')}>
            {processedLayers.map((layer) => (
                <div
                    key={layer.id}
                    className="text-responsive-sm text-slate-300 leading-relaxed"
                    data-layer-type={layer.layerType}
                    data-layer-priority={layer.priority}
                    dangerouslySetInnerHTML={{ __html: layer.html }}
                    aria-label={`${getLayerTypeLabel(layer.layerType)} layer`}
                />
            ))}
        </div>
    )
}
