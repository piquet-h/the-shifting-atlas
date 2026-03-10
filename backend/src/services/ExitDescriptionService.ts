/**
 * Exit Description Service
 *
 * Implements the two-stage exit description model:
 *   1. Deterministic scaffold  — instant, no AI, always available
 *   2. Optional AI garnish     — short destination-facing trailing clause when AI is enabled
 *
 * The scaffold provides conservative, bucket-appropriate language that satisfies
 * the Exit Language Contract. The AI garnish appends a short trailing clause
 * (e.g., " toward the old gatehouse") when destination context is available.
 *
 * Fallback behaviour:
 *   - AI disabled / unavailable → scaffold-only result (garnishApplied = false)
 *   - AI garnish fails bounds/structure checks → scaffold-only (garnishApplied = false)
 *   - `in`/`out` directions never receive a garnish
 *
 * Telemetry:
 *   - Navigation.Exit.TailoringStarted — AI garnish about to be attempted; direction/durationBucket/hasDestination
 *   - Navigation.Exit.TailoringSkipped — tailoring bypassed (no AI, no destination, or in/out direction); includes reason
 *   - Navigation.Exit.DescriptionGenerated — garnish accepted; direction/durationBucket/hasDestination/validatorOutcome/charLength
 *   - Navigation.Exit.DescriptionRejected — garnish failed safety checks; direction/hasDestination/checkId/rejectionReason
 *
 * Skipped-tailoring policy:
 *   When AI is unavailable, no destination context is present, or the direction is `in`/`out`,
 *   a TailoringSkipped event is emitted with an explicit `reason` dimension. No garnish is attempted.
 *
 * See also:
 *   - docs/architecture/exit-language-contract.md (authoritative spec)
 *   - backend/src/services/exitDescriptionScaffold.ts (scaffold generator + bucket types)
 */

import type { Direction } from '@piquet-h/shared'
import { inject, injectable, optional } from 'inversify'
import { TOKENS } from '../di/tokens.js'
import { TelemetryService } from '../telemetry/TelemetryService.js'
import type { IAzureOpenAIClient } from './azureOpenAIClient.js'
import { generateExitDescriptionScaffold, travelDurationMsToBucket } from './exitDescriptionScaffold.js'
import type { DurationBucket, ExitDescriptionScaffoldInput, Grade, PathKind, TransitionKind } from './exitDescriptionScaffold.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum tokens for the AI garnish call (short trailing clause only). */
const GARNISH_MAX_TOKENS = 20

/** Temperature for AI garnish — conservative to stay on-topic. */
const GARNISH_TEMPERATURE = 0.3

/** Timeout for AI garnish call. Short: falls back gracefully on timeout. */
const GARNISH_TIMEOUT_MS = 5_000

/** Maximum characters the garnish clause may add to the forward description. */
const GARNISH_MAX_CLAUSE_CHARS = 45

/** Minimum characters for a non-trivial garnish clause. */
const GARNISH_MIN_CLAUSE_CHARS = 4

/** Hard maximum length of any exit description (EL-01). */
const DESCRIPTION_MAX_CHARS = 120

/** Patterns that must not appear in any generated description. */
const WEATHER_PATTERN =
    /\b(fog|mist|rain|snow|storm|wind|cloud|ice|frost|morning|evening|dusk|dawn|sunset|twilight|moonlit|sunlit|starlit)\b/i

/**
 * Capitalised words that are not proper nouns and may appear after sentence start.
 * Used by the simplified EL-07 check.
 */
const DIRECTION_KEYWORDS = new Set([
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
    'Out',
    'The',
    'A',
    'An',
    'Stone'
])

// ---------------------------------------------------------------------------
// Garnish safety checks (lightweight EL-equivalent)
// ---------------------------------------------------------------------------

type GarnishCheckResult = { ok: true } | { ok: false; checkId: string; reason: string }

function checkGarnishedDescription(text: string, destinationName: string | undefined): GarnishCheckResult {
    // EL-01: length bound
    if (text.length > DESCRIPTION_MAX_CHARS) {
        return { ok: false, checkId: 'EL-01', reason: `Length ${text.length} > ${DESCRIPTION_MAX_CHARS}` }
    }

    // EL-03: single sentence
    const terminalCount = (text.match(/[.!?]/g) || []).length
    if (terminalCount > 1) {
        return { ok: false, checkId: 'EL-03', reason: 'Multiple sentence-terminal marks found' }
    }

    // EL-09: no weather/time-of-day terms
    if (WEATHER_PATTERN.test(text)) {
        return { ok: false, checkId: 'EL-09', reason: 'Weather or time-of-day term detected' }
    }

    // Simplified EL-07: detect capitalised tokens in non-sentence-start positions
    // that are not direction keywords and not the provided destination name.
    if (!destinationName) {
        const words = text.split(/\s+/)
        for (let i = 1; i < words.length; i++) {
            const word = words[i].replace(/[^A-Za-z]/g, '')
            if (word.length < 2) continue
            if (/^[A-Z][a-z]+$/.test(word) && !DIRECTION_KEYWORDS.has(word)) {
                return { ok: false, checkId: 'EL-07', reason: `Possible proper noun without destination context: "${word}"` }
            }
        }
    }

    return { ok: true }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Input for a single exit description generation request.
 *
 * Combines structural edge data (direction, bucket, hints) with optional
 * destination context that unlocks the AI garnish path.
 */
export interface ExitDescriptionServiceInput {
    /** Exit direction. */
    direction: Direction
    /**
     * Travel duration bucket.
     * Derive from the edge's `travelDurationMs` via `travelDurationMsToBucket()`.
     */
    durationBucket: DurationBucket
    /** Optional structural path kind hint (persisted on edge). */
    pathKind?: PathKind
    /** Optional topographic grade hint (persisted on edge). */
    grade?: Grade
    /** Optional spatial transition type hint (persisted on edge). */
    transitionKind?: TransitionKind
    /**
     * Short (1–2 sentence) snippet describing the destination location.
     * Provides spatial/terrain context for the AI garnish.
     * Absent for stub destinations.
     */
    destinationSnippet?: string
    /**
     * Canonical name of the destination location, if known.
     * When provided, this name may appear in the forward garnish clause.
     */
    destinationName?: string
    /**
     * Additional tokens allowed in the generated text.
     * Reserved for future use with the full shared validator.
     */
    contextTokens?: string[]
}

/**
 * Result of a single exit description generation request.
 */
export interface ExitDescriptionServiceResult {
    /** Forward description: origin side, looking toward destination. */
    forward: string
    /** Backward description: destination side, looking back toward origin. */
    backward: string
    /** `true` when an AI garnish clause was successfully appended to `forward`. */
    garnishApplied: boolean
}

/**
 * Exit Description Service interface.
 */
export interface IExitDescriptionService {
    /**
     * Generate exit descriptions for a single edge.
     *
     * Always returns a valid result. Falls back to scaffold-only if AI is
     * unavailable, disabled, or produces invalid output.
     */
    generateDescription(input: ExitDescriptionServiceInput): Promise<ExitDescriptionServiceResult>
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Exit Description Service — scaffold + optional AI garnish.
 *
 * The AI client is optional: when absent (NullAzureOpenAIClient or not bound),
 * the service returns scaffold-only descriptions without error.
 */
@injectable()
export class ExitDescriptionService implements IExitDescriptionService {
    constructor(
        @inject(TOKENS.AzureOpenAIClient) @optional() private readonly aiClient: IAzureOpenAIClient | undefined,
        @inject(TelemetryService) private readonly telemetry: TelemetryService
    ) {}

    async generateDescription(input: ExitDescriptionServiceInput): Promise<ExitDescriptionServiceResult> {
        // Stage 1: deterministic scaffold (always succeeds)
        const scaffoldInput: ExitDescriptionScaffoldInput = {
            direction: input.direction,
            durationBucket: input.durationBucket,
            pathKind: input.pathKind,
            grade: input.grade,
            transitionKind: input.transitionKind
        }
        const scaffold = generateExitDescriptionScaffold(scaffoldInput)

        // Stage 2: optional AI garnish
        return this.tryApplyGarnish(input, scaffold)
    }

    // ---------------------------------------------------------------------------
    // Garnish logic
    // ---------------------------------------------------------------------------

    /**
     * Attempt to append an AI garnish clause to the forward description.
     * Returns scaffold-only on any failure condition.
     *
     * Telemetry emitted:
     * - Navigation.Exit.TailoringSkipped  — when conditions prevent any attempt (no AI / no dest / threshold dir)
     * - Navigation.Exit.TailoringStarted  — when AI call is about to be made
     * - Navigation.Exit.DescriptionRejected — when validator rejects the garnished text
     * - Navigation.Exit.DescriptionGenerated — when garnish is accepted
     */
    private async tryApplyGarnish(
        input: ExitDescriptionServiceInput,
        scaffold: { forward: string; backward: string }
    ): Promise<ExitDescriptionServiceResult> {
        // Skip garnish conditions:
        // 1. No AI client
        // 2. No destination context (garnish is destination-facing — needs something to reference)
        // 3. in/out — threshold transitions use "through/into" framing, no journey clause
        const hasDestination = !!(input.destinationSnippet || input.destinationName)

        if (!this.aiClient) {
            this.telemetry.trackGameEvent('Navigation.Exit.TailoringSkipped', {
                direction: input.direction,
                durationBucket: input.durationBucket,
                hasDestination,
                reason: 'no_ai'
            })
            return { ...scaffold, garnishApplied: false }
        }
        if (!hasDestination) {
            this.telemetry.trackGameEvent('Navigation.Exit.TailoringSkipped', {
                direction: input.direction,
                durationBucket: input.durationBucket,
                hasDestination,
                reason: 'no_destination'
            })
            return { ...scaffold, garnishApplied: false }
        }
        if (input.direction === 'in' || input.direction === 'out') {
            this.telemetry.trackGameEvent('Navigation.Exit.TailoringSkipped', {
                direction: input.direction,
                durationBucket: input.durationBucket,
                hasDestination,
                reason: 'threshold_direction'
            })
            return { ...scaffold, garnishApplied: false }
        }

        // All conditions met — AI garnish is about to be attempted
        this.telemetry.trackGameEvent('Navigation.Exit.TailoringStarted', {
            direction: input.direction,
            durationBucket: input.durationBucket,
            hasDestination
        })

        const clause = await this.callAIGarnish(input, scaffold.forward)
        if (!clause) {
            return { ...scaffold, garnishApplied: false }
        }

        // Construct garnished forward: remove terminal period, append clause, re-add period
        const base = scaffold.forward.replace(/\.$/, '')
        const garnished = `${base}${clause}.`

        // Safety checks (lightweight EL-01/EL-03/EL-07/EL-09)
        const check = checkGarnishedDescription(garnished, input.destinationName)
        if (!check.ok) {
            this.telemetry.trackGameEvent('Navigation.Exit.DescriptionRejected', {
                direction: input.direction,
                durationBucket: input.durationBucket,
                hasDestination,
                validatorOutcome: 'rejected',
                checkId: check.checkId,
                rejectionReason: check.reason,
                attemptNumber: 1
            })
            return { ...scaffold, garnishApplied: false }
        }

        this.telemetry.trackGameEvent('Navigation.Exit.DescriptionGenerated', {
            direction: input.direction,
            durationBucket: input.durationBucket,
            hasDestination,
            validatorOutcome: 'accepted',
            pathKind: input.pathKind,
            grade: input.grade,
            charLength: garnished.length
        })

        return {
            forward: garnished,
            backward: scaffold.backward,
            garnishApplied: true
        }
    }

    /**
     * Call the AI client to generate a short garnish clause.
     * Returns the clause (starting with a space, no terminal punctuation) or null.
     */
    private async callAIGarnish(input: ExitDescriptionServiceInput, scaffoldForward: string): Promise<string | null> {
        if (!this.aiClient) return null

        const prompt = this.buildGarnishPrompt(input, scaffoldForward)

        let raw: string | null = null
        try {
            const result = await this.aiClient.generate({
                prompt,
                maxTokens: GARNISH_MAX_TOKENS,
                temperature: GARNISH_TEMPERATURE,
                timeoutMs: GARNISH_TIMEOUT_MS
            })
            raw = result?.content?.trim() ?? null
        } catch {
            return null
        }

        if (!raw) return null

        // Sanitise: strip any terminal punctuation the model may have added
        const cleaned = raw.replace(/[.!?]+$/, '').trim()

        // Enforce clause length bounds
        if (cleaned.length < GARNISH_MIN_CLAUSE_CHARS || cleaned.length > GARNISH_MAX_CLAUSE_CHARS) {
            return null
        }

        // Normalise prefix: ensure the clause starts with a single space when appended
        return cleaned.startsWith(' ') ? cleaned : ` ${cleaned}`
    }

    /**
     * Build the garnish prompt. The model is asked to return only a short trailing phrase.
     */
    private buildGarnishPrompt(input: ExitDescriptionServiceInput, scaffoldForward: string): string {
        const { direction, destinationSnippet, destinationName } = input

        // Remove terminal period — model appends to the open clause
        const base = scaffoldForward.replace(/\.$/, '')

        const destLine =
            destinationName && destinationName !== '[none]'
                ? `Destination name: ${destinationName}`
                : destinationSnippet
                  ? `Destination context: ${destinationSnippet}`
                  : ''

        return `Complete this exit description by adding ONLY a short trailing phrase (max ${GARNISH_MAX_CLAUSE_CHARS} characters):

Exit: "${base}"
Direction: ${direction}
${destLine}

Rules:
- Append ONLY a short phrase like " toward [terrain/place]" or " into [space]"
- No weather or time-of-day terms
- No proper nouns unless a destination name is explicitly given above
- Must not start a second sentence or add a period
- Maximum ${GARNISH_MAX_CLAUSE_CHARS} characters for the appended phrase

Respond with ONLY the trailing phrase to append, starting with a space:`
    }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Build an ExitDescriptionServiceInput from a direction and raw travelDurationMs.
 * Derives the DurationBucket automatically.
 */
export function buildExitDescriptionInput(
    direction: Direction,
    travelDurationMs: number | undefined,
    opts?: Omit<ExitDescriptionServiceInput, 'direction' | 'durationBucket'>
): ExitDescriptionServiceInput {
    return {
        direction,
        durationBucket: travelDurationMsToBucket(travelDurationMs),
        ...opts
    }
}

// Re-export types and helpers for consumers
export type { DurationBucket, PathKind, Grade, TransitionKind, ExitDescriptionScaffoldInput }
export { travelDurationMsToBucket }
