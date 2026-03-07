/**
 * Exit Description Scaffold Generator
 *
 * Generates deterministic scaffold (base) exit description pairs for a graph edge.
 * The scaffold communicates placement and distance conservatively — one sentence,
 * within Exit Language Contract bounds (EL-01 through EL-09).
 *
 * Design principles:
 * - Fully deterministic: same inputs always produce the same output.
 * - No AI calls, no randomness, no external I/O.
 * - Conservative by default: suitable for stub destinations with no context.
 * - Output passes all Exit Language Contract checks when used correctly.
 *
 * Types here mirror shared/src/exitDescriptionValidator.ts. They are defined locally
 * because the published @piquet-h/shared package does not yet export them.
 * When shared is bumped and republished with exitDescriptionValidator, these local
 * definitions should be removed in favour of the shared imports.
 *
 * See:
 * - docs/architecture/exit-language-contract.md (authoritative spec)
 * - shared/src/exitDescriptionValidator.ts (types + validator)
 */

import { getOppositeDirection } from '@piquet-h/shared'
import type { Direction } from '@piquet-h/shared'

// ---------------------------------------------------------------------------
// Local type definitions (mirror shared/src/exitDescriptionValidator.ts)
// Remove when shared bumps version and exports these.
// ---------------------------------------------------------------------------

/**
 * Travel duration bucket — derived from travelDurationMs via travelDurationMsToBucket().
 *
 * | Bucket     | travelDurationMs range     |
 * |------------|---------------------------|
 * | threshold  | < 15 000 ms               |
 * | near       | 15 000 – 299 999 ms       |
 * | moderate   | 300 000 – 1 799 999 ms    |
 * | far        | 1 800 000 – 14 399 999 ms |
 * | distant    | ≥ 14 400 000 ms           |
 */
export type DurationBucket = 'threshold' | 'near' | 'moderate' | 'far' | 'distant'

/** Structural path kind hint (persisted on edge). */
export type PathKind = 'road' | 'track' | 'trail' | 'door' | 'gate' | 'stair' | 'ladder' | 'gap' | 'ford' | 'passage'

/** Topographic elevation change hint (persisted on edge). */
export type Grade = 'ascending' | 'descending' | 'level'

/** Spatial transition type hint (persisted on edge). */
export type TransitionKind = 'outdoor-to-indoor' | 'indoor-to-outdoor' | 'above-to-below' | 'below-to-above' | 'water-crossing' | 'open-air'

// ---------------------------------------------------------------------------
// travelDurationMsToBucket  (mirror of shared/src/exitDescriptionValidator.ts)
// ---------------------------------------------------------------------------

/** Default travel duration (ms) used when edge has no stored travelDurationMs. */
const DEFAULT_TRAVEL_DURATION_MS = 300_000 // 5 minutes → moderate

/** Threshold ranges (all in ms). */
const BUCKET_NEAR_LOWER = 15_000
const BUCKET_MODERATE_LOWER = 300_000
const BUCKET_FAR_LOWER = 1_800_000
const BUCKET_DISTANT_LOWER = 14_400_000

/**
 * Convert a raw travelDurationMs value to a DurationBucket.
 * Absent value (undefined/null/0) falls back to `moderate`.
 */
export function travelDurationMsToBucket(ms: number | undefined | null): DurationBucket {
    const n = ms != null && ms > 0 ? ms : DEFAULT_TRAVEL_DURATION_MS
    if (n < BUCKET_NEAR_LOWER) return 'threshold'
    if (n < BUCKET_MODERATE_LOWER) return 'near'
    if (n < BUCKET_FAR_LOWER) return 'moderate'
    if (n < BUCKET_DISTANT_LOWER) return 'far'
    return 'distant'
}

// ---------------------------------------------------------------------------
// Public scaffold types
// ---------------------------------------------------------------------------

/** Input for deterministic exit description scaffold generation. */
export interface ExitDescriptionScaffoldInput {
    /** Exit direction (cardinal, diagonal, vertical, or threshold). */
    direction: Direction
    /**
     * Travel duration bucket — controls language register.
     * Derive from `travelDurationMs` via `travelDurationMsToBucket()`.
     */
    durationBucket: DurationBucket
    /** Optional structural path kind hint. */
    pathKind?: PathKind
    /**
     * Topographic elevation change.
     * When ascending or descending, enables vertical-motion verbs for cardinal exits.
     */
    grade?: Grade
    /** Spatial transition type hint. */
    transitionKind?: TransitionKind
}

/** Scaffold output: a pair of single-sentence exit descriptions. */
export interface ExitDescriptionScaffoldResult {
    /** Forward description: origin side, looking toward destination. */
    forward: string
    /** Backward description: destination side, looking back toward origin. */
    backward: string
}

// ---------------------------------------------------------------------------
// Internal: path kind sets
// ---------------------------------------------------------------------------

/** PathKinds that force threshold register regardless of direction/bucket. */
const THRESHOLD_PATH_KINDS = new Set<PathKind>(['door', 'gate', 'gap', 'passage'])

/** PathKinds that force vertical register for up/down. */
const VERTICAL_PATH_KINDS = new Set<PathKind>(['stair', 'ladder'])

// ---------------------------------------------------------------------------
// Internal: noun selection
// ---------------------------------------------------------------------------

/** Select noun for `in`/`out` (interior) transitions. */
function interiorNoun(pathKind: PathKind | undefined): string {
    switch (pathKind) {
        case 'gate':
            return 'gate'
        case 'passage':
            return 'passage'
        case 'gap':
            return 'gap'
        default:
            return 'door'
    }
}

/** Select noun for vertical (`up`/`down`) transitions. */
function verticalNoun(pathKind: PathKind | undefined): { article: string; noun: string } {
    if (pathKind === 'ladder') return { article: 'A', noun: 'ladder' }
    return { article: '', noun: 'Stone steps' }
}

/** Select noun for cardinal/diagonal journey exits. */
function journeyNoun(pathKind: PathKind | undefined, bucket: DurationBucket): { article: string; noun: string } {
    switch (pathKind) {
        case 'road':
            return { article: 'A', noun: 'road' }
        case 'track':
            return { article: 'A', noun: 'track' }
        case 'trail':
            return { article: 'A', noun: 'trail' }
        case 'ford':
            return { article: 'A', noun: 'ford' }
        default: {
            switch (bucket) {
                case 'threshold':
                    return { article: 'A', noun: 'path' }
                case 'near':
                    return { article: 'A', noun: 'path' }
                case 'moderate':
                    return { article: 'A', noun: 'lane' }
                case 'far':
                    return { article: 'A', noun: 'track' }
                case 'distant':
                    return { article: 'The', noun: 'road' }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Internal: builders
// ---------------------------------------------------------------------------

/** Build scaffold for `in`/`out` interior threshold transitions. */
function buildInteriorTransition(direction: 'in' | 'out', pathKind: PathKind | undefined): ExitDescriptionScaffoldResult {
    const noun = interiorNoun(pathKind)
    const usesThrough = noun === 'passage' || noun === 'gap'

    if (direction === 'in') {
        if (usesThrough) {
            return { forward: `A ${noun} leads through.`, backward: `A ${noun} leads back out.` }
        }
        return { forward: `A ${noun} opens into the space beyond.`, backward: `A ${noun} leads back outside.` }
    }
    // out
    if (usesThrough) {
        return { forward: `A ${noun} leads back out.`, backward: `A ${noun} leads back through.` }
    }
    return { forward: `A ${noun} opens back outside.`, backward: `A ${noun} leads back inside.` }
}

/** Build scaffold for `up`/`down` vertical transitions. */
function buildVerticalTransition(direction: 'up' | 'down', pathKind: PathKind | undefined): ExitDescriptionScaffoldResult {
    const isUp = direction === 'up'
    const { article, noun } = verticalNoun(pathKind)
    const subject = article ? `${article} ${noun}` : noun

    if (pathKind === 'ladder') {
        return isUp
            ? { forward: `${subject} ascends above.`, backward: `${subject} descends below.` }
            : { forward: `${subject} drops below.`, backward: `${subject} rises above.` }
    }
    // stair or default (Stone steps)
    return isUp
        ? { forward: `${subject} ascend above.`, backward: `${subject} descend below.` }
        : { forward: `${subject} descend below.`, backward: `${subject} ascend above.` }
}

/** Build scaffold for cardinal/diagonal with a threshold-type pathKind (door/gate/gap/passage/stair/ladder). */
function buildThresholdCardinal(direction: Direction, pathKind: PathKind | undefined): ExitDescriptionScaffoldResult {
    const noun = interiorNoun(pathKind)
    const opp = getOppositeDirection(direction)
    return {
        forward: `A ${noun} leads ${direction}.`,
        backward: `A ${noun} leads back ${opp}.`
    }
}

/** Build scaffold for cardinal/diagonal with non-level grade. */
function buildGradedCardinal(
    direction: Direction,
    pathKind: PathKind | undefined,
    grade: 'ascending' | 'descending',
    bucket: DurationBucket
): ExitDescriptionScaffoldResult {
    const { article, noun } = journeyNoun(pathKind, bucket)
    const prefix = article ? `${article} ${noun}` : noun
    const opp = getOppositeDirection(direction)

    if (grade === 'ascending') {
        return { forward: `${prefix} climbs ${direction}.`, backward: `${prefix} slopes back ${opp}.` }
    }
    return { forward: `${prefix} descends ${direction}.`, backward: `${prefix} climbs back ${opp}.` }
}

/** Build standard journey cardinal/diagonal scaffold (no threshold pathKind, level/absent grade). */
function buildJourneyCardinal(direction: Direction, bucket: DurationBucket, pathKind: PathKind | undefined): ExitDescriptionScaffoldResult {
    const { article, noun } = journeyNoun(pathKind, bucket)
    const opp = getOppositeDirection(direction)

    switch (bucket) {
        case 'threshold':
            return {
                forward: `${article} ${noun} leads ${direction}.`,
                backward: `${article} ${noun} leads back ${opp}.`
            }
        case 'near':
            return {
                forward: `A short ${noun} leads ${direction}.`,
                backward: `A short ${noun} leads back ${opp}.`
            }
        case 'moderate':
            return {
                forward: `${article} ${noun} continues ${direction}.`,
                backward: `${article} ${noun} runs back ${opp}.`
            }
        case 'far': {
            const farPrefix = pathKind ? `${article} ${noun}` : `A worn ${noun}`
            return {
                forward: `${farPrefix} stretches ${direction}.`,
                backward: `${farPrefix} leads back ${opp}.`
            }
        }
        case 'distant': {
            const distArticle = pathKind ? article : 'The'
            const distNoun = pathKind ? noun : 'road'
            return {
                forward: `${distArticle} ${distNoun} disappears ${direction} into the distance.`,
                backward: `${distArticle} ${distNoun} leads back ${opp}.`
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic pair of exit descriptions (scaffold) from structural edge data.
 *
 * Two-stage generation model:
 * 1. **Scaffold** (this function): deterministic, instant, no AI required.
 * 2. **AI garnish** (optional, ExitDescriptionService): short trailing clause
 *    appended when destination context is available and AI is enabled.
 *
 * All outputs satisfy the Exit Language Contract (EL-01 through EL-09):
 * - Single sentence, 15–120 characters.
 * - No weather, time-of-day, proper nouns, or numeric durations.
 * - `in`/`out` uses "through/into/back out" framing.
 * - `up`/`down` uses stair/ladder register.
 * - Cardinal/diagonal: climbing/descending verbs only when grade hint present.
 */
export function generateExitDescriptionScaffold(input: ExitDescriptionScaffoldInput): ExitDescriptionScaffoldResult {
    const { direction, durationBucket, pathKind, grade } = input

    // 1. Interior threshold transitions (in/out)
    if (direction === 'in' || direction === 'out') {
        return buildInteriorTransition(direction, pathKind)
    }

    // 2. Vertical transitions (up/down)
    if (direction === 'up' || direction === 'down') {
        return buildVerticalTransition(direction, pathKind)
    }

    // 3. Cardinal/diagonal

    // 3a. Threshold-type pathKind → always threshold register
    if (pathKind !== undefined && (THRESHOLD_PATH_KINDS.has(pathKind) || VERTICAL_PATH_KINDS.has(pathKind))) {
        return buildThresholdCardinal(direction, pathKind)
    }

    // 3b. Non-level grade → climbing/descending language
    if (grade === 'ascending' || grade === 'descending') {
        return buildGradedCardinal(direction, pathKind, grade, durationBucket)
    }

    // 3c. Standard journey
    return buildJourneyCardinal(direction, durationBucket, pathKind)
}
