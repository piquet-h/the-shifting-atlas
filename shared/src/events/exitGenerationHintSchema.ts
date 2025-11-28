/**
 * Exit Generation Hint Schema (Zod validation)
 *
 * Defines the payload schema for exit generation hint events emitted when
 * a player attempts to move in a direction without an existing exit.
 *
 * Queue Topic: ExitGenerationHints
 * Idempotency Key: ${originLocationId}:${dir}
 *
 * See docs/architecture/exit-generation-hints.md for specification.
 */
import { z } from 'zod'
import { DIRECTIONS, type Direction } from '../domainModels.js'

/**
 * Zod schema for Direction type.
 * Validates that a string is one of the canonical Direction values.
 *
 * Note: The type assertion is required because Zod's z.enum() expects a tuple type
 * [T, ...T[]], while DIRECTIONS is typed as readonly Direction[]. Both represent
 * the same values at runtime.
 */
export const DirectionSchema = z.enum(DIRECTIONS as unknown as readonly [Direction, ...Direction[]])

/**
 * Exit Generation Hint payload schema.
 *
 * Carried within the WorldEventEnvelope.payload for 'Navigation.Exit.GenerationHint' events.
 */
export const ExitGenerationHintPayloadSchema = z.object({
    /** Canonical direction requested (validated against Direction enum) */
    dir: DirectionSchema,
    /** Origin location ID where the exit is requested */
    originLocationId: z.string().uuid(),
    /** Player ID who triggered the generation request */
    playerId: z.string().uuid(),
    /** ISO 8601 timestamp when the request was made */
    timestamp: z.string().datetime(),
    /** True if this hint was previously debounced (and is now being emitted) */
    debounced: z.boolean()
})

export type ExitGenerationHintPayload = z.infer<typeof ExitGenerationHintPayloadSchema>

/**
 * Validate an exit generation hint payload.
 * Returns validated data on success or throws ZodError with details on failure.
 */
export function validateExitGenerationHintPayload(data: unknown): ExitGenerationHintPayload {
    return ExitGenerationHintPayloadSchema.parse(data)
}

/**
 * Safe validation that returns success/error tuple instead of throwing.
 */
export function safeValidateExitGenerationHintPayload(
    data: unknown
): { success: true; data: ExitGenerationHintPayload } | { success: false; error: z.ZodError<unknown> } {
    const result = ExitGenerationHintPayloadSchema.safeParse(data)
    if (result.success) {
        return { success: true, data: result.data }
    }
    return { success: false, error: result.error }
}

/**
 * Build the idempotency key for an exit generation hint.
 * Pattern: ${originLocationId}:${dir}
 *
 * This key ensures that duplicate hints for the same location/direction
 * combination are collapsed by the queue processor.
 */
export function buildExitHintIdempotencyKey(originLocationId: string, dir: string): string {
    return `${originLocationId}:${dir}`
}

/**
 * DLQ category for exit generation hints.
 * Used to classify dead-letter records for filtering and alerting.
 */
export type ExitHintDLQCategory =
    | 'invalid-payload' // Payload failed schema validation
    | 'expired-intent' // Hint is too old to process (timestamp beyond threshold)

/**
 * Check if an exit generation hint is expired.
 *
 * @param timestamp - ISO 8601 timestamp from the hint payload
 * @param maxAgeMs - Maximum age in milliseconds (default: 5 minutes)
 * @returns true if the hint is expired
 */
export function isExitHintExpired(timestamp: string, maxAgeMs: number = 5 * 60 * 1000): boolean {
    const hintTime = new Date(timestamp).getTime()
    const now = Date.now()
    return now - hintTime > maxAgeMs
}
