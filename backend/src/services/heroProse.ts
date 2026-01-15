/**
 * Hero-Prose Layer Utilities
 *
 * Utilities for identifying and selecting hero-prose layers according to the
 * hero-prose layer convention.
 *
 * See: docs/architecture/hero-prose-layer-convention.md
 */

import type { DescriptionLayer } from '@piquet-h/shared/types/layerRepository'

/**
 * Identifies if a layer is a valid hero-prose layer
 *
 * Hero-prose layers must have:
 * - layerType: 'dynamic'
 * - metadata.replacesBase: true
 * - metadata.role: 'hero'
 * - metadata.promptHash: non-empty string
 *
 * @param layer - Description layer to check
 * @returns true if layer is a valid hero-prose layer
 */
export function isHeroProse(layer: DescriptionLayer): boolean {
    return (
        layer.layerType === 'dynamic' &&
        layer.metadata?.replacesBase === true &&
        layer.metadata?.role === 'hero' &&
        typeof layer.metadata?.promptHash === 'string' &&
        layer.metadata.promptHash.length > 0
    )
}

/**
 * Selects the active hero-prose layer from multiple candidates
 *
 * Selection priority:
 * 1. Most recent authoredAt timestamp (newer prompt templates produce better prose)
 * 2. Lexicographic sort by id (deterministic tie-breaker)
 *
 * @param layers - Array of description layers to search
 * @returns The selected hero-prose layer, or null if none found
 */
export function selectHeroProse(layers: DescriptionLayer[]): DescriptionLayer | null {
    const heroProseLayers = layers.filter(isHeroProse)

    if (heroProseLayers.length === 0) {
        return null
    }

    // Sort by authoredAt descending (most recent first), then by id ascending (lexicographic)
    const sorted = [...heroProseLayers].sort((a, b) => {
        // Most recent first
        const timeCompare = new Date(b.authoredAt).getTime() - new Date(a.authoredAt).getTime()
        if (timeCompare !== 0) {
            return timeCompare
        }
        // Lexicographic tie-break
        return a.id.localeCompare(b.id)
    })

    return sorted[0]
}

/**
 * Validates hero-prose content according to convention constraints
 *
 * Valid content must:
 * - Not be empty or whitespace-only
 * - Not exceed 1200 character length limit
 *
 * @param content - Hero-prose text content to validate
 * @returns true if content is valid
 */
export function isValidHeroProseContent(content: string): boolean {
    // Empty or whitespace-only is invalid
    if (!content || content.trim().length === 0) {
        return false
    }

    // Exceeds length limit (1200 chars)
    if (content.length > 1200) {
        return false
    }

    return true
}
