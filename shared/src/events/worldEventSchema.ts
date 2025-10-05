/**
 * World Event Envelope Schema (Zod validation)
 *
 * Validates the envelope shape defined in docs/architecture/world-event-contract.md.
 * Ensures idempotency, traceability, and correlation across async world processors.
 */
import { z } from 'zod'

/**
 * Actor kind controlled vocabulary
 */
export const ActorKindSchema = z.enum(['player', 'npc', 'system', 'ai'])
export type ActorKind = z.infer<typeof ActorKindSchema>

/**
 * Actor envelope sub-schema
 */
export const ActorSchema = z.object({
    kind: ActorKindSchema,
    id: z.string().uuid().optional()
})
export type Actor = z.infer<typeof ActorSchema>

/**
 * World Event Type namespace (initial types per contract doc)
 */
export const WorldEventTypeSchema = z.enum([
    'Player.Move',
    'Player.Look',
    'NPC.Tick',
    'World.Ambience.Generated',
    'World.Exit.Create',
    'Quest.Proposed'
])
export type WorldEventType = z.infer<typeof WorldEventTypeSchema>

/**
 * Complete World Event Envelope Schema
 *
 * Validates required fields per contract doc Table "Required Fields".
 * Optional fields (ingestedUtc, causationId) are marked as such.
 */
export const WorldEventEnvelopeSchema = z.object({
    eventId: z.string().uuid(),
    type: WorldEventTypeSchema,
    occurredUtc: z.string().datetime(),
    ingestedUtc: z.string().datetime().optional(),
    actor: ActorSchema,
    correlationId: z.string().uuid(),
    causationId: z.string().uuid().optional(),
    idempotencyKey: z.string().min(1),
    version: z.number().int().positive(),
    payload: z.record(z.string(), z.unknown())
})

export type WorldEventEnvelope = z.infer<typeof WorldEventEnvelopeSchema>

/**
 * Validate a world event envelope.
 * Returns validated data on success or throws ZodError with details on failure.
 */
export function validateWorldEventEnvelope(data: unknown): WorldEventEnvelope {
    return WorldEventEnvelopeSchema.parse(data)
}

/**
 * Safe validation that returns success/error tuple instead of throwing.
 */
export function safeValidateWorldEventEnvelope(
    data: unknown
): { success: true; data: WorldEventEnvelope } | { success: false; error: z.ZodError<unknown> } {
    const result = WorldEventEnvelopeSchema.safeParse(data)
    if (result.success) {
        return { success: true, data: result.data }
    }
    return { success: false, error: result.error }
}
