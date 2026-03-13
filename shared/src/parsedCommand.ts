/**
 * Types for the Intent Parser MCP server (PI-0 heuristic baseline).
 *
 * These types are shared between the TypeScript backend (intent-parser handler)
 * and any downstream consumers (Python Agent Framework, frontend).
 *
 * See: docs/architecture/intent-parser-agent-framework.md
 */

import type { Direction } from './domainModels.js'

/** Discriminated union of recognised action verbs. */
export type IntentVerb = 'move' | 'attack' | 'throw' | 'examine' | 'take' | 'communicate' | 'defend' | 'use_item' | 'flee' | 'interact'

/** Reason why an intent could not be fully resolved. */
export type AmbiguityIssueType = 'unknown_entity' | 'unknown_item' | 'ambiguous_direction' | 'multi_interpretation'

/** A flagged ambiguity within a command. Non-critical ambiguities do not block execution. */
export type AmbiguityIssue = {
    /** Stable identifier for this ambiguity within the command. */
    id: string
    /** The span of text that triggered the ambiguity (e.g. "rock", "seagull"). */
    spanText: string
    /** Classification of the ambiguity. */
    issueType: AmbiguityIssueType
    /** Human-readable resolution suggestions (for agent or player prompting). */
    suggestions: string[]
    /** True if this ambiguity must be resolved before execution can proceed. */
    critical: boolean
}

/**
 * A single parsed intent extracted from a player command.
 *
 * Confidence ranges from 0 (uncertain) to 1 (certain).
 * Sequence order starts at 0 for the first action.
 */
export type Intent = {
    /** Stable identifier for this intent within the command. */
    id: string
    /** The primary action verb. */
    verb: IntentVerb
    /** Execution order (0 = first). */
    order: number
    /** Optional group key for intents that should execute concurrently at the same order position. */
    concurrencyGroup?: string

    /** Resolved target entity GUID (if known). */
    targetEntityId?: string
    /** Raw surface text for an unresolved target (e.g. "seagull"). */
    surfaceTargetName?: string

    /** Resolved item GUID used as the object (if known). */
    objectItemId?: string
    /** Raw surface text for an unresolved item (e.g. "rock"). */
    surfaceItemName?: string

    /** Direction for movement intents. */
    direction?: Direction

    /** Quantity modifier (e.g. "throw 3 rocks" → 3). */
    quantity?: number
    /** Adverbial modifiers (e.g. ['carefully', 'chase']). */
    modifiers?: string[]
    /** High-level tactical role hint for the agent (e.g. 'pursuit', 'distraction'). */
    tacticalRole?: string
    /** Conditional constraints (e.g. ['while_defending']). */
    conditions?: string[]

    /** Parsing confidence score (0–1). */
    confidence: number
    /** Inline ambiguities scoped to this intent. */
    issues?: AmbiguityIssue[]
}

/**
 * The structured result of parsing a raw player command string.
 *
 * Returned by the intent-parser MCP tool (`parse-command`).
 */
export type ParsedCommand = {
    /** The original, unmodified input text. */
    rawText: string
    /** Extracted intents in execution order. */
    intents: Intent[]
    /** Top-level ambiguities that apply across multiple intents. */
    ambiguities?: AmbiguityIssue[]
    /** True when at least one critical ambiguity blocks execution. */
    needsClarification: boolean
    /** Parser version for schema evolution tracking. */
    parseVersion: string
    /** Player identifier (may be empty string if not provided). */
    playerId: string
    /** Current location identifier (may be empty string if not provided). */
    locationId: string
    /** ISO-8601 timestamp of when the command was parsed. */
    createdAt: string
}
