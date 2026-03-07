/**
 * Exit Description Validator
 *
 * Validates AI-generated exit descriptions against the Exit Language Contract
 * (docs/architecture/exit-language-contract.md). Implements checks EL-01 through EL-09.
 *
 * Design:
 * - Fail-fast: first failing check triggers rejection; subsequent checks are skipped.
 * - Stateless: no world-graph access; context is supplied as call parameters.
 * - Pure functions: deterministic given the same inputs.
 *
 * See also:
 * - docs/architecture/exit-language-contract.md (authoritative spec)
 * - shared/src/prompts/templates/exit-description-tailor.json (AI prompt contract)
 */

import { z } from 'zod'
import type { Direction } from './domainModels.js'

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** Travel duration bucket derived from a travelDurationMs value at generation time. */
export type DurationBucket = 'threshold' | 'near' | 'moderate' | 'far' | 'distant'

/**
 * Structural path kind — stable spatial fact about the physical surface or crossing type.
 * Persisted on the exit edge; advisory to AI generation.
 */
export type PathKind = 'road' | 'track' | 'trail' | 'door' | 'gate' | 'stair' | 'ladder' | 'gap' | 'ford' | 'passage'

/**
 * Topographic grade hint — stable spatial fact about elevation change.
 * Persisted on the exit edge. `ascending` or `descending` unlocks vertical-motion verbs.
 */
export type Grade = 'ascending' | 'descending' | 'level'

/**
 * Spatial transition type — governs threshold vs journey language selection.
 * Persisted on the exit edge; takes precedence over duration bucket for threshold classification.
 */
export type TransitionKind = 'outdoor-to-indoor' | 'indoor-to-outdoor' | 'above-to-below' | 'below-to-above' | 'water-crossing' | 'open-air'

/**
 * Ephemeral visibility / access state — generation-only context; MUST NOT be persisted on edge.
 * Represents time-of-day or situational visibility that changes independently of the edge.
 */
export type Occlusion = 'open' | 'dim' | 'obscured' | 'sealed'

/**
 * Exit Language Contract check identifiers.
 * Correspond to checks defined in docs/architecture/exit-language-contract.md §5.1.
 */
export type ExitDescriptionCheckId = 'EL-01' | 'EL-02' | 'EL-03' | 'EL-04' | 'EL-05' | 'EL-06' | 'EL-07' | 'EL-08' | 'EL-09'

// ---------------------------------------------------------------------------
// JSON response schema (AI output contract)
// ---------------------------------------------------------------------------

/**
 * JSON response schema for exit description tailoring.
 *
 * The AI must return a JSON object with exactly these two fields. Both descriptions
 * must satisfy the Exit Language Contract's length bounds (EL-01, EL-02).
 *
 * - `forward`:  description as seen from the origin, looking toward the destination.
 * - `backward`: description as seen from the destination, looking back toward the origin.
 *
 * Output is narration — spatial glue on the graph edge, not canonical state.
 */
export const ExitDescriptionResponseSchema = z.object({
    /** Exit description from origin side, looking toward destination. Max 120 chars. */
    forward: z
        .string()
        .min(15, 'Forward exit description is too short (minimum 15 characters)')
        .max(120, 'Forward exit description exceeds maximum length (120 characters)'),
    /** Return exit description from destination side, looking back toward origin. Max 120 chars. */
    backward: z
        .string()
        .min(15, 'Backward exit description is too short (minimum 15 characters)')
        .max(120, 'Backward exit description exceeds maximum length (120 characters)')
})

export type ExitDescriptionResponse = z.infer<typeof ExitDescriptionResponseSchema>

// ---------------------------------------------------------------------------
// Validation types
// ---------------------------------------------------------------------------

/** A single failing check with its identifier and human-readable reason. */
export interface ExitDescriptionCheckResult {
    checkId: ExitDescriptionCheckId
    reason: string
}

/**
 * Input for exit description text validation.
 *
 * Provide as much context as is available at generation time; absent optional hints
 * apply conservative defaults (see individual check descriptions).
 */
export interface ExitDescriptionValidationInput {
    /** The generated exit description text to validate. */
    text: string
    /** The exit direction this description belongs to. */
    direction: Direction
    /** Travel duration bucket (derived from travelDurationMs). */
    durationBucket?: DurationBucket
    /**
     * Topographic grade hint. When absent or `level`, climbing/descending verbs are
     * forbidden on cardinal/diagonal exits (EL-06).
     */
    grade?: Grade
    /**
     * Destination location name. When provided, its constituent tokens are allowed
     * as proper nouns in the text (EL-07, EL-08). When absent, all mid-sentence
     * title-case tokens are rejected (stub-destination strictness).
     */
    destinationName?: string
    /**
     * Additional tokens allowed in the text (e.g., from origin/destination snippets).
     * Used by EL-07 to permit known proper nouns from the generation context.
     */
    contextTokens?: string[]
}

/** Result returned by `validateExitDescription`. */
export interface ExitDescriptionValidationResult {
    /** `true` only when all checks EL-01 through EL-09 pass. */
    valid: boolean
    /** First failing check (fail-fast; `undefined` when valid). */
    failingCheck?: ExitDescriptionCheckResult
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

/** Cardinal and diagonal directions — horizontal movement implied. */
const CARDINAL_DIRECTIONS = new Set<Direction>(['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'])

/** Threshold directions — immediate interior/exterior transition. */
const THRESHOLD_DIRECTIONS = new Set<Direction>(['in', 'out'])

/**
 * Direction keywords in title-case. These are permitted mid-sentence title-case tokens
 * and must not be flagged as canon-creep proper nouns (EL-07).
 */
const DIRECTION_TITLE_CASE = new Set([
    'North',
    'South',
    'East',
    'West',
    'Northeast',
    'Northwest',
    'Southeast',
    'Southwest',
    'Up',
    'Down',
    'In',
    'Out'
])

/** Road/path/journey language forbidden for `in`/`out` exits (EL-05). */
const EL05_ROAD_PATTERN = /\b(road|trail|track|journey|walk|ride)\b/i

/** Climbing/descending verbs forbidden on level cardinal/diagonal exits (EL-06). */
const EL06_CLIMB_PATTERN =
    /\b(climb|climbs|climbed|climbing|ascend|ascends|ascended|ascending|descend|descends|descended|descending|scale|scales|scaled|scaling)\b/i

/** Explicit numeric duration pattern forbidden in all exit descriptions (EL-04). */
const EL04_DURATION_PATTERN = /\b\d+\s*(minute|hour|day|second|min|hr)s?\b/i

/**
 * Weather adjectives and nouns that must not appear in exit descriptions (EL-09).
 * Exit text must remain true across all ambient-layer overlays; weather is overlay content.
 */
const EL09_WEATHER_TERMS = new Set([
    'fog',
    'foggy',
    'mist',
    'misty',
    'rain',
    'rainy',
    'snow',
    'snowy',
    'storm',
    'stormy',
    'wind',
    'windy',
    'cloud',
    'cloudy',
    'overcast',
    'drizzle',
    'drizzly',
    'haze',
    'hazy',
    'ice',
    'icy',
    'frost',
    'frosty',
    'sleet',
    'thunder',
    'lightning'
])

/**
 * Time-of-day terms that must not appear in exit descriptions (EL-09).
 * Temporal context is ambient-layer content, not spatial-edge content.
 */
const EL09_TIMEOFDAY_TERMS = new Set([
    'morning',
    'evening',
    'dusk',
    'dawn',
    'midnight',
    'noon',
    'afternoon',
    'nightfall',
    'sunrise',
    'sunset',
    'twilight',
    'moonlit',
    'moonlight',
    'sunlit',
    'sunlight',
    'starlit',
    'starlight',
    'nighttime',
    'daytime',
    'daybreak'
])

// ---------------------------------------------------------------------------
// Individual check implementations
// ---------------------------------------------------------------------------

function checkEL01(text: string): ExitDescriptionCheckResult | null {
    if (text.length > 120) {
        return {
            checkId: 'EL-01',
            reason: `Text length ${text.length} exceeds hard maximum of 120 characters`
        }
    }
    return null
}

function checkEL02(text: string): ExitDescriptionCheckResult | null {
    if (text.length < 15) {
        return {
            checkId: 'EL-02',
            reason: `Text length ${text.length} is below minimum of 15 characters (guards against empty/stub output)`
        }
    }
    return null
}

function checkEL03(text: string): ExitDescriptionCheckResult | null {
    // Count sentence-terminal punctuation at phrase-end positions (followed by space or EOS).
    // This avoids false positives on abbreviations like "Dr." or "St." mid-sentence.
    const matches = text.match(/[.!?](?:\s|$)/g)
    const count = matches?.length ?? 0
    if (count > 1) {
        return {
            checkId: 'EL-03',
            reason: `Text contains ${count} sentence-terminal punctuation marks; must be a single sentence`
        }
    }
    return null
}

function checkEL04(text: string): ExitDescriptionCheckResult | null {
    if (EL04_DURATION_PATTERN.test(text)) {
        return {
            checkId: 'EL-04',
            reason: 'Text contains an explicit numeric duration (e.g., "five minutes", "2 hours")'
        }
    }
    return null
}

function checkEL05(text: string, direction: Direction): ExitDescriptionCheckResult | null {
    if (!THRESHOLD_DIRECTIONS.has(direction)) return null
    if (EL05_ROAD_PATTERN.test(text)) {
        return {
            checkId: 'EL-05',
            reason: `Direction '${direction}' is a threshold transition; text must not use road/path/journey language (road, trail, track, journey, walk, ride)`
        }
    }
    return null
}

function checkEL06(text: string, direction: Direction, grade: Grade | undefined): ExitDescriptionCheckResult | null {
    // Only applies to cardinal and diagonal directions (EL-06 spec scope).
    if (!CARDINAL_DIRECTIONS.has(direction)) return null
    // 'ascending' or 'descending' grade explicitly unlocks vertical-motion language.
    if (grade === 'ascending' || grade === 'descending') return null
    if (EL06_CLIMB_PATTERN.test(text)) {
        return {
            checkId: 'EL-06',
            reason: `Direction '${direction}' has no ascending/descending grade hint; text must not use climbing/descending verbs`
        }
    }
    return null
}

/**
 * Extract title-case tokens that appear mid-sentence (i.e., not the first token
 * in the text and not a recognised direction keyword).
 *
 * A title-case token matches /^[A-Z][a-z]/ after stripping surrounding punctuation.
 */
function extractMidSentenceProperNouns(text: string): string[] {
    const tokens = text.split(/\s+/)
    const found: string[] = []
    let isFirst = true
    for (const raw of tokens) {
        // Strip leading/trailing non-alpha characters to get the bare word.
        const token = raw.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')
        if (!token) continue
        if (isFirst) {
            isFirst = false
            continue // sentence-start word is exempt
        }
        if (/^[A-Z][a-z]/.test(token) && !DIRECTION_TITLE_CASE.has(token)) {
            found.push(token)
        }
    }
    return found
}

/** Build the set of allowed title-case tokens from the generation context. */
function buildAllowedTokenSet(destinationName: string | undefined, contextTokens: string[] | undefined): Set<string> {
    const allowed = new Set<string>()
    if (destinationName) {
        for (const t of destinationName.split(/[\s,.\-–—]+/)) {
            if (t) allowed.add(t)
        }
    }
    if (contextTokens) {
        for (const entry of contextTokens) {
            for (const t of entry.split(/[\s,.\-–—]+/)) {
                if (t) allowed.add(t)
            }
        }
    }
    return allowed
}

function checkEL07(
    text: string,
    destinationName: string | undefined,
    contextTokens: string[] | undefined
): ExitDescriptionCheckResult | null {
    const properNouns = extractMidSentenceProperNouns(text)
    if (properNouns.length === 0) return null
    const allowed = buildAllowedTokenSet(destinationName, contextTokens)
    const unknown = properNouns.filter((n) => !allowed.has(n))
    if (unknown.length > 0) {
        return {
            checkId: 'EL-07',
            reason: `Text introduces proper noun(s) absent from the provided generation context: ${unknown.join(', ')}`
        }
    }
    return null
}

function checkEL08(text: string, destinationName: string | undefined): ExitDescriptionCheckResult | null {
    // When destinationName is absent the destination is a stub; ban ALL mid-sentence
    // title-case tokens regardless of contextTokens (EL-08 is stricter than EL-07).
    if (destinationName !== undefined) return null
    const properNouns = extractMidSentenceProperNouns(text)
    if (properNouns.length > 0) {
        return {
            checkId: 'EL-08',
            reason: `Destination is absent or a stub; text must not introduce any place-name tokens: ${properNouns.join(', ')}`
        }
    }
    return null
}

function checkEL09(text: string): ExitDescriptionCheckResult | null {
    const words = text.toLowerCase().split(/\W+/)
    for (const word of words) {
        if (!word) continue
        if (EL09_WEATHER_TERMS.has(word)) {
            return {
                checkId: 'EL-09',
                reason: `Text contains forbidden weather term: '${word}' (use ambient layers for atmospheric context)`
            }
        }
        if (EL09_TIMEOFDAY_TERMS.has(word)) {
            return {
                checkId: 'EL-09',
                reason: `Text contains forbidden time-of-day term: '${word}' (use ambient layers for temporal context)`
            }
        }
    }
    return null
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

/**
 * Validate an AI-generated exit description against the Exit Language Contract.
 *
 * Checks execute in order EL-01 → EL-09 (fail-fast). The first failing check
 * triggers rejection; subsequent checks are skipped. This matches the ordering
 * specified in docs/architecture/exit-language-contract.md §5.2.
 *
 * @param input - Validation inputs: text, direction, and optional spatial hints.
 * @returns `{ valid: true }` on success, or `{ valid: false, failingCheck }` on failure.
 */
export function validateExitDescription(input: ExitDescriptionValidationInput): ExitDescriptionValidationResult {
    const { text, direction, grade, destinationName, contextTokens } = input

    const checks: Array<() => ExitDescriptionCheckResult | null> = [
        () => checkEL01(text),
        () => checkEL02(text),
        () => checkEL03(text),
        () => checkEL04(text),
        () => checkEL05(text, direction),
        () => checkEL06(text, direction, grade),
        () => checkEL07(text, destinationName, contextTokens),
        () => checkEL08(text, destinationName),
        () => checkEL09(text)
    ]

    for (const check of checks) {
        const result = check()
        if (result) {
            return { valid: false, failingCheck: result }
        }
    }

    return { valid: true }
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Convert a raw `travelDurationMs` value to the appropriate `DurationBucket`.
 *
 * Bucket boundaries are defined in docs/architecture/exit-language-contract.md §1.1:
 * - threshold  < 15 000 ms
 * - near       15 000 – 299 999 ms
 * - moderate   300 000 – 1 799 999 ms   (default when ms is absent)
 * - far        1 800 000 – 14 399 999 ms
 * - distant    ≥ 14 400 000 ms
 *
 * `in`/`out` exits should independently be clamped to `threshold` by the caller
 * unless a `transitionKind` hint explicitly overrides this (see the contract §1.1 note).
 *
 * @param ms - Travel duration in milliseconds, or `undefined` when not stored on edge.
 * @returns The matching DurationBucket; defaults to `'moderate'` when ms is absent.
 */
export function travelDurationMsToBucket(ms: number | undefined): DurationBucket {
    if (ms === undefined) return 'moderate'
    if (ms < 15_000) return 'threshold'
    if (ms < 300_000) return 'near'
    if (ms < 1_800_000) return 'moderate'
    if (ms < 14_400_000) return 'far'
    return 'distant'
}
