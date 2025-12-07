/**
 * Types for Description Composer Service
 *
 * These types support deterministic description composition from layered content.
 */

/**
 * Context information for determining which layers are active
 */
export interface ViewContext {
    /** Current weather type (e.g., 'rain', 'clear', 'snow') */
    weather?: string
    /** Time bucket (e.g., 'dawn', 'day', 'dusk', 'night') */
    time?: string
    /** Season (e.g., 'spring', 'summer', 'fall', 'winter') */
    season?: string
    /** ISO timestamp of the view request */
    timestamp: string
}

/**
 * Provenance information for a single layer
 */
export interface LayerProvenance {
    /** Layer unique ID */
    id: string
    /** Layer type */
    layerType: string
    /** Priority value */
    priority: number
    /** Whether this layer was superseded by another */
    superseded?: boolean
    /** ISO timestamp when layer was authored */
    authoredAt: string
}

/**
 * Complete provenance metadata for a compiled description
 */
export interface CompiledProvenance {
    /** Location ID this compilation is for */
    locationId: string
    /** Layers that contributed to this compilation (in assembly order) */
    layers: LayerProvenance[]
    /** Context used for layer filtering */
    context: ViewContext
    /** ISO timestamp when compilation occurred */
    compiledAt: string
}

/**
 * Result of compiling all description layers for a location
 */
export interface CompiledDescription {
    /** Plain text assembled from all active layers */
    text: string
    /** HTML version (markdown-to-HTML conversion) */
    html: string
    /** Provenance metadata showing which layers contributed */
    provenance: CompiledProvenance
}

/**
 * Options for description compilation
 */
export interface CompileOptions {
    /**
     * The canonical base description for the location (from Location.description).
     * This is the immutable foundation that layers are applied on top of.
     * Layers in the repository (dynamic, ambient, enhancement) modify/augment this base.
     */
    baseDescription?: string
}
