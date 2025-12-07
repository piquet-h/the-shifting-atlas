/**
 * Description Composer Service - Deterministic Description Layer Compilation
 *
 * Implements the tokenless layered description system for narrative stability
 * with contextual variation. Compiles base descriptions with active layers
 * while applying supersede masking and maintaining provenance.
 *
 * Design: See docs/modules/description-layering-and-variation.md
 *
 * Key behaviors:
 * - Deterministic assembly order: base → structural → ambient → enhancement
 * - Supersede masking: structural layers can hide base sentences
 * - Context filtering: only weather/time-appropriate layers are active
 * - Provenance tracking: records which layers contributed
 */

import type { DescriptionLayer as BaseDescriptionLayer } from '@piquet-h/shared/types/layerRepository'
import { inject, injectable } from 'inversify'
import { marked } from 'marked'
import type { ILayerRepository } from '../repos/layerRepository.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { CompiledDescription, CompiledProvenance, CompileOptions, LayerProvenance, ViewContext } from './types.js'

/**
 * Extended layer type with attributes support for filtering and supersedes.
 * Base DescriptionLayer from shared package doesn't include attributes yet.
 */
export interface DescriptionLayer extends BaseDescriptionLayer {
    attributes?: {
        weatherType?: string
        timeBucket?: string
        supersedes?: string[]
        [key: string]: unknown
    }
}

/**
 * Mapping from simplified layer types to documented layer categories
 * 'base' → base description (immutable)
 * 'dynamic' → structural_event (long-term changes)
 * 'ambient' → ambient/weather/enhancement (contextual)
 */
const LAYER_TYPE_PRIORITY = {
    base: 1000,
    dynamic: 500, // structural events
    ambient: 100 // ambient, weather, enhancement
}

@injectable()
export class DescriptionComposer {
    constructor(
        @inject('ILayerRepository') private layerRepository: ILayerRepository,
        @inject(TelemetryService) private telemetryService: TelemetryService
    ) {}

    /**
     * Compile location description with layers applied on top.
     *
     * The baseDescription (from Location.description) is the immutable foundation.
     * Layers from the repository (dynamic, ambient, enhancement) are applied on top.
     *
     * Assembly order: base → structural (dynamic) → ambient → enhancement
     * - Base description is the canonical location prose (from options.baseDescription)
     * - Structural layers apply supersede masking to hide replaced base sentences
     * - Ambient layers are filtered by weather/time context
     * - Result is deterministic for same inputs
     *
     * @param locationId - Location GUID to compile
     * @param context - View context (weather, time, etc.)
     * @param options - Optional compilation options including baseDescription
     * @returns Compiled description with text, HTML, and provenance
     */
    async compileForLocation(locationId: string, context: ViewContext, options?: CompileOptions): Promise<CompiledDescription> {
        const startTime = Date.now()

        // The base description comes from the Location entity (options.baseDescription)
        const baseDescription = options?.baseDescription || ''

        // 1. Fetch all layers for location (these are overlays, not the base)
        const allLayers = await this.layerRepository.getLayersForLocation(locationId)

        // 2. Filter active layers based on context (excludes 'base' type layers from repo if any)
        const overlayLayers = allLayers.filter((l) => l.layerType !== 'base')
        const activeLayers = this.filterActiveLayers(overlayLayers, context)

        // 3. Apply supersede masking to base content (structural layers can mask base sentences)
        const maskedBase = this.applySupersedeMaskToBase(baseDescription, activeLayers)

        // 4. Assemble layers in deterministic order
        const { text, provenance } = this.assembleLayers(maskedBase, activeLayers, locationId, context)

        // 5. Convert to HTML
        const html = this.markdownToHtml(text)

        this.telemetryService.trackGameEvent('Description.Compile', {
            locationId,
            layerCount: allLayers.length,
            activeLayerCount: activeLayers.length,
            hasBaseDescription: !!baseDescription,
            supersededSentences: provenance.layers.filter((l) => l.superseded).length,
            latencyMs: Date.now() - startTime
        })

        return {
            text,
            html,
            provenance: {
                ...provenance,
                compiledAt: new Date().toISOString()
            }
        }
    }

    /**
     * Filter layers to only those active in the current context.
     *
     * Ambient layers with weatherType/timeBucket attributes are only
     * included if they match the context. Layers without these attributes
     * are always included (structural events, enhancements).
     *
     * @param layers - All non-base layers
     * @param context - Current view context
     * @returns Filtered array of active layers
     */
    private filterActiveLayers(layers: DescriptionLayer[], context: ViewContext): DescriptionLayer[] {
        return layers.filter((layer) => {
            const attrs = layer.attributes || {}

            // Dynamic (structural) layers are always active
            if (layer.layerType === 'dynamic') {
                return true
            }

            // Ambient layers: check weather/time match
            if (layer.layerType === 'ambient') {
                // If weatherType specified, must match context
                if (attrs.weatherType && context.weather && attrs.weatherType !== context.weather) {
                    return false
                }

                // If timeBucket specified, must match context
                if (attrs.timeBucket && context.time && attrs.timeBucket !== context.time) {
                    return false
                }

                // If no attributes specified, always include
                return true
            }

            // Unknown layer types: include by default (defensive)
            return true
        })
    }

    /**
     * Apply supersede masking to the base description.
     *
     * Structural (dynamic) layers may specify `supersedes` attribute containing
     * an array of sentence fragments from the base description. Matching sentences
     * are removed from the base content.
     *
     * @param baseDescription - The canonical base description text (from Location.description)
     * @param activeLayers - Active layers (structural may have supersedes)
     * @returns Base content with superseded sentences removed
     */
    private applySupersedeMaskToBase(baseDescription: string, activeLayers: DescriptionLayer[]): string {
        let baseText = baseDescription

        // Collect all supersede patterns from structural (dynamic) layers
        const supersedes: string[] = []
        for (const layer of activeLayers) {
            if (layer.layerType === 'dynamic') {
                const attrs = layer.attributes || {}
                if (attrs.supersedes && Array.isArray(attrs.supersedes)) {
                    supersedes.push(...attrs.supersedes)
                }
            }
        }

        // Edge case: No supersedes → return base as-is
        if (supersedes.length === 0) {
            return baseText
        }

        // Split base into sentences (simplified: split on ., !, ?)
        // Handle both whitespace and end-of-string after punctuation
        // NOTE: This is a simplified implementation that doesn't handle complex cases like:
        // - Quoted speech: He said "Hello." She replied.
        // - Abbreviations: Dr. Smith arrived.
        // - Decimal numbers: The price is $3.50.
        // Future enhancement: Use NLP sentence tokenizer for production-grade splitting
        const parts = baseText.split(/([.!?])(?:\s+|$)/)
        const sentences: string[] = []

        // Reconstruct sentences with their endings
        for (let i = 0; i < parts.length; i++) {
            if (i % 2 === 0) {
                // Content part
                if (i + 1 < parts.length && /[.!?]/.test(parts[i + 1])) {
                    // Combine with punctuation
                    sentences.push(parts[i] + parts[i + 1])
                } else if (parts[i].trim().length > 0) {
                    // Last part without punctuation
                    sentences.push(parts[i])
                }
            }
        }

        // Filter out superseded sentences
        const retainedSentences: string[] = []
        for (const sentence of sentences) {
            // Check if this sentence is superseded
            // Use word-boundary matching to avoid false positives (e.g., "gate" in "investigate")
            const isSuperseded = supersedes.some((pattern) => {
                const normalized = sentence.trim().toLowerCase()
                const patternNorm = pattern.trim().toLowerCase()

                // Escape regex special characters in pattern
                const escaped = patternNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

                // Use word boundaries to match complete words/phrases
                // This prevents "gate" from matching within "investigate"
                const regex = new RegExp(`\\b${escaped}\\b`, 'i')
                return regex.test(normalized)
            })

            if (!isSuperseded) {
                retainedSentences.push(sentence)
            }
        }

        return retainedSentences.join(' ').trim()
    }

    /**
     * Assemble layers in deterministic order.
     *
     * Order: base → structural (dynamic, priority desc) → ambient (priority desc)
     * Layers are joined with proper spacing and paragraph breaks.
     *
     * @param maskedBase - Base content with supersedes applied
     * @param activeLayers - Active non-base layers
     * @param locationId - Location ID for provenance
     * @param context - View context for provenance
     * @returns Assembled text and provenance metadata
     */
    private assembleLayers(
        maskedBase: string,
        activeLayers: DescriptionLayer[],
        locationId: string,
        context: ViewContext
    ): { text: string; provenance: CompiledProvenance } {
        const sections: string[] = []
        const provenanceLayers: LayerProvenance[] = []

        // Add base (if not fully superseded)
        if (maskedBase.trim().length > 0) {
            sections.push(maskedBase)
        }

        // Sort layers by type priority, then by priority field, then by ID
        const sorted = [...activeLayers].sort((a, b) => {
            const typeA = LAYER_TYPE_PRIORITY[a.layerType as keyof typeof LAYER_TYPE_PRIORITY] || 0
            const typeB = LAYER_TYPE_PRIORITY[b.layerType as keyof typeof LAYER_TYPE_PRIORITY] || 0

            if (typeA !== typeB) {
                return typeB - typeA // Higher type priority first
            }

            if (a.priority !== b.priority) {
                return b.priority - a.priority // Higher priority first
            }

            return a.id.localeCompare(b.id) // Deterministic tie-break
        })

        // Add sorted layers with proper paragraph spacing
        // NOTE: Using double newline for paragraph separation in markdown format
        // This creates visual breaks between layer content while maintaining readability
        for (const layer of sorted) {
            sections.push(layer.content)

            provenanceLayers.push({
                id: layer.id,
                layerType: layer.layerType,
                priority: layer.priority,
                authoredAt: layer.authoredAt
            })
        }

        const text = sections.join('\n\n').trim()

        return {
            text,
            provenance: {
                locationId,
                layers: provenanceLayers,
                context,
                compiledAt: new Date().toISOString()
            }
        }
    }

    /**
     * Convert markdown text to HTML.
     *
     * Uses marked library with synchronous parsing (async: false).
     * Sanitization is not performed here (should be handled at render time).
     *
     * @param markdown - Markdown text
     * @returns HTML string
     */
    private markdownToHtml(markdown: string): string {
        if (!markdown || markdown.trim().length === 0) {
            return ''
        }

        try {
            // Explicitly use synchronous mode (async: false)
            // marked.parse returns string when async is false, Promise<string> when true
            const result = marked.parse(markdown, { async: false })

            // Type guard: should be string in sync mode
            if (typeof result !== 'string') {
                this.telemetryService.trackGameEvent('Description.Markdown.UnexpectedAsync', {
                    type: typeof result
                })
                return markdown
            }

            return result
        } catch (error) {
            // Log error via telemetry service
            this.telemetryService.trackGameEvent('Description.Markdown.ConversionError', {
                error: error instanceof Error ? error.message : String(error)
            })
            return markdown
        }
    }
}
