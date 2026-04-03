/**
 * Frontier context types and helpers.
 *
 * Defines the structured metadata contract for pending frontier exits and
 * synthetic/future node placeholders.  These types are backend-only and are
 * derived on demand from canonical macro-geography tags; they are not stored
 * directly in the shared Location type.
 *
 * Canonicality boundary
 * ─────────────────────
 * Structured frontier metadata is the authoritative representation of what
 * lies beyond an unresolved exit.  It is derived deterministically from atlas
 * tags (`macro:area:`, `macro:route:`, `macro:water:`).  AI-authored narrative
 * cues (e.g. "hills visible to the west") are candidates until explicitly
 * promoted to atlas tags; they must never override this structured contract.
 *
 * See docs/architecture/frontier-context-contract.md for the full contract.
 */

import type { Direction } from '@piquet-h/shared'

/**
 * Structural archetype of a pending frontier exit destination.
 *
 * Used to distinguish structural classes in map/debug payloads and to
 * select appropriate narration and name-generation strategies.
 *
 * Precedence when inferring from direction:
 *   1. interior  — `in` / `out` (structural entry into a building or enclosed space)
 *   2. vertical  — `up` / `down` (elevation change: stairs, cliff, ladder)
 *   3. waterfront — cardinal/diagonal with water context present
 *   4. overland   — cardinal/diagonal without water context (default)
 *   5. portal     — reserved for future use (magical/instantaneous transition)
 */
export type FrontierStructuralArchetype = 'overland' | 'waterfront' | 'interior' | 'vertical' | 'portal'

/**
 * Structured context metadata for a single pending exit direction.
 *
 * Carries deterministic, inspectable frontier context derived from canonical
 * macro-geography tags on the source node.  Downstream consumers (map
 * visualisation, narration, batch generation) use this instead of parsing
 * human-readable reason strings.
 *
 * All optional fields are absent when no atlas information is available; the
 * mandatory `structuralArchetype` is always present and always machine-readable.
 */
export interface PendingExitMetadata {
    /** Structural archetype of the unresolved destination. Always present. */
    structuralArchetype: FrontierStructuralArchetype
    /**
     * Atlas macro area reference key (from `macro:area:<ref>` tag on source node).
     * Carries the geographic envelope the pending destination is expected to inherit.
     */
    macroAreaRef?: string
    /**
     * Atlas route lineage reference keys (from `macro:route:<ref>` tags).
     * Downstream naming and terrain selection honour these when present.
     */
    routeLineage?: string[]
    /** Directional terrain trend from the atlas directional trend profile. */
    terrainTrend?: string
    /**
     * Water/maritime semantic context (from `macro:water:<ref>` tag).
     * When present, contributes to waterfront archetype classification.
     */
    waterSemantics?: string
    /** Named barrier constraints (cliff, fiord, marsh, …) framing this exit. */
    barrierSemantics?: string[]
    /**
     * Override flags: explicit authorial overrides that suppress automated
     * atlas inheritance.  A pending exit carrying these flags must not have
     * its terrain or route context silently overwritten by nearby node cues.
     */
    overrideFlags?: {
        /** Suppress automated terrain inheritance for this direction. */
        terrainOverride?: boolean
        /** Suppress automated route-lineage inference for this direction. */
        routeOverride?: boolean
    }
}

/**
 * An environmental hint extracted from AI-generated narration.
 *
 * These are proposals only — they must never be written to atlas tags
 * automatically.  An author or tooling must review and explicitly promote a
 * proposal to a canonical `macro:area:`, route, or directional-trend entry
 * before it becomes authoritative geographic metadata.
 *
 * See docs/architecture/frontier-context-contract.md § Promotion path.
 */
export interface EnvironmentalHintProposal {
    /** Raw text fragment (sentence) containing the geographic hint. */
    text: string
    /** Inferred compass direction extracted from the text, if present (lower-case). */
    direction?: string
    /** Inferred terrain category keyword extracted from the text, if present (lower-case). */
    terrainKind?: string
}

/**
 * Infer the structural archetype for a pending exit.
 *
 * Rules are evaluated in precedence order:
 * 1. Interior direction (`in` / `out`) → `'interior'`
 * 2. Vertical direction (`up` / `down`) → `'vertical'`
 * 3. Cardinal/diagonal with a non-empty `waterContext`  → `'waterfront'`
 * 4. Otherwise → `'overland'`
 *
 * Direction-based archetypes (interior, vertical) always take precedence over
 * environmental cues like `waterContext`.
 *
 * @param direction   - Canonical exit direction.
 * @param waterContext - Optional water semantic tag value (e.g. `'fjord-sound-head'`).
 */
export function inferStructuralArchetype(direction: Direction, waterContext?: string): FrontierStructuralArchetype {
    if (direction === 'in' || direction === 'out') return 'interior'
    if (direction === 'up' || direction === 'down') return 'vertical'
    if (waterContext) return 'waterfront'
    return 'overland'
}
