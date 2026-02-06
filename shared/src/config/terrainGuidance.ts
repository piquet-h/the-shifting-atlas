/**
 * Terrain Guidance Configuration System
 *
 * Provides contextual hints to AI for expected exit patterns during spatial generation.
 * Terrain types guide (not constrain) AI decisions, allowing narrative overrides.
 *
 * Usage:
 * - BatchGenerateHandler: Uses defaultDirections to determine neighbor stub count
 * - AIDescriptionService: Includes promptHint in system prompt as guidance
 * - ExitInferenceService: Uses typicalExitCount to validate inferred exits (warn if significantly different)
 *
 * See: docs/design-modules/world-spatial-generation.md (Section: Terrain Guidance System)
 *      docs/architecture/world-spatial-generation-architecture.md (Section: Configuration)
 */

import { type Direction, type TerrainType } from '../domainModels.js'

/**
 * Exit pattern classification for terrain types.
 * Provides high-level hint about expected spatial topology.
 */
export type ExitPattern = 'cardinal' | 'linear' | 'radial' | 'custom'

/**
 * Terrain guidance configuration schema.
 * All fields are hints/guidance for AI, not rigid rules.
 */
export interface TerrainGuidanceConfig {
    /** Expected number of exits for this terrain type (used for validation warnings) */
    typicalExitCount: number

    /** Hint about spatial arrangement of exits */
    exitPattern: ExitPattern

    /** Natural language guidance for AI description generation (max 500 chars) */
    promptHint: string

    /**
     * Suggested default exit directions.
     * Empty array = AI must explicitly justify all exits in description.
     * Non-empty = BatchGenerateHandler creates neighbor stubs in these directions.
     */
    defaultDirections: Direction[]
}

/**
 * Array of all terrain types for validation and iteration.
 */
export const TERRAIN_TYPES: readonly TerrainType[] = ['open-plain', 'dense-forest', 'hilltop', 'riverbank', 'narrow-corridor'] as const

/**
 * Terrain guidance configuration map.
 * Maps each TerrainType to its spatial generation guidance.
 *
 * Design principles:
 * - Guidance, not rigid rules: AI can override based on narrative context
 * - Prompt hints stay concise (<500 chars) for AI context window efficiency
 * - Empty defaultDirections signals "AI must justify all exits"
 * - typicalExitCount used for validation warnings, not enforcement
 */
export const TERRAIN_GUIDANCE: Record<TerrainType, TerrainGuidanceConfig> = {
    'open-plain': {
        typicalExitCount: 4,
        exitPattern: 'cardinal',
        promptHint:
            'Open plains typically allow travel in multiple directions unless narrative obstacles (fog, cliffs, swamps) are present.',
        defaultDirections: ['north', 'south', 'east', 'west']
    },
    'dense-forest': {
        typicalExitCount: 2,
        exitPattern: 'linear',
        promptHint: 'Dense forests may limit visible exits to clearings or paths, but clever players might detect game trails.',
        defaultDirections: [] // AI must explicitly justify exits
    },
    hilltop: {
        typicalExitCount: 5,
        exitPattern: 'radial',
        promptHint: 'Hilltops offer panoramic views suggesting multiple descent routes unless sheer cliffs block specific directions.',
        defaultDirections: ['north', 'south', 'east', 'west', 'down']
    },
    riverbank: {
        typicalExitCount: 3,
        exitPattern: 'custom',
        promptHint:
            'Riverbanks permit travel parallel to water flow; perpendicular crossings require bridges or fords. Consider current direction.',
        defaultDirections: [] // Riverbank directions depend on water flow orientation (AI contextual decision)
    },
    'narrow-corridor': {
        typicalExitCount: 2,
        exitPattern: 'linear',
        promptHint: 'Corridors permit forward/back movement, but consider alcoves or climbing opportunities for additional exits.',
        defaultDirections: [] // AI must justify exits based on corridor description
    }
}

/**
 * Type guard for TerrainType validation.
 */
export function isTerrainType(value: string): value is TerrainType {
    return (TERRAIN_TYPES as readonly string[]).includes(value)
}

/**
 * Retrieve terrain guidance configuration.
 * Throws if terrain type is not defined (fail-fast, no silent fallback).
 *
 * @param terrain - The terrain type to look up
 * @returns Terrain guidance configuration
 * @throws Error if terrain type is not found
 */
export function getTerrainGuidance(terrain: TerrainType): TerrainGuidanceConfig {
    const config = TERRAIN_GUIDANCE[terrain]
    if (!config) {
        throw new Error(`Terrain type '${terrain}' not found in TERRAIN_GUIDANCE configuration`)
    }
    return config
}

/**
 * Validate a terrain guidance configuration.
 * Checks schema constraints (prompt hint length, valid exit pattern, etc.)
 *
 * @param terrain - Terrain type name (for error messages)
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateTerrainGuidanceConfig(terrain: string, config: TerrainGuidanceConfig): void {
    if (config.typicalExitCount < 0) {
        throw new Error(`${terrain}: typicalExitCount must be >= 0`)
    }

    if (!['cardinal', 'linear', 'radial', 'custom'].includes(config.exitPattern)) {
        throw new Error(`${terrain}: exitPattern must be one of: cardinal, linear, radial, custom`)
    }

    if (config.promptHint.length === 0) {
        throw new Error(`${terrain}: promptHint cannot be empty`)
    }

    if (config.promptHint.length > 500) {
        throw new Error(
            `${terrain}: promptHint exceeds 500 character limit (${config.promptHint.length} chars). Keep hints concise for AI context window efficiency.`
        )
    }

    if (!Array.isArray(config.defaultDirections)) {
        throw new Error(`${terrain}: defaultDirections must be an array`)
    }
}

// Validate all configurations at module load time (fail-fast on misconfiguration)
for (const [terrain, config] of Object.entries(TERRAIN_GUIDANCE)) {
    validateTerrainGuidanceConfig(terrain, config)
}
