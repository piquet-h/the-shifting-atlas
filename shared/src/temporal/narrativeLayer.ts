/**
 * NarrativeLayer: Template-based temporal compression text generation.
 *
 * Generates lore-consistent "time passes" narratives for waiting/drift scenarios.
 * Maintains DM voice (theatrical, wry) across different duration scales.
 *
 * Phase 1 (M3c): Template-based with random selection
 * Phase 2 (M6+): AI-generated with contextual enrichment
 */

/**
 * Context for narrative generation, providing location and state information.
 */
export interface NarrativeContext {
    /** Location ID (required for context, optional for generation) */
    locationId: string
    /** Human-readable location name for interpolation (e.g., "the Broken Bridge") */
    locationDescription?: string
    /** Weather layer data (future use) */
    weatherLayer?: string
    /** Player state data (future use) */
    playerState?: unknown
}

/**
 * Interface for temporal narrative generation.
 */
export interface INarrativeLayer {
    /**
     * Generate wait narrative for player catching up to world clock.
     * @param durationMs Duration in milliseconds
     * @param context Optional narrative context (location, state)
     * @returns Narrative text
     */
    generateWaitNarrative(durationMs: number, context?: NarrativeContext): string

    /**
     * Generate compression narrative for player far ahead of world clock.
     * @param durationMs Duration in milliseconds
     * @param context Optional narrative context (location, state)
     * @returns Narrative text
     */
    generateCompressNarrative(durationMs: number, context?: NarrativeContext): string
}

/**
 * Duration bucket for template selection.
 */
enum DurationBucket {
    Short = 'short', // < 1 minute
    Medium = 'medium', // 1 min - 1 hour
    Long = 'long', // 1 hour - 1 day
    VeryLong = 'veryLong' // 1+ days
}

/**
 * Duration thresholds in milliseconds.
 */
const DURATION_THRESHOLDS = {
    ONE_MINUTE: 60000,
    ONE_HOUR: 3600000,
    ONE_DAY: 86400000
} as const

/**
 * Template-based narrative layer implementation.
 */
export class NarrativeLayer implements INarrativeLayer {
    /**
     * Wait narrative templates organized by duration bucket.
     * Tone: player is catching up, neutral/patient.
     */
    private readonly waitTemplates: Record<DurationBucket, string[]> = {
        [DurationBucket.Short]: ['A moment passes.', 'You wait briefly.', 'The air stirs, settling again.', 'Time passes...'],
        [DurationBucket.Medium]: [
            'Minutes drift by as you idle at {location}.',
            'You lose yourself in thought, watching the shadows shift.',
            'Time slips past like a distracted cat.',
            'Minutes pass as you wait.',
            'You idle for a while, observing your surroundings.'
        ],
        [DurationBucket.Long]: [
            'Hours pass. The sun arcs across the sky with theatrical inevitability.',
            'You wait. The world continues its business around you, indifferent as always.',
            'Time flows steadily. Eventually, as it tends to do, something happens.',
            'Hours slip by at {location}.',
            'You lose yourself in thought as the hours drift by.'
        ],
        [DurationBucket.VeryLong]: [
            'Days pass. You lose track of time, which seems unbothered by the whole affair.',
            'Seasons seem to shift. Or perhaps just your patience.',
            'Much time has passed. History marches on, dragging you along for the ride.',
            'Days pass at {location}. You lose track of time.',
            'You wait. Days turn into a blur of routine and contemplation.'
        ]
    }

    /**
     * Compression narrative templates organized by duration bucket.
     * Tone: reconciliation after drift, slightly disoriented.
     */
    private readonly compressTemplates: Record<DurationBucket, string[]> = {
        [DurationBucket.Short]: [
            'You shake off a momentary fugue.',
            'The world snaps back into focus.',
            'A brief moment of disorientation passes.',
            'You blink. Where were you?'
        ],
        [DurationBucket.Medium]: [
            "The world snaps back into focus. You've lost some time.",
            'Minutes have passed in what felt like a heartbeat.',
            'You shake off the haze. Time has been... negotiable.',
            'A fog lifts from your mind. How long has it been?',
            'You return to the present moment, time having slipped away.'
        ],
        [DurationBucket.Long]: [
            'Hours have passed. The world feels slightly different.',
            'You blink. Hours have vanished like morning mist.',
            'Time reasserts itself. Hours have drifted by unnoticed.',
            'The fog clears. Hours have passed at {location}.',
            'You emerge from a fugue state. The sun has moved significantly.'
        ],
        [DurationBucket.VeryLong]: [
            'You blink. Days have passed. Memory feels... negotiable.',
            'Reality snaps back into place. Days have vanished.',
            'You shake off a profound daze. How many days has it been?',
            'Time catches up with you at {location}. Days have passed in a blur.',
            'The world comes back into focus. Much time has passed, leaving only fragments.'
        ]
    }

    /**
     * Generate wait narrative.
     */
    generateWaitNarrative(durationMs: number, context?: NarrativeContext): string {
        const bucket = this.selectBucket(durationMs)
        const template = this.selectRandomTemplate(this.waitTemplates[bucket])
        return this.interpolate(template, context)
    }

    /**
     * Generate compression narrative.
     */
    generateCompressNarrative(durationMs: number, context?: NarrativeContext): string {
        const bucket = this.selectBucket(durationMs)
        const template = this.selectRandomTemplate(this.compressTemplates[bucket])
        return this.interpolate(template, context)
    }

    /**
     * Select duration bucket based on milliseconds.
     * Boundary durations use higher bucket (e.g., exactly 1 minute -> medium).
     */
    private selectBucket(durationMs: number): DurationBucket {
        // Treat negative durations as zero
        const duration = Math.max(0, durationMs)

        if (duration < DURATION_THRESHOLDS.ONE_MINUTE) {
            return DurationBucket.Short
        }
        if (duration < DURATION_THRESHOLDS.ONE_HOUR) {
            return DurationBucket.Medium
        }
        if (duration < DURATION_THRESHOLDS.ONE_DAY) {
            return DurationBucket.Long
        }
        return DurationBucket.VeryLong
    }

    /**
     * Select random template from array.
     */
    private selectRandomTemplate(templates: string[]): string {
        const index = Math.floor(Math.random() * templates.length)
        return templates[index]
    }

    /**
     * Interpolate template with context.
     * Currently supports {location} placeholder.
     */
    private interpolate(template: string, context?: NarrativeContext): string {
        if (!template.includes('{location}')) {
            // No interpolation needed
            return template
        }

        // If context has location description, use it
        if (context?.locationDescription && context.locationDescription.trim()) {
            return template.replace(/{location}/g, context.locationDescription)
        }

        // No location context available - use generic template without location reference
        // Fall back to a template that doesn't mention location
        // For simplicity in Phase 1, we remove the location reference
        return template
            .replace(/\s*at {location}\.?/g, '.')
            .replace(/{location}/g, 'here')
            .trim()
    }
}
